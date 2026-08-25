-- Migration 0013: Product Packaging, Units, and POS Stock logic

-- 1. Add packaging columns to product_variants
ALTER TABLE public.product_variants
ADD COLUMN IF NOT EXISTS unit_of_measure TEXT NOT NULL DEFAULT 'PCS',
ADD COLUMN IF NOT EXISTS packaging_type TEXT NOT NULL DEFAULT 'NONE',
ADD COLUMN IF NOT EXISTS units_per_pack INTEGER NOT NULL DEFAULT 1;

-- 2. Update create_product_with_variant RPC
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
    p_units_per_pack INTEGER DEFAULT 1
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
        unit_of_measure, packaging_type, units_per_pack
    )
    VALUES (
        v_product_id, p_organization_id, trim(p_sku), 
        NULLIF(trim(p_barcode), ''), p_attributes, 
        p_purchase_cost, p_selling_price, p_tracking_mode, p_variant_image_url, p_is_active,
        p_unit_of_measure, p_packaging_type, p_units_per_pack
    )
    RETURNING id INTO v_variant_id;

    -- 7. Return IDs
    v_result.product_id := v_product_id;
    v_result.variant_id := v_variant_id;
    
    RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_product_with_variant(
    UUID, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, UUID, TEXT, TEXT, JSONB, public.tracking_mode, TEXT, BOOLEAN, TEXT, TEXT, INTEGER
) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.create_product_with_variant(
    UUID, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, UUID, TEXT, TEXT, JSONB, public.tracking_mode, TEXT, BOOLEAN, TEXT, TEXT, INTEGER
) TO authenticated;


