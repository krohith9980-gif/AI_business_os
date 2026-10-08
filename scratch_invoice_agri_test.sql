-- test_invoice_agri.sql
BEGIN;

DO $$
DECLARE
    v_org_id UUID;
    v_store_id UUID;
    v_supplier_id UUID;
    v_category_id UUID;
    v_product_id UUID;
    v_variant_id UUID;
    v_items JSONB;
    v_receipt_id UUID;
    v_res RECORD;
BEGIN
    -- 1. Setup
    SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
    SELECT id INTO v_store_id FROM public.stores WHERE organization_id = v_org_id LIMIT 1;
    SELECT id INTO v_supplier_id FROM public.suppliers WHERE organization_id = v_org_id LIMIT 1;
    
    INSERT INTO public.categories (organization_id, name)
    VALUES (v_org_id, 'Test Category') RETURNING id INTO v_category_id;

    -- 2. Create NEW product via Invoice with Agricultural Use
    v_items := jsonb_build_array(
        jsonb_build_object(
            'is_new', true,
            'product_name', 'New Agri Product ' || floor(random() * 1000)::text,
            'category_id', v_category_id,
            'purchase_cost', 100,
            'sale_cost', 150,
            'quantity', 10,
            'agricultural_use', jsonb_build_array('పత్తి (Cotton)', 'బోల్వార్మ్ / కాయతొలుచు పురుగులు (Bollworm)')
        )
    );

    v_receipt_id := public.process_invoice_purchase(
        v_store_id, v_supplier_id, 'INV-' || floor(random() * 1000)::text,
        v_items, 1000, 0, 0, 'CREDIT', NULL, 0
    );
    
    -- Verify New Product
    SELECT p.id, p.agricultural_use, v.id as variant_id 
    INTO v_res
    FROM public.products p
    JOIN public.purchase_receipt_items pri ON true
    JOIN public.po_items poi ON poi.id = pri.po_item_id
    JOIN public.product_variants v ON v.id = poi.variant_id AND v.product_id = p.id
    WHERE pri.receipt_id = v_receipt_id;

    RAISE NOTICE 'New Product Created: ID=%, AgriUse=%', v_res.id, v_res.agricultural_use;

    -- 3. Use Existing Product via Invoice
    v_items := jsonb_build_array(
        jsonb_build_object(
            'is_new', false,
            'variant_id', v_res.variant_id,
            'purchase_cost', 110,
            'sale_cost', 160,
            'quantity', 5,
            'agricultural_use', jsonb_build_array('Should be ignored')
        )
    );

    v_receipt_id := public.process_invoice_purchase(
        v_store_id, v_supplier_id, 'INV-' || floor(random() * 1000)::text,
        v_items, 550, 0, 0, 'CREDIT', NULL, 0
    );

    -- Verify Existing Product
    SELECT p.id, p.agricultural_use
    INTO v_res
    FROM public.products p
    WHERE p.id = v_res.id;

    RAISE NOTICE 'Existing Product After Invoice: ID=%, AgriUse=%', v_res.id, v_res.agricultural_use;

    -- Rollback
    RAISE EXCEPTION 'Test Passed';
END $$;
