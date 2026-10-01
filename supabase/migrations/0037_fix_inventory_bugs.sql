-- Migration 0037: Fix Inventory Bugs in Staging
-- Fix cross-tenant variant vulnerability in record_inventory_movement
-- Fix packaging NONE bug in create_product_with_opening_stock

-- 1. Fix create_product_with_opening_stock
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
    -- FIX: Check packaging_type for NONE to ignore units_per_pack
    v_base_units := COALESCE(p_opening_stock_packages, 0) * 
        CASE 
            WHEN p_packaging_type = 'NONE' THEN 1 
            ELSE COALESCE(p_units_per_pack, 1) 
        END;

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


-- 2. Fix record_inventory_movement
CREATE OR REPLACE FUNCTION public.record_inventory_movement(
    p_store_id UUID,
    p_variant_id UUID,
    p_movement_type public.movement_type,
    p_quantity NUMERIC,
    p_reference_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_disposition public.return_disposition DEFAULT 'RESELLABLE'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_balance RECORD;
    v_org_id UUID;
    v_active_reservations NUMERIC;
    v_available_stock NUMERIC;
    v_movement_id UUID;
    v_variant RECORD;
BEGIN
    SELECT organization_id INTO v_org_id FROM public.stores WHERE id = p_store_id;
    IF v_org_id IS NULL THEN RAISE EXCEPTION 'Store not found'; END IF;
    IF NOT public.is_store_member(p_store_id) AND NOT public.is_org_manager_or_owner(v_org_id) THEN 
        IF auth.uid() IS NOT NULL THEN
            RAISE EXCEPTION 'Unauthorized to modify inventory in this store';
        END IF;
    END IF;
    
    -- Lookup variant to ensure it exists and belongs to the same organization
    SELECT v.*
    INTO v_variant
    FROM public.product_variants v
    JOIN public.products p
      ON v.product_id = p.id
    WHERE v.id = p_variant_id
      AND p.organization_id = v_org_id
    FOR SHARE;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Variant not found or does not belong to your organization';
    END IF;

    SELECT * INTO v_balance FROM public.inventory_balances 
    WHERE store_id = p_store_id AND variant_id = p_variant_id FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.inventory_balances (store_id, organization_id, variant_id, on_hand_stock, incoming_stock, damaged_stock)
        VALUES (p_store_id, v_org_id, p_variant_id, 0, 0, 0)
        RETURNING * INTO v_balance;
    END IF;

    SELECT COALESCE(SUM(quantity), 0) INTO v_active_reservations 
    FROM public.inventory_reservations 
    WHERE store_id = p_store_id AND variant_id = p_variant_id AND status = 'ACTIVE' AND expires_at > NOW();
    
    v_available_stock := v_balance.on_hand_stock - v_active_reservations;

    CASE p_movement_type
        WHEN 'opening_stock' THEN
            UPDATE public.inventory_balances SET on_hand_stock = on_hand_stock + p_quantity WHERE id = v_balance.id;
        WHEN 'purchase_received' THEN
            UPDATE public.inventory_balances SET on_hand_stock = on_hand_stock + p_quantity WHERE id = v_balance.id;
        WHEN 'customer_return' THEN
            IF p_disposition = 'RESELLABLE' THEN
                UPDATE public.inventory_balances SET on_hand_stock = on_hand_stock + p_quantity WHERE id = v_balance.id;
            ELSE
                UPDATE public.inventory_balances SET damaged_stock = damaged_stock + p_quantity WHERE id = v_balance.id;
            END IF;
        WHEN 'transfer_in' THEN
            UPDATE public.inventory_balances SET on_hand_stock = on_hand_stock + p_quantity WHERE id = v_balance.id;
        WHEN 'sale' THEN
            IF v_available_stock < p_quantity THEN RAISE EXCEPTION 'Insufficient available stock for sale'; END IF;
            UPDATE public.inventory_balances SET on_hand_stock = on_hand_stock - p_quantity WHERE id = v_balance.id;
        WHEN 'supplier_return' THEN
            IF v_available_stock < p_quantity THEN RAISE EXCEPTION 'Insufficient available stock for supplier return'; END IF;
            UPDATE public.inventory_balances SET on_hand_stock = on_hand_stock - p_quantity WHERE id = v_balance.id;
        WHEN 'transfer_out' THEN
            IF v_available_stock < p_quantity THEN RAISE EXCEPTION 'Insufficient available stock for transfer out'; END IF;
            UPDATE public.inventory_balances SET on_hand_stock = on_hand_stock - p_quantity WHERE id = v_balance.id;
        WHEN 'damage' THEN
            IF v_available_stock < p_quantity THEN RAISE EXCEPTION 'Insufficient available stock to mark as damaged'; END IF;
            UPDATE public.inventory_balances SET on_hand_stock = on_hand_stock - p_quantity, damaged_stock = damaged_stock + p_quantity WHERE id = v_balance.id;
        WHEN 'adjustment' THEN
            UPDATE public.inventory_balances SET on_hand_stock = on_hand_stock + p_quantity WHERE id = v_balance.id;
        WHEN 'correction' THEN
            UPDATE public.inventory_balances SET on_hand_stock = on_hand_stock - p_quantity WHERE id = v_balance.id;
        ELSE RAISE EXCEPTION 'Unknown movement type';
    END CASE;

    INSERT INTO public.inventory_movements (
        store_id, variant_id, movement_type, quantity, reference_id, notes, created_by
    )
    VALUES (
        p_store_id, p_variant_id, p_movement_type, p_quantity, p_reference_id, p_notes, auth.uid()
    )
    RETURNING id INTO v_movement_id;

    RETURN v_movement_id;
END;
$$;