-- 3. Update process_sale to calculate base quantity based on packaging
CREATE OR REPLACE FUNCTION public.process_sale(
    p_store_id UUID,
    p_customer_id UUID,
    p_items JSONB,    -- Array of { variant_id, display_quantity, sale_unit, discount_amount, reservation_id }
    p_payments JSONB  -- Array of { method, amount, provider, provider_reference }
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_org_id UUID;
    v_sale_id UUID;
    v_item JSONB;
    v_payment JSONB;
    v_variant RECORD;
    v_res RECORD;
    v_subtotal NUMERIC := 0;
    v_discount_total NUMERIC := 0;
    v_tax_total NUMERIC := 0;
    v_grand_total NUMERIC := 0;
    v_payment_total NUMERIC := 0;
    v_display_qty INTEGER;
    v_qty INTEGER;
    v_sale_unit TEXT;
    v_disc NUMERIC;
    v_line_total NUMERIC;
    v_is_mgr BOOLEAN;
BEGIN
    IF jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'Sale must contain at least one item'; END IF;
    IF jsonb_array_length(p_payments) = 0 THEN RAISE EXCEPTION 'Sale must contain at least one payment'; END IF;

    SELECT organization_id INTO v_org_id FROM public.stores WHERE id = p_store_id;
    IF NOT public.is_store_member(p_store_id) AND NOT public.is_org_manager_or_owner(v_org_id) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;
    
    v_is_mgr := public.is_org_manager_or_owner(v_org_id);

    -- Calculate Totals and Verify Limits BEFORE creating sale
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_display_qty := (v_item->>'display_quantity')::INTEGER;
        v_sale_unit := v_item->>'sale_unit';
        v_disc := COALESCE((v_item->>'discount_amount')::NUMERIC, 0);
        
        IF v_display_qty <= 0 THEN RAISE EXCEPTION 'Item quantity must be positive'; END IF;

        SELECT * INTO v_variant FROM public.product_variants WHERE id = (v_item->>'variant_id')::UUID AND organization_id = v_org_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Variant % not found', v_item->>'variant_id'; END IF;
        
        -- Server validates and calculates authoritative base quantity
        IF v_sale_unit = v_variant.packaging_type AND v_variant.packaging_type != 'NONE' THEN
            v_qty := v_display_qty * v_variant.units_per_pack;
        ELSE
            v_qty := v_display_qty;
        END IF;
        
        IF v_disc > 0 THEN
            IF v_is_mgr THEN
                IF v_disc > (v_variant.selling_price * v_qty) * 0.20 AND NOT public.is_org_owner(v_org_id) THEN
                    RAISE EXCEPTION 'Manager discount exceeds 20%% limit';
                END IF;
            ELSE
                IF v_disc > (v_variant.selling_price * v_qty) * 0.05 THEN
                    RAISE EXCEPTION 'Cashier discount exceeds 5%% limit';
                END IF;
            END IF;
        END IF;
        
        v_line_total := (v_variant.selling_price * v_qty) - v_disc;
        IF v_line_total < 0 THEN RAISE EXCEPTION 'Line total cannot be negative'; END IF;
        
        v_subtotal := v_subtotal + (v_variant.selling_price * v_qty);
        v_discount_total := v_discount_total + v_disc;
        v_tax_total := v_tax_total + 0; 
        v_grand_total := v_grand_total + v_line_total + 0;
    END LOOP;

    -- Verify Payments
    FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments)
    LOOP
        IF (v_payment->>'amount')::NUMERIC <= 0 THEN
            RAISE EXCEPTION 'Payment amount must be positive';
        END IF;
        v_payment_total := v_payment_total + (v_payment->>'amount')::NUMERIC;
    END LOOP;
    
    IF v_payment_total != v_grand_total THEN
        RAISE EXCEPTION 'Payment total (%) does not match grand total (%)', v_payment_total, v_grand_total;
    END IF;

    -- Create Sale
    INSERT INTO public.sales (store_id, organization_id, customer_id, cashier_id, status, subtotal, discount_total, tax_total, grand_total)
    VALUES (p_store_id, v_org_id, p_customer_id, auth.uid(), 'COMPLETED', v_subtotal, v_discount_total, v_tax_total, v_grand_total)
    RETURNING id INTO v_sale_id;

    -- Insert Items and Deduct Inventory
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_display_qty := (v_item->>'display_quantity')::INTEGER;
        v_sale_unit := v_item->>'sale_unit';
        v_disc := COALESCE((v_item->>'discount_amount')::NUMERIC, 0);
        SELECT * INTO v_variant FROM public.product_variants WHERE id = (v_item->>'variant_id')::UUID;
        
        -- Recalculate quantity for insertion
        IF v_sale_unit = v_variant.packaging_type AND v_variant.packaging_type != 'NONE' THEN
            v_qty := v_display_qty * v_variant.units_per_pack;
        ELSE
            v_qty := v_display_qty;
        END IF;
        
        -- Complete reservation if supplied before taking stock
        IF v_item->>'reservation_id' IS NOT NULL THEN
            SELECT * INTO v_res FROM public.inventory_reservations 
            WHERE id = (v_item->>'reservation_id')::UUID FOR UPDATE;

            IF NOT FOUND OR v_res.status != 'ACTIVE' OR v_res.expires_at <= NOW() THEN
                RAISE EXCEPTION 'Reservation is not active or has expired';
            END IF;
            IF v_res.store_id != p_store_id OR v_res.variant_id != v_variant.id THEN
                RAISE EXCEPTION 'Reservation does not match store or variant';
            END IF;
            IF v_res.quantity != v_qty THEN
                RAISE EXCEPTION 'Reservation quantity (%) must match sale base quantity (%)', v_res.quantity, v_qty;
            END IF;

            UPDATE public.inventory_reservations SET status = 'COMPLETED' WHERE id = v_res.id;
        END IF;

        v_line_total := (v_variant.selling_price * v_qty) - v_disc;
        INSERT INTO public.sale_items (sale_id, organization_id, variant_id, quantity, unit_purchase_cost, unit_selling_price, discount_amount, tax_rate, total_price)
        VALUES (v_sale_id, v_org_id, v_variant.id, v_qty, v_variant.purchase_cost, v_variant.selling_price, v_disc, 0, v_line_total);

        PERFORM public.record_inventory_movement(
            p_store_id, v_variant.id, 'sale'::public.movement_type, v_qty, v_sale_id, 'Sale', 'RESELLABLE'::public.return_disposition
        );
    END LOOP;

    -- Create Payments
    FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments)
    LOOP
        INSERT INTO public.payments (sale_id, method, amount, status, provider, provider_reference, paid_at)
        VALUES (v_sale_id, (v_payment->>'method')::public.payment_method, (v_payment->>'amount')::NUMERIC, 'PAID', v_payment->>'provider', v_payment->>'provider_reference', NOW());
    END LOOP;

    RETURN v_sale_id;
END;
$$;
