-- Migration 0010: Product Creation RPC (Atomic)

-- Create a type to return the new product and variant IDs
CREATE TYPE public.product_creation_result AS (
    product_id UUID,
    variant_id UUID
);

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
    p_is_active BOOLEAN DEFAULT TRUE
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
        purchase_cost, selling_price, tracking_mode, image_url, is_active
    )
    VALUES (
        v_product_id, p_organization_id, trim(p_sku), 
        NULLIF(trim(p_barcode), ''), p_attributes, 
        p_purchase_cost, p_selling_price, p_tracking_mode, p_variant_image_url, p_is_active
    )
    RETURNING id INTO v_variant_id;

    -- 7. Return IDs
    v_result.product_id := v_product_id;
    v_result.variant_id := v_variant_id;
    
    RETURN v_result;
END;
$$;

-- Revoke default execute and grant only to authenticated users
REVOKE EXECUTE ON FUNCTION public.create_product_with_variant(
    UUID, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, UUID, TEXT, TEXT, JSONB, public.tracking_mode, TEXT, BOOLEAN
) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.create_product_with_variant(
    UUID, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, UUID, TEXT, TEXT, JSONB, public.tracking_mode, TEXT, BOOLEAN
) TO authenticated;
