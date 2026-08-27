-- Migration 0016: True Base Inventory and Product Measurement Upgrade

-- 1. Add item_size to product_variants
ALTER TABLE public.product_variants
ADD COLUMN IF NOT EXISTS item_size NUMERIC(14, 4) NOT NULL DEFAULT 1;

-- 2. Alter inventory columns to NUMERIC to safely store decimals (e.g. 1.5 L)
DROP VIEW IF EXISTS public.vw_inventory_available;

ALTER TABLE public.inventory_balances
ALTER COLUMN on_hand_stock TYPE NUMERIC(14, 4),
ALTER COLUMN incoming_stock TYPE NUMERIC(14, 4),
ALTER COLUMN damaged_stock TYPE NUMERIC(14, 4);

ALTER TABLE public.inventory_movements
ALTER COLUMN quantity TYPE NUMERIC(14, 4);

ALTER TABLE public.inventory_reservations
ALTER COLUMN quantity TYPE NUMERIC(14, 4);

CREATE OR REPLACE VIEW public.vw_inventory_available AS
SELECT 
    b.store_id, 
    b.variant_id, 
    b.on_hand_stock,
    COALESCE(SUM(r.quantity) FILTER (WHERE r.status = 'ACTIVE' AND r.expires_at > NOW()), 0) AS active_reserved_stock,
    b.on_hand_stock - COALESCE(SUM(r.quantity) FILTER (WHERE r.status = 'ACTIVE' AND r.expires_at > NOW()), 0) AS available_stock
FROM public.inventory_balances b
LEFT JOIN public.inventory_reservations r 
    ON b.store_id = r.store_id AND b.variant_id = r.variant_id
GROUP BY b.store_id, b.variant_id, b.on_hand_stock;

-- 3. Update create_product_with_variant signature to accept p_item_size
DROP FUNCTION IF EXISTS public.create_product_with_variant(UUID, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, UUID, TEXT, TEXT, JSONB, public.tracking_mode, TEXT, BOOLEAN, TEXT, TEXT, INTEGER);

CREATE OR REPLACE FUNCTION public.create_product_with_variant(
    p_organization_id UUID,
    p_name TEXT,
    p_sku TEXT,
    p_purchase_cost NUMERIC,
    p_selling_price NUMERIC,
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
)
RETURNS public.product_creation_result
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_prof_id UUID := auth.uid();
    v_product_id UUID;
    v_variant_id UUID;
    v_result public.product_creation_result;
BEGIN
    -- 1. Validate caller is authenticated
    IF v_prof_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- 2. Validate organization access/role (MANAGER or OWNER required)
    IF NOT public.is_org_manager_or_owner(p_organization_id) THEN
        RAISE EXCEPTION 'Unauthorized: Only Managers and Owners can create products';
    END IF;

    -- 3. Validate required product information
    IF p_name IS NULL OR trim(p_name) = '' THEN
        RAISE EXCEPTION 'Product name is required';
    END IF;

    IF p_sku IS NULL OR trim(p_sku) = '' THEN
        RAISE EXCEPTION 'SKU is required';
    END IF;

    IF p_purchase_cost IS NULL OR p_purchase_cost < 0 THEN
        RAISE EXCEPTION 'Purchase cost must be a valid non-negative number';
    END IF;

    IF p_selling_price IS NULL OR p_selling_price < 0 THEN
        RAISE EXCEPTION 'Selling price must be a valid non-negative number';
    END IF;
    
    IF p_packaging_type != 'NONE' AND (p_units_per_pack IS NULL OR p_units_per_pack < 1) THEN
        RAISE EXCEPTION 'Units per pack must be at least 1 when packaging is enabled';
    END IF;

    -- Pre-check SKU uniqueness for clear error message
    IF EXISTS (SELECT 1 FROM public.product_variants WHERE organization_id = p_organization_id AND sku = trim(p_sku)) THEN
        RAISE EXCEPTION 'A product variant with this SKU already exists';
    END IF;

    -- Pre-check Barcode uniqueness
    IF p_barcode IS NOT NULL AND trim(p_barcode) != '' THEN
        IF EXISTS (SELECT 1 FROM public.product_variants WHERE organization_id = p_organization_id AND barcode = trim(p_barcode)) THEN
            RAISE EXCEPTION 'A product variant with this Barcode already exists';
        END IF;
    END IF;

    -- 4. Validate category_id (must belong to the same organization)
    IF p_category_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.categories 
            WHERE id = p_category_id AND organization_id = p_organization_id
        ) THEN
            RAISE EXCEPTION 'Invalid category or category does not belong to the organization';
        END IF;
    END IF;

    -- 5. Create the product
    INSERT INTO public.products (
        organization_id, category_id, name, description, image_url, is_active
    )
    VALUES (
        p_organization_id, p_category_id, trim(p_name), p_description, p_image_url, p_is_active
    )
    RETURNING id INTO v_product_id;

    -- 6. Create its initial product_variant
    INSERT INTO public.product_variants (
        product_id, organization_id, sku, barcode, attributes, 
        purchase_cost, selling_price, tracking_mode, image_url, is_active,
        unit_of_measure, packaging_type, units_per_pack, item_size
    )
    VALUES (
        v_product_id, p_organization_id, trim(p_sku), 
        NULLIF(trim(p_barcode), ''), p_attributes, 
        p_purchase_cost, p_selling_price, p_tracking_mode, p_variant_image_url, p_is_active,
        p_unit_of_measure, p_packaging_type, p_units_per_pack, p_item_size
    )
    RETURNING id INTO v_variant_id;

    -- 7. Return IDs
    v_result.product_id := v_product_id;
    v_result.variant_id := v_variant_id;
    
    RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_product_with_variant(UUID, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, UUID, TEXT, TEXT, JSONB, public.tracking_mode, TEXT, BOOLEAN, TEXT, TEXT, INTEGER, NUMERIC) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_product_with_variant(UUID, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, UUID, TEXT, TEXT, JSONB, public.tracking_mode, TEXT, BOOLEAN, TEXT, TEXT, INTEGER, NUMERIC) TO authenticated;

