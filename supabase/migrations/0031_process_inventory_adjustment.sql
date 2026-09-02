-- Migration 0031: Process Inventory Adjustment

CREATE OR REPLACE FUNCTION public.process_inventory_adjustment(
    p_store_id UUID,
    p_variant_id UUID,
    p_movement_type public.movement_type,
    p_quantity INTEGER,
    p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_org_id UUID;
    v_variant RECORD;
BEGIN
    -- Only allow explicitly permitted movement types
    IF p_movement_type NOT IN ('opening_stock', 'adjustment', 'correction', 'damage') THEN
        RAISE EXCEPTION 'Invalid or unauthorized adjustment type';
    END IF;

    -- Validate quantity
    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'Adjustment quantity must be positive';
    END IF;

    -- Get and validate store
    SELECT organization_id INTO v_org_id FROM public.stores WHERE id = p_store_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Store not found';
    END IF;

    -- Validate authorization: Must be an active manager or owner of the organization
    IF NOT public.is_org_manager_or_owner(v_org_id) THEN
        RAISE EXCEPTION 'Unauthorized: Only Managers and Owners can perform manual inventory adjustments';
    END IF;

    -- Get and validate variant
    SELECT * INTO v_variant FROM public.product_variants WHERE id = p_variant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Variant not found';
    END IF;

    -- Ensure variant belongs to the same organization
    IF v_variant.organization_id != v_org_id THEN
        RAISE EXCEPTION 'Variant does not belong to the selected store organization';
    END IF;

    -- Record the movement (bypassing the internal block by running as security definer)
    PERFORM public.record_inventory_movement(
        p_store_id,
        p_variant_id,
        p_movement_type,
        p_quantity,
        NULL, -- No reference_id
        COALESCE(p_notes, 'Manual ' || p_movement_type),
        CASE WHEN p_movement_type = 'damage' THEN 'DAMAGED'::public.return_disposition ELSE 'RESELLABLE'::public.return_disposition END
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_inventory_adjustment(UUID, UUID, public.movement_type, INTEGER, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.process_inventory_adjustment(UUID, UUID, public.movement_type, INTEGER, TEXT) TO authenticated;
