-- Migration 0033: Atomic Product Creation and Inventory Initialization

CREATE OR REPLACE FUNCTION public.create_product_with_opening_stock(
    p_organization_id UUID,
    p_store_id UUID,
    p_name TEXT,
    p_sku TEXT,
    p_purchase_cost NUMERIC,
    p_selling_price NUMERIC,
    p_opening_stock_packages INTEGER,
    p_description TEXT DEFAULT NULL,
    p_category_id UUID DEFAULT NULL,
    p_image_url TEXT DEFAULT NULL,
    p_barcode TEXT DEFAULT NULL,
    p_attributes JSONB DEFAULT NULL,
    p_tracking_mode public.tracking_mode DEFAULT 'NONE',
    p_variant_image_url TEXT DEFAULT NULL,
    p_is_active BOOLEAN DEFAULT TRUE,
    p_unit_of_measure TEXT DEFAULT 'PCS',
    p_packaging_type TEXT DEFAULT 'NONE',
    p_units_per_pack INTEGER DEFAULT 1,
    p_item_size NUMERIC DEFAULT 1
) RETURNS public.product_creation_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_derived_org_id UUID;
    v_result public.product_creation_result;
    v_base_units INTEGER;
BEGIN
    -- 1. Validate caller is authenticated
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- 2. Validate store exists and derive its organization
    SELECT organization_id INTO v_derived_org_id FROM public.stores WHERE id = p_store_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Store not found';
    END IF;

    -- 3. Verify cross-tenant protection
    IF v_derived_org_id != p_organization_id THEN
        RAISE EXCEPTION 'Store does not belong to the specified organization';
    END IF;

    -- 4. Validate caller role (must be MANAGER or OWNER of the derived organization)
    IF NOT public.is_org_manager_or_owner(v_derived_org_id) THEN
        RAISE EXCEPTION 'Unauthorized: Only Managers and Owners can create products';
    END IF;

    -- 5. Calculate base units before starting insertion (Fail fast)
    v_base_units := COALESCE(p_opening_stock_packages, 0) * COALESCE(p_units_per_pack, 1);

    IF v_base_units < 0 THEN
        RAISE EXCEPTION 'Opening stock cannot be negative';
    END IF;

    -- 6. Create the product and variant (reusing existing secure logic)
    SELECT * FROM public.create_product_with_variant(
        p_organization_id, p_name, p_sku, p_purchase_cost, p_selling_price, p_description, p_category_id, p_image_url, p_barcode, p_attributes, p_tracking_mode, p_variant_image_url, p_is_active, p_unit_of_measure, p_packaging_type, p_units_per_pack, p_item_size
    ) INTO v_result;

    -- 7. Initialize inventory atomically if requested
    IF v_base_units > 0 THEN
        PERFORM public.record_inventory_movement(
            p_store_id,
            v_result.variant_id,
            'opening_stock',
            v_base_units,
            NULL,
            'Initial opening stock',
            'RESELLABLE'
        );
    END IF;

    RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_product_with_opening_stock(
    UUID, UUID, TEXT, TEXT, NUMERIC, NUMERIC, INTEGER, TEXT, UUID, TEXT, TEXT, JSONB, public.tracking_mode, TEXT, BOOLEAN, TEXT, TEXT, INTEGER, NUMERIC
) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_product_with_opening_stock(
    UUID, UUID, TEXT, TEXT, NUMERIC, NUMERIC, INTEGER, TEXT, UUID, TEXT, TEXT, JSONB, public.tracking_mode, TEXT, BOOLEAN, TEXT, TEXT, INTEGER, NUMERIC
) TO authenticated;
