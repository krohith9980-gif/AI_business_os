-- Migration 0054: Stock Recommendations RPC

CREATE OR REPLACE FUNCTION public.calculate_stock_recommendations(
    p_organization_id UUID,
    p_store_id UUID,
    p_region TEXT,
    p_crop_name TEXT
) 
RETURNS TABLE (
    -- Agricultural Lineage (from Step 3)
    observation_id UUID,
    crop_stage TEXT,
    progress_status TEXT,
    input_category TEXT,
    agri_confidence NUMERIC,
    
    -- Variant Details
    product_name TEXT,
    variant_id UUID,
    sku TEXT,
    unit_of_measure TEXT,
    item_size NUMERIC,
    
    -- Metrics
    recent_sales_30d NUMERIC,
    historical_comparable_30d NUMERIC,
    recent_daily_velocity NUMERIC,
    historical_daily_velocity NUMERIC,
    historical_weight NUMERIC,
    demand_method TEXT,
    
    -- Inventory
    current_stock NUMERIC,
    reserved_stock NUMERIC,
    available_stock NUMERIC,
    
    -- Recommendation
    estimated_demand NUMERIC,
    recommended_reorder_quantity NUMERIC,
    history_status TEXT,
    calculation_reasoning TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_org_id UUID;
    v_agri RECORD;
    v_product RECORD;
    v_variant RECORD;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    -- 1. Security Check: Enforce tenant isolation securely via auth.uid()
    IF NOT public.is_org_member(p_organization_id) THEN
        RAISE EXCEPTION 'Unauthorized: User is not an active member of this organization.';
    END IF;

    SELECT organization_id INTO v_org_id FROM public.stores WHERE id = p_store_id;
    IF v_org_id != p_organization_id THEN
        RAISE EXCEPTION 'Unauthorized: Store does not belong to the specified organization.';
    END IF;

    IF NOT public.is_store_member(p_store_id) AND NOT public.is_org_manager_or_owner(p_organization_id) THEN
        RAISE EXCEPTION 'Unauthorized: User does not have access to this store.';
    END IF;

    -- 2. Consume Step 3 output
    FOR v_agri IN (
        SELECT * FROM public.resolve_agri_input_needs(p_organization_id, p_region, p_crop_name)
    ) LOOP
        -- Extract matched_products array and process each variant
        FOR v_product IN (
            SELECT 
                (value->>'product_id')::UUID AS product_id,
                value->>'product_name' AS prod_name
            FROM jsonb_array_elements(v_agri.matched_products)
        ) LOOP
            FOR v_variant IN (
                SELECT 
                    pv.id AS v_id, 
                    pv.sku, 
                    pv.unit_of_measure, 
                    pv.item_size
                FROM public.product_variants pv
                WHERE pv.product_id = v_product.product_id
                  AND pv.organization_id = p_organization_id
            ) LOOP
                -- Initialize variant-level output variables
                variant_id := v_variant.v_id;
                product_name := v_product.prod_name;
                sku := v_variant.sku;
                unit_of_measure := v_variant.unit_of_measure;
                item_size := v_variant.item_size;

                observation_id := v_agri.observation_id;
                crop_stage := v_agri.crop_stage;
                progress_status := v_agri.progress_status;
                input_category := v_agri.input_category;
                agri_confidence := v_agri.confidence_score;
                
                -- Calculate Sales
                SELECT COALESCE(SUM(si.quantity), 0) INTO recent_sales_30d
                FROM public.sale_items si
                JOIN public.sales s ON si.sale_id = s.id
                WHERE si.variant_id = v_variant.v_id 
                  AND s.store_id = p_store_id 
                  AND s.status = 'COMPLETED'
                  AND s.created_at >= v_now - INTERVAL '30 days';

                SELECT COALESCE(SUM(si.quantity), 0) INTO historical_comparable_30d
                FROM public.sale_items si
                JOIN public.sales s ON si.sale_id = s.id
                WHERE si.variant_id = v_variant.v_id 
                  AND s.store_id = p_store_id 
                  AND s.status = 'COMPLETED'
                  AND s.created_at >= v_now - INTERVAL '395 days'
                  AND s.created_at < v_now - INTERVAL '365 days';

                recent_daily_velocity := recent_sales_30d / 30.0;
                historical_daily_velocity := historical_comparable_30d / 30.0;
                
                -- Calculate Demand
                IF recent_sales_30d > 0 THEN
                    IF v_agri.progress_status = 'NORMAL' AND historical_comparable_30d > 0 THEN
                        -- Rule 1: NORMAL + recent + historical -> 70% recent + 30% historical
                        estimated_demand := ((0.7 * recent_daily_velocity) + (0.3 * historical_daily_velocity)) * 30.0;
                        demand_method := 'BLENDED_HISTORY';
                        historical_weight := 0.3;
                    ELSE
                        -- Rule 2 & 3: NORMAL with no history, or EARLY/DELAYED -> recent only
                        estimated_demand := recent_daily_velocity * 30.0;
                        demand_method := 'RECENT_ONLY';
                        historical_weight := 0.0;
                    END IF;
                ELSE
                    -- Rule 4 & 5: No recent sales -> Cannot estimate current demand reliably
                    estimated_demand := 0;
                    demand_method := 'INSUFFICIENT_DATA';
                    historical_weight := 0.0;
                END IF;

                -- History Status
                IF recent_sales_30d >= 5 OR (historical_comparable_30d >= 5 AND v_agri.progress_status = 'NORMAL' AND recent_sales_30d > 0) THEN
                    history_status := 'SUFFICIENT';
                ELSIF recent_sales_30d = 0 AND historical_comparable_30d = 0 THEN
                    history_status := 'NONE';
                ELSE
                    history_status := 'LIMITED';
                END IF;

                -- Calculate Inventory
                SELECT COALESCE(ib.on_hand_stock, 0) INTO current_stock
                FROM public.inventory_balances ib
                WHERE ib.store_id = p_store_id AND ib.variant_id = v_variant.v_id;
                
                IF current_stock IS NULL THEN current_stock := 0; END IF;

                SELECT COALESCE(SUM(ir.quantity), 0) INTO reserved_stock
                FROM public.inventory_reservations ir
                WHERE ir.store_id = p_store_id 
                  AND ir.variant_id = v_variant.v_id 
                  AND ir.status = 'ACTIVE' 
                  AND ir.expires_at > v_now;

                available_stock := current_stock - reserved_stock;

                -- Determine Reorder Quantity
                IF history_status = 'SUFFICIENT' THEN
                    recommended_reorder_quantity := GREATEST(0, CEIL(estimated_demand - available_stock));
                    calculation_reasoning := 'Computed 30-day inventory planning horizon using ' || demand_method || '. (Note: Calculation is uncorrected for historical stockouts).';
                ELSE
                    -- Do NOT recommend 0. Return NULL for insufficient data.
                    recommended_reorder_quantity := NULL;
                    calculation_reasoning := 'Insufficient sales history. A responsible reorder quantity cannot be calculated automatically.';
                END IF;
                
                RETURN NEXT;
            END LOOP;
        END LOOP;
    END LOOP;
END;
$$;
