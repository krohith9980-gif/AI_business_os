-- Migration 0035: Fix Inventory Stock Semantics
-- Enforce inventory quantity = number of sellable base items
-- Remove the incorrect multiplication by item_size

-- 1. Drop existing functions to prevent signature overload issues
DROP FUNCTION IF EXISTS public.record_inventory_movement(UUID, UUID, public.movement_type, INTEGER, UUID, TEXT, public.return_disposition);
DROP FUNCTION IF EXISTS public.record_inventory_movement(UUID, UUID, public.movement_type, NUMERIC, UUID, TEXT, public.return_disposition);

-- 2. Create the unified function with NUMERIC quantity
CREATE OR REPLACE FUNCTION public.record_inventory_movement(
    p_store_id UUID,
    p_variant_id UUID,
    p_movement_type public.movement_type,
    p_quantity NUMERIC, -- Using NUMERIC to match inventory column types
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
    
    -- Lookup variant to ensure it exists
    SELECT * INTO v_variant FROM public.product_variants WHERE id = p_variant_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Variant not found'; END IF;

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

-- Revoke execute from public to enforce security definer safely
REVOKE EXECUTE ON FUNCTION public.record_inventory_movement(UUID, UUID, public.movement_type, NUMERIC, UUID, TEXT, public.return_disposition) FROM public, anon, authenticated;