-- 4. Update record_inventory_movement to handle base conversion
CREATE OR REPLACE FUNCTION public.record_inventory_movement(
    p_store_id UUID,
    p_variant_id UUID,
    p_movement_type public.movement_type,
    p_quantity INTEGER, -- Kept as INTEGER because callers pass physical items
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
    v_actual_quantity NUMERIC(14, 4);
BEGIN
    SELECT organization_id INTO v_org_id FROM public.stores WHERE id = p_store_id;
    IF v_org_id IS NULL THEN RAISE EXCEPTION 'Store not found'; END IF;
    IF NOT public.is_store_member(p_store_id) AND NOT public.is_org_manager_or_owner(v_org_id) THEN 
        IF auth.uid() IS NOT NULL THEN
            RAISE EXCEPTION 'Unauthorized to modify inventory in this store';
        END IF;
    END IF;
    
    -- Lookup variant to get item_size
    SELECT * INTO v_variant FROM public.product_variants WHERE id = p_variant_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Variant not found'; END IF;

    -- Multiply physical items by item size to get TRUE base unit inventory quantity
    v_actual_quantity := p_quantity * COALESCE(v_variant.item_size, 1);

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
            UPDATE public.inventory_balances SET on_hand_stock = on_hand_stock + v_actual_quantity WHERE id = v_balance.id;
        WHEN 'purchase_received' THEN
            UPDATE public.inventory_balances SET on_hand_stock = on_hand_stock + v_actual_quantity WHERE id = v_balance.id;
        WHEN 'customer_return' THEN
            IF p_disposition = 'RESELLABLE' THEN
                UPDATE public.inventory_balances SET on_hand_stock = on_hand_stock + v_actual_quantity WHERE id = v_balance.id;
            ELSE
                UPDATE public.inventory_balances SET damaged_stock = damaged_stock + v_actual_quantity WHERE id = v_balance.id;
            END IF;
        WHEN 'transfer_in' THEN
            UPDATE public.inventory_balances SET on_hand_stock = on_hand_stock + v_actual_quantity WHERE id = v_balance.id;
        WHEN 'sale' THEN
            IF v_available_stock < v_actual_quantity THEN RAISE EXCEPTION 'Insufficient available stock for sale'; END IF;
            UPDATE public.inventory_balances SET on_hand_stock = on_hand_stock - v_actual_quantity WHERE id = v_balance.id;
        WHEN 'supplier_return' THEN
            IF v_available_stock < v_actual_quantity THEN RAISE EXCEPTION 'Insufficient available stock for supplier return'; END IF;
            UPDATE public.inventory_balances SET on_hand_stock = on_hand_stock - v_actual_quantity WHERE id = v_balance.id;
        WHEN 'transfer_out' THEN
            IF v_available_stock < v_actual_quantity THEN RAISE EXCEPTION 'Insufficient available stock for transfer out'; END IF;
            UPDATE public.inventory_balances SET on_hand_stock = on_hand_stock - v_actual_quantity WHERE id = v_balance.id;
        WHEN 'damage' THEN
            IF v_available_stock < v_actual_quantity THEN RAISE EXCEPTION 'Insufficient available stock to mark as damaged'; END IF;
            UPDATE public.inventory_balances SET on_hand_stock = on_hand_stock - v_actual_quantity, damaged_stock = damaged_stock + v_actual_quantity WHERE id = v_balance.id;
        WHEN 'adjustment' THEN
            UPDATE public.inventory_balances SET on_hand_stock = on_hand_stock + v_actual_quantity WHERE id = v_balance.id;
        WHEN 'correction' THEN
            UPDATE public.inventory_balances SET on_hand_stock = on_hand_stock - v_actual_quantity WHERE id = v_balance.id;
        ELSE RAISE EXCEPTION 'Unknown movement type';
    END CASE;

    INSERT INTO public.inventory_movements (
        store_id, variant_id, movement_type, quantity, reference_id, notes, created_by
    )
    VALUES (
        p_store_id, p_variant_id, p_movement_type, v_actual_quantity, p_reference_id, p_notes, auth.uid()
    )
    RETURNING id INTO v_movement_id;

    RETURN v_movement_id;
END;
$$;
