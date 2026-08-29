-- 0022_test_rpc.sql

CREATE OR REPLACE FUNCTION public.test_inject_historical_movement(
    p_store_id UUID,
    p_variant_id UUID,
    p_movement_type public.movement_type,
    p_quantity NUMERIC,
    p_created_at TIMESTAMPTZ
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.inventory_movements (
        store_id, variant_id, movement_type, quantity, created_at
    ) VALUES (
        p_store_id, p_variant_id, p_movement_type::public.movement_type, p_quantity, p_created_at
    );
    -- Also update balance
    IF p_movement_type IN ('opening_stock', 'purchase_received', 'customer_return', 'transfer_in', 'adjustment') THEN
        UPDATE public.inventory_balances SET on_hand_stock = on_hand_stock + p_quantity WHERE variant_id = p_variant_id AND store_id = p_store_id;
        IF NOT FOUND THEN
            INSERT INTO public.inventory_balances (store_id, organization_id, variant_id, on_hand_stock)
            VALUES (p_store_id, (SELECT organization_id FROM public.stores WHERE id = p_store_id), p_variant_id, p_quantity);
        END IF;
    ELSE
        UPDATE public.inventory_balances SET on_hand_stock = on_hand_stock - p_quantity WHERE variant_id = p_variant_id AND store_id = p_store_id;
        IF NOT FOUND THEN
            INSERT INTO public.inventory_balances (store_id, organization_id, variant_id, on_hand_stock)
            VALUES (p_store_id, (SELECT organization_id FROM public.stores WHERE id = p_store_id), p_variant_id, -p_quantity);
        END IF;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.test_inject_historical_movement(UUID, UUID, public.movement_type, NUMERIC, TIMESTAMPTZ) TO authenticated;
