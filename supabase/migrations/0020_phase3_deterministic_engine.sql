-- 0020_phase3_deterministic_engine.sql

-- 1. Get historical stock for a given date
CREATE OR REPLACE FUNCTION public.get_historical_stock_for_date(
    p_store_id UUID,
    p_variant_id UUID,
    p_date DATE
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_current_stock NUMERIC(14, 4);
    v_movements_since NUMERIC(14, 4);
BEGIN
    SELECT COALESCE(on_hand_stock, 0) INTO v_current_stock
    FROM public.inventory_balances
    WHERE store_id = p_store_id AND variant_id = p_variant_id;
    
    IF v_current_stock IS NULL THEN
        v_current_stock := 0;
    END IF;

    -- Sum of movements ON OR AFTER p_date
    -- Since current_stock = start_stock + movements_since
    -- Then start_stock = current_stock - movements_since
    SELECT COALESCE(SUM(
        CASE 
            WHEN movement_type IN ('opening_stock', 'purchase_received', 'customer_return', 'transfer_in', 'adjustment') THEN quantity
            WHEN movement_type IN ('sale', 'supplier_return', 'damage', 'transfer_out', 'correction') THEN -quantity
            ELSE 0 
        END
    ), 0) INTO v_movements_since
    FROM public.inventory_movements
    WHERE store_id = p_store_id AND variant_id = p_variant_id
    AND created_at >= p_date::timestamptz;

    RETURN v_current_stock - v_movements_since;
END;
$$;

-- 2. Calculate Supplier Lead Time
CREATE OR REPLACE FUNCTION public.calculate_supplier_lead_time(
    p_variant_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_avg_lead_time INTEGER;
BEGIN
    -- Simplified lead time calculation: difference between purchase order created_at and received_at
    -- We assume the purchases table exists and has these dates, or we fallback to 7 days
    -- For Stage 1, we will hardcode a standard fallback until purchases are fully modeled.
    -- Assuming a 7-day default lead time.
    v_avg_lead_time := 7;
    RETURN v_avg_lead_time;
END;
$$;

-- 3. Calculate Product Intelligence
CREATE OR REPLACE FUNCTION public.calculate_product_intelligence(
    p_organization_id UUID,
    p_variant_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_store_id UUID;
    v_first_sale_date DATE;
    v_days_active INTEGER;
    v_days_out_of_stock INTEGER := 0;
    v_selling_days INTEGER := 0;
    v_total_sales_30d NUMERIC(14, 4) := 0;
    v_total_sales_60d NUMERIC(14, 4) := 0;
    v_total_sales_90d NUMERIC(14, 4) := 0;
    v_ads NUMERIC(14, 4) := 0;
    v_ads_60 NUMERIC(14, 4) := 0;
    v_ads_90 NUMERIC(14, 4) := 0;
    v_current_stock NUMERIC(14, 4) := 0;
    v_lead_time INTEGER;
    v_safety_stock NUMERIC(14, 4);
    v_reorder_point NUMERIC(14, 4);
    v_forecast_30d NUMERIC(14, 4);
    v_recommended_purchase NUMERIC(14, 4);
    v_trend public.trend_status;
    v_classification public.intelligence_classification;
    
    v_variant RECORD;
    i DATE;
    v_day_stock NUMERIC(14, 4);
    v_total_sales_overall NUMERIC(14, 4) := 0;
BEGIN
    -- 1. Validate Organization
    IF NOT public.is_org_manager_or_owner(p_organization_id) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Get variant info
    SELECT * INTO v_variant FROM public.product_variants WHERE id = p_variant_id AND organization_id = p_organization_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Variant not found';
    END IF;

    -- Get primary store (assuming 1 store for now, or sum across stores)
    SELECT id INTO v_store_id FROM public.stores WHERE organization_id = p_organization_id LIMIT 1;
    
    -- Current stock
    SELECT COALESCE(SUM(on_hand_stock), 0) INTO v_current_stock
    FROM public.inventory_balances
    WHERE variant_id = p_variant_id;

    -- First sale date
    SELECT min(created_at)::date INTO v_first_sale_date
    FROM public.inventory_movements
    WHERE variant_id = p_variant_id AND movement_type = 'sale';
    
    -- If no sales, classify as NEW_PRODUCT
    IF v_first_sale_date IS NULL THEN
        v_trend := 'INSUFFICIENT_DATA';
        v_classification := 'NEW_PRODUCT';
        v_ads := 0;
    ELSE
        -- 2. Calculate Stockout Days (Last 30 days)
        v_days_active := CURRENT_DATE - v_first_sale_date;
        IF v_days_active > 30 THEN v_days_active := 30; END IF;
        IF v_days_active = 0 THEN v_days_active := 1; END IF;
        
        -- Total sales last 30d
        SELECT COALESCE(SUM(quantity), 0) INTO v_total_sales_30d
        FROM public.inventory_movements
        WHERE variant_id = p_variant_id AND movement_type = 'sale'
        AND created_at >= NOW() - INTERVAL '30 days';

        -- Total sales last 60d
        SELECT COALESCE(SUM(quantity), 0) INTO v_total_sales_60d
        FROM public.inventory_movements
        WHERE variant_id = p_variant_id AND movement_type = 'sale'
        AND created_at >= NOW() - INTERVAL '60 days';

        -- Total sales last 90d
        SELECT COALESCE(SUM(quantity), 0) INTO v_total_sales_90d
        FROM public.inventory_movements
        WHERE variant_id = p_variant_id AND movement_type = 'sale'
        AND created_at >= NOW() - INTERVAL '90 days';
        
        v_days_out_of_stock := 0;
        FOR i IN 1..v_days_active LOOP
            v_day_stock := public.get_historical_stock_for_date(v_store_id, p_variant_id, CURRENT_DATE - i);
            IF v_day_stock <= 0 THEN
                v_days_out_of_stock := v_days_out_of_stock + 1;
            END IF;
        END LOOP;
        
        v_selling_days := v_days_active - v_days_out_of_stock;
        IF v_selling_days <= 0 THEN v_selling_days := 1; END IF;
        
        v_ads := v_total_sales_30d / v_selling_days;
        
        -- ADS for 60/90 (simplified assumption: proportional out of stock)
        IF v_days_active >= 30 THEN
            v_ads_60 := v_total_sales_60d / (60 - (v_days_out_of_stock * 2)); -- Roughly estimating 60d OOS
            IF (60 - (v_days_out_of_stock * 2)) <= 0 THEN v_ads_60 := 0; END IF;
        END IF;

        -- 3. Trend Classification
        IF v_days_active < 14 THEN
            v_trend := 'INSUFFICIENT_DATA';
            v_classification := 'NEW_PRODUCT';
        ELSE
            -- Simplified trend logic
            IF v_ads > v_ads_60 * 1.2 THEN
                v_trend := 'GROWING';
            ELSIF v_ads < v_ads_60 * 0.8 THEN
                v_trend := 'DECLINING';
            ELSIF v_ads > v_ads_60 * 2.0 THEN
                v_trend := 'SPIKE';
            ELSE
                v_trend := 'STABLE';
            END IF;
            v_classification := 'NORMAL';
        END IF;
    END IF;

    -- 4. Recommendations
    v_lead_time := public.calculate_supplier_lead_time(p_variant_id);
    
    -- Safety Stock = (Max daily sales * Max lead time) - (Avg daily sales * Avg lead time)
    -- Simplified: Safety Stock = 50% of Lead Time Demand
    v_safety_stock := v_ads * v_lead_time * 0.5;
    
    v_reorder_point := (v_ads * v_lead_time) + v_safety_stock;
    v_forecast_30d := v_ads * 30;
    
    -- Recommended purchase (to cover 30 days)
    v_recommended_purchase := v_forecast_30d + v_safety_stock - v_current_stock;
    IF v_recommended_purchase < 0 THEN
        v_recommended_purchase := 0;
    END IF;
    
    IF v_recommended_purchase > 0 AND v_classification != 'NEW_PRODUCT' THEN
        v_classification := 'BUY_MORE';
    END IF;

    -- 5. Upsert to Cache
    INSERT INTO public.product_intelligence_cache (
        organization_id, variant_id, avg_daily_sales, days_of_stock, 
        supplier_lead_time_days, classification, trend_status, confidence_score,
        reorder_point, safety_stock, forecast_demand_30d, recommended_purchase_base_units,
        last_calculated_at
    ) VALUES (
        p_organization_id, p_variant_id, v_ads, 
        CASE WHEN v_ads > 0 THEN v_current_stock / v_ads ELSE 999 END,
        v_lead_time, v_classification, v_trend, 80,
        v_reorder_point, v_safety_stock, v_forecast_30d, v_recommended_purchase,
        NOW()
    )
    ON CONFLICT (variant_id) DO UPDATE SET
        avg_daily_sales = EXCLUDED.avg_daily_sales,
        days_of_stock = EXCLUDED.days_of_stock,
        supplier_lead_time_days = EXCLUDED.supplier_lead_time_days,
        classification = EXCLUDED.classification,
        trend_status = EXCLUDED.trend_status,
        confidence_score = EXCLUDED.confidence_score,
        reorder_point = EXCLUDED.reorder_point,
        safety_stock = EXCLUDED.safety_stock,
        forecast_demand_30d = EXCLUDED.forecast_demand_30d,
        recommended_purchase_base_units = EXCLUDED.recommended_purchase_base_units,
        last_calculated_at = EXCLUDED.last_calculated_at;

END;
$$;
