-- Migration 0027: Dashboard RPC for Phase 3 Intelligence
-- Returns fully joined deterministic data and stock levels for a given org.

CREATE OR REPLACE FUNCTION public.get_intelligence_dashboard(p_org_id UUID)
RETURNS TABLE (
    product_id UUID,
    product_name TEXT,
    category_id UUID,
    variant_id UUID,
    variant_sku TEXT,
    item_size NUMERIC,
    unit_of_measure TEXT,
    purchase_packaging_type TEXT,
    purchase_units_per_pack INTEGER,
    current_stock NUMERIC,
    incoming_stock NUMERIC,
    avg_daily_sales NUMERIC,
    days_of_stock NUMERIC,
    supplier_lead_time_days INTEGER,
    classification public.intelligence_classification,
    trend_status public.trend_status,
    confidence_score NUMERIC,
    reorder_point NUMERIC,
    safety_stock NUMERIC,
    forecast_demand_30d NUMERIC,
    recommended_purchase_base_units NUMERIC,
    last_calculated_at TIMESTAMPTZ,
    village_signal TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Explicit RLS validation equivalent: ensure user has access to org
    IF NOT public.is_org_member(p_org_id) THEN
        RAISE EXCEPTION 'Unauthorized organization access';
    END IF;

    RETURN QUERY
    SELECT 
        p.id AS product_id,
        p.name AS product_name,
        p.category_id,
        v.id AS variant_id,
        v.sku AS variant_sku,
        v.item_size,
        v.unit_of_measure::TEXT,
        v.purchase_packaging_type::TEXT,
        v.purchase_units_per_pack,
        
        -- Current Stock
        COALESCE((
            SELECT SUM(ib.on_hand_stock)::NUMERIC
            FROM public.inventory_balances ib
            WHERE ib.variant_id = v.id
        ), 0::NUMERIC) AS current_stock,
        
        -- Incoming Stock (Only ORDERED or PARTIAL_RECEIVED, minus received)
        COALESCE((
            SELECT SUM(poi.quantity_ordered - poi.quantity_received)::NUMERIC
            FROM public.po_items poi
            JOIN public.purchase_orders po ON po.id = poi.po_id
            WHERE poi.variant_id = v.id 
              AND po.status IN ('ORDERED', 'PARTIAL_RECEIVED')
        ), 0::NUMERIC) AS incoming_stock,
        
        pic.avg_daily_sales,
        pic.days_of_stock,
        pic.supplier_lead_time_days,
        pic.classification,
        pic.trend_status,
        pic.confidence_score,
        pic.reorder_point,
        pic.safety_stock,
        pic.forecast_demand_30d,
        pic.recommended_purchase_base_units,
        pic.last_calculated_at,
        pic.village_signal
        
    FROM public.product_intelligence_cache pic
    JOIN public.product_variants v ON v.id = pic.variant_id
    JOIN public.products p ON p.id = v.product_id
    WHERE pic.organization_id = p_org_id
    ORDER BY pic.recommended_purchase_base_units DESC;
END;
$$;
