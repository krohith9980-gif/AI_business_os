-- 1. Patch calculate_supplier_lead_time
CREATE OR REPLACE FUNCTION public.calculate_supplier_lead_time(
    p_variant_id UUID,
    OUT avg_lead_time INTEGER,
    OUT max_lead_time INTEGER,
    OUT is_assumed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    SELECT 
        COALESCE(ROUND(AVG(lead_days)), 7),
        COALESCE(ROUND(MAX(lead_days)), 7),
        (AVG(lead_days) IS NULL)
    INTO avg_lead_time, max_lead_time, is_assumed
    FROM (
        SELECT EXTRACT(EPOCH FROM (MAX(pr.received_at) - po.created_at)) / 86400.0 AS lead_days
        FROM public.purchase_orders po
        JOIN public.po_items poi ON poi.po_id = po.id
        JOIN public.purchase_receipts pr ON pr.po_id = po.id
        JOIN public.stores st ON st.id = po.store_id
        WHERE poi.variant_id = p_variant_id
          AND po.status = 'COMPLETED'
          AND pr.status = 'COMPLETED'
          AND st.is_active = true
        GROUP BY po.id, po.created_at
    ) sub;
END;
$$;

-- 2. Patch calculate_village_intelligence
CREATE OR REPLACE FUNCTION public.calculate_village_intelligence(
    p_variant_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_top_village TEXT;
    v_village_customers INTEGER;
    v_village_txns INTEGER;
    v_village_sales NUMERIC;
    v_total_sales NUMERIC;
    v_signal TEXT := NULL;
BEGIN
    SELECT COALESCE(SUM(si.quantity), 0) INTO v_total_sales
    FROM public.sale_items si
    JOIN public.sales s ON s.id = si.sale_id
    JOIN public.stores st ON st.id = s.store_id
    WHERE si.variant_id = p_variant_id
      AND s.created_at >= NOW() - INTERVAL '30 days'
      AND st.is_active = true;

    IF v_total_sales > 0 THEN
        SELECT c.village, COUNT(DISTINCT c.id), COUNT(DISTINCT s.id), COALESCE(SUM(si.quantity), 0)
        INTO v_top_village, v_village_customers, v_village_txns, v_village_sales
        FROM public.sale_items si
        JOIN public.sales s ON s.id = si.sale_id
        JOIN public.stores st ON st.id = s.store_id
        JOIN public.customers c ON c.id = s.customer_id
        WHERE si.variant_id = p_variant_id
          AND s.created_at >= NOW() - INTERVAL '30 days'
          AND c.village IS NOT NULL
          AND st.is_active = true
        GROUP BY c.village
        ORDER BY SUM(si.quantity) DESC
        LIMIT 1;

        IF v_village_customers > 3 AND v_village_txns > 15 AND (v_village_sales / v_total_sales) > 0.25 THEN
            v_signal := v_top_village || ' represents ' || ROUND((v_village_sales / v_total_sales) * 100) || '% of recent sales (' || v_village_customers || ' customers).';
        END IF;
    END IF;
    
    RETURN v_signal;
END;
$$;

-- 3. Patch calculate_product_intelligence
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
    
    v_days_out_of_stock_30 INTEGER := 0;
    v_days_out_of_stock_60 INTEGER := 0;
    v_days_out_of_stock_90 INTEGER := 0;
    
    v_selling_days_30 INTEGER := 1;
    v_selling_days_60 INTEGER := 1;
    v_selling_days_90 INTEGER := 1;
    
    v_total_sales_7d NUMERIC(14, 4) := 0;
    v_total_sales_30d NUMERIC(14, 4) := 0;
    v_total_sales_60d NUMERIC(14, 4) := 0;
    v_total_sales_90d NUMERIC(14, 4) := 0;
    
    v_max_daily_sales NUMERIC(14, 4) := 0;
    
    v_ads NUMERIC(14, 4) := 0;
    v_ads_7 NUMERIC(14, 4) := 0;
    v_ads_60 NUMERIC(14, 4) := 0;
    v_ads_90 NUMERIC(14, 4) := 0;
    
    v_current_stock NUMERIC(14, 4) := 0;
    v_incoming_stock NUMERIC(14, 4) := 0;
    
    v_avg_lead_time INTEGER;
    v_max_lead_time INTEGER;
    v_lead_time_assumed BOOLEAN;
    
    v_safety_stock NUMERIC(14, 4) := 0;
    v_reorder_point NUMERIC(14, 4) := 0;
    v_forecast_30d NUMERIC(14, 4) := 0;
    v_recommended_purchase NUMERIC(14, 4) := 0;
    v_multiplier NUMERIC(14, 4) := 1.0;
    
    v_trend public.trend_status := 'STABLE';
    v_classification public.intelligence_classification := 'NORMAL';
    v_confidence_score INTEGER := 100;
    
    i DATE;
    v_day_start_stock NUMERIC(14, 4);
    v_day_incoming NUMERIC(14, 4);
    
    v_current_month INTEGER;
    v_total_sales_year NUMERIC(14, 4) := 0;
    v_annual_ads NUMERIC(14, 4) := 0;
    v_same_month_last_year_sales NUMERIC(14, 4) := 0;
    v_same_month_2years_ago_sales NUMERIC(14, 4) := 0;
    v_month_ads NUMERIC(14, 4) := 0;
    v_last_year_month_ads NUMERIC(14, 4) := 0;
    
    v_village_signal TEXT;
BEGIN
    IF NOT public.is_org_manager_or_owner(p_organization_id) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT id INTO v_store_id FROM public.stores WHERE organization_id = p_organization_id AND is_active = true LIMIT 1;
    
    SELECT COALESCE(SUM(ib.on_hand_stock), 0) INTO v_current_stock
    FROM public.inventory_balances ib
    JOIN public.stores st ON st.id = ib.store_id
    WHERE ib.variant_id = p_variant_id AND st.is_active = true;
    
    SELECT COALESCE(SUM(poi.quantity_ordered - poi.quantity_received), 0) INTO v_incoming_stock
    FROM public.po_items poi
    JOIN public.purchase_orders po ON po.id = poi.po_id
    JOIN public.stores st ON st.id = po.store_id
    WHERE poi.variant_id = p_variant_id AND po.status IN ('ORDERED', 'PARTIAL_RECEIVED') AND st.is_active = true;

    SELECT min(im.created_at)::date INTO v_first_sale_date
    FROM public.inventory_movements im
    JOIN public.stores st ON st.id = im.store_id
    WHERE im.variant_id = p_variant_id AND im.movement_type = 'sale' AND st.is_active = true;
    
    IF v_first_sale_date IS NULL THEN
        v_days_active := 0;
    ELSE
        v_days_active := CURRENT_DATE - v_first_sale_date;
        IF v_days_active = 0 THEN v_days_active := 1; END IF;
    END IF;

    SELECT avg_lead_time, max_lead_time, is_assumed
    INTO v_avg_lead_time, v_max_lead_time, v_lead_time_assumed
    FROM public.calculate_supplier_lead_time(p_variant_id);

    IF v_lead_time_assumed THEN
        v_confidence_score := v_confidence_score - 10;
    END IF;

    SELECT COALESCE(MAX(daily_sales), 0) INTO v_max_daily_sales
    FROM (
        SELECT DATE(im.created_at) AS sale_date, SUM(im.quantity) AS daily_sales
        FROM public.inventory_movements im
        JOIN public.stores st ON st.id = im.store_id
        WHERE im.variant_id = p_variant_id AND im.movement_type = 'sale'
        AND im.created_at >= CURRENT_DATE - INTERVAL '30 days'
        AND st.is_active = true
        GROUP BY DATE(im.created_at)
    ) daily_totals;

    IF v_days_active < 14 THEN
        v_trend := 'INSUFFICIENT_DATA';
        v_classification := 'NEW_PRODUCT';
        v_confidence_score := 50;
    ELSE
        FOR i IN 1..LEAST(v_days_active, 90) LOOP
            v_day_start_stock := public.get_historical_stock_for_date(v_store_id, p_variant_id, CURRENT_DATE - i);
            
            SELECT COALESCE(SUM(im.quantity), 0) INTO v_day_incoming
            FROM public.inventory_movements im
            JOIN public.stores st ON st.id = im.store_id
            WHERE im.variant_id = p_variant_id 
              AND im.movement_type IN ('purchase_received', 'transfer_in', 'adjustment', 'customer_return')
              AND im.quantity > 0 
              AND DATE(im.created_at) = CURRENT_DATE - i
              AND st.is_active = true;

            IF v_day_start_stock <= 0 AND v_day_incoming <= 0 THEN
                IF i <= 30 THEN v_days_out_of_stock_30 := v_days_out_of_stock_30 + 1; END IF;
                IF i <= 60 THEN v_days_out_of_stock_60 := v_days_out_of_stock_60 + 1; END IF;
                IF i <= 90 THEN v_days_out_of_stock_90 := v_days_out_of_stock_90 + 1; END IF;
            END IF;
        END LOOP;
        
        v_selling_days_30 := LEAST(v_days_active, 30) - v_days_out_of_stock_30;
        IF v_selling_days_30 <= 0 THEN v_selling_days_30 := 1; END IF;
        v_selling_days_60 := LEAST(v_days_active, 60) - v_days_out_of_stock_60;
        IF v_selling_days_60 <= 0 THEN v_selling_days_60 := 1; END IF;
        
        SELECT COALESCE(SUM(im.quantity), 0) INTO v_total_sales_7d FROM public.inventory_movements im JOIN public.stores st ON st.id = im.store_id
        WHERE im.variant_id = p_variant_id AND im.movement_type = 'sale' AND im.created_at >= CURRENT_DATE - INTERVAL '7 days' AND st.is_active = true;
        
        SELECT COALESCE(SUM(im.quantity), 0) INTO v_total_sales_30d FROM public.inventory_movements im JOIN public.stores st ON st.id = im.store_id
        WHERE im.variant_id = p_variant_id AND im.movement_type = 'sale' AND im.created_at >= CURRENT_DATE - INTERVAL '30 days' AND st.is_active = true;

        SELECT COALESCE(SUM(im.quantity), 0) INTO v_total_sales_60d FROM public.inventory_movements im JOIN public.stores st ON st.id = im.store_id
        WHERE im.variant_id = p_variant_id AND im.movement_type = 'sale' AND im.created_at >= CURRENT_DATE - INTERVAL '60 days' AND st.is_active = true;
        
        v_ads := v_total_sales_30d / v_selling_days_30;
        v_ads_7 := v_total_sales_7d / LEAST(7, v_selling_days_30);
        v_ads_60 := v_total_sales_60d / v_selling_days_60;
        
        IF v_days_active > 365 THEN
            SELECT COALESCE(SUM(im.quantity), 0) INTO v_total_sales_year FROM public.inventory_movements im JOIN public.stores st ON st.id = im.store_id
            WHERE im.variant_id = p_variant_id AND im.movement_type = 'sale' AND im.created_at >= CURRENT_DATE - INTERVAL '1 year' AND st.is_active = true;
            
            v_annual_ads := v_total_sales_year / 365.0;
            IF v_annual_ads = 0 THEN v_annual_ads := 1; END IF;
            
            v_month_ads := v_ads;
            
            SELECT COALESCE(SUM(im.quantity), 0) / 30.0 INTO v_last_year_month_ads FROM public.inventory_movements im JOIN public.stores st ON st.id = im.store_id
            WHERE im.variant_id = p_variant_id AND im.movement_type = 'sale' 
            AND im.created_at >= (CURRENT_DATE - INTERVAL '1 year') - INTERVAL '30 days'
            AND im.created_at < (CURRENT_DATE - INTERVAL '1 year') AND st.is_active = true;
            
            IF v_month_ads > (v_annual_ads * 1.3) AND v_last_year_month_ads > (v_annual_ads * 1.3) THEN
                v_trend := 'SEASONAL';
                v_multiplier := v_month_ads / v_annual_ads;
            END IF;
        END IF;

        IF v_trend != 'SEASONAL' THEN
            IF v_ads_7 > v_ads * 2.0 AND v_ads > 0 THEN
                v_trend := 'SPIKE';
                v_multiplier := 1.5;
            ELSIF v_ads > v_ads_60 * 1.2 AND v_ads_60 > 0 THEN
                v_trend := 'GROWING';
                v_multiplier := 1.2;
            ELSIF v_ads < v_ads_60 * 0.8 AND v_ads_60 > 0 THEN
                v_trend := 'DECLINING';
                v_multiplier := 0.8;
            ELSE
                v_trend := 'STABLE';
            END IF;
        END IF;
        
        IF v_days_active < 30 THEN
            v_confidence_score := v_confidence_score - 20;
        END IF;
    END IF;

    IF v_trend = 'INSUFFICIENT_DATA' THEN
        v_safety_stock := 0;
        v_reorder_point := 0;
        v_forecast_30d := 0;
        v_recommended_purchase := 0;
    ELSE
        v_safety_stock := (v_max_daily_sales * v_max_lead_time) - (v_ads * v_avg_lead_time);
        IF v_safety_stock < 0 THEN v_safety_stock := 0; END IF;
        
        v_reorder_point := (v_ads * v_avg_lead_time) + v_safety_stock;
        v_forecast_30d := v_ads * 30 * v_multiplier;
        
        v_recommended_purchase := v_forecast_30d + v_safety_stock - v_current_stock - v_incoming_stock;
        IF v_recommended_purchase < 0 THEN
            v_recommended_purchase := 0;
        END IF;
        
        IF v_recommended_purchase > 0 AND v_classification != 'NEW_PRODUCT' THEN
            v_classification := 'BUY_MORE';
        END IF;
    END IF;

    v_village_signal := public.calculate_village_intelligence(p_variant_id);

    INSERT INTO public.product_intelligence_cache (
        organization_id, variant_id, avg_daily_sales, days_of_stock, 
        supplier_lead_time_days, classification, trend_status, confidence_score,
        reorder_point, safety_stock, forecast_demand_30d, recommended_purchase_base_units,
        village_signal, last_calculated_at
    ) VALUES (
        p_organization_id, p_variant_id, v_ads, 
        CASE WHEN v_ads > 0 THEN COALESCE(v_current_stock,0) / v_ads ELSE 999 END,
        v_avg_lead_time, v_classification, v_trend, v_confidence_score,
        v_reorder_point, v_safety_stock, v_forecast_30d, v_recommended_purchase,
        v_village_signal, NOW()
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
        village_signal = EXCLUDED.village_signal,
        last_calculated_at = EXCLUDED.last_calculated_at;
END;
$$;

-- 4. Patch get_intelligence_dashboard
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
        
        COALESCE((
            SELECT SUM(ib.on_hand_stock)::NUMERIC
            FROM public.inventory_balances ib
            JOIN public.stores st ON st.id = ib.store_id
            WHERE ib.variant_id = v.id AND st.is_active = true
        ), 0::NUMERIC) AS current_stock,
        
        COALESCE((
            SELECT SUM(poi.quantity_ordered - poi.quantity_received)::NUMERIC
            FROM public.po_items poi
            JOIN public.purchase_orders po ON po.id = poi.po_id
            JOIN public.stores st ON st.id = po.store_id
            WHERE poi.variant_id = v.id 
              AND po.status IN ('ORDERED', 'PARTIAL_RECEIVED')
              AND st.is_active = true
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
      AND p.is_active = true
      AND v.is_active = true
    ORDER BY pic.recommended_purchase_base_units DESC;
END;
$$;
