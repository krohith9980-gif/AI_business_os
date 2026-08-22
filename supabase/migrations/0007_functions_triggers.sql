-- Migration 0007: Functions & Triggers (Inventory Logic, Org Bootstrap, Security)

-- 1. Organization Bootstrap RPC
CREATE OR REPLACE FUNCTION public.create_organization(org_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    new_org_id UUID;
    prof_id UUID := auth.uid();
BEGIN
    IF prof_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    INSERT INTO public.organizations (name)
    VALUES (org_name)
    RETURNING id INTO new_org_id;

    INSERT INTO public.organization_members (organization_id, profile_id, role)
    VALUES (new_org_id, prof_id, 'OWNER');

    RETURN new_org_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_organization(TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_organization(TEXT) TO authenticated;


-- 2. Role Escalation Protection Trigger
CREATE OR REPLACE FUNCTION public.prevent_unauthorized_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.role = 'OWNER' THEN
            IF NOT EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = NEW.organization_id AND role = 'OWNER') THEN
                RETURN NEW;
            END IF;
        END IF;
        
        IF NEW.role IN ('OWNER', 'MANAGER') AND NOT public.is_org_owner(NEW.organization_id) THEN
            RAISE EXCEPTION 'Unauthorized: Only an OWNER can assign OWNER or MANAGER roles';
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.role != OLD.role AND NEW.role IN ('OWNER', 'MANAGER') AND NOT public.is_org_owner(NEW.organization_id) THEN
            RAISE EXCEPTION 'Unauthorized: Only an OWNER can promote roles to OWNER or MANAGER';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_role_escalation BEFORE INSERT OR UPDATE ON public.organization_members FOR EACH ROW EXECUTE FUNCTION public.prevent_unauthorized_role_escalation();


-- 3. Reservation Management RPCs
CREATE OR REPLACE FUNCTION public.reserve_inventory(
    p_store_id UUID, p_variant_id UUID, p_quantity INTEGER, p_expires_in_minutes INTEGER
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_res_id UUID;
    v_available_stock INTEGER;
    v_org_id UUID;
BEGIN
    IF p_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;
    IF p_expires_in_minutes <= 0 THEN RAISE EXCEPTION 'Expiration time must be positive'; END IF;
    IF p_expires_in_minutes > 1440 THEN RAISE EXCEPTION 'Reservation cannot exceed 24 hours'; END IF;
    IF NOT public.is_store_member(p_store_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    SELECT organization_id INTO v_org_id FROM public.stores WHERE id = p_store_id;

    IF NOT EXISTS (
        SELECT 1 FROM public.product_variants v
        WHERE v.id = p_variant_id AND v.organization_id = v_org_id AND v.is_active = TRUE
    ) THEN
        RAISE EXCEPTION 'Variant does not belong to this organization or is inactive';
    END IF;

    SELECT (on_hand_stock - COALESCE((
        SELECT SUM(quantity) FROM public.inventory_reservations 
        WHERE store_id = p_store_id AND variant_id = p_variant_id AND status = 'ACTIVE' AND expires_at > NOW()
    ), 0)) INTO v_available_stock
    FROM public.inventory_balances WHERE store_id = p_store_id AND variant_id = p_variant_id FOR UPDATE;

    IF v_available_stock < p_quantity THEN
        RAISE EXCEPTION 'Insufficient stock to reserve';
    END IF;

    INSERT INTO public.inventory_reservations (store_id, variant_id, quantity, expires_at)
    VALUES (p_store_id, p_variant_id, p_quantity, NOW() + (p_expires_in_minutes || ' minutes')::INTERVAL)
    RETURNING id INTO v_res_id;

    RETURN v_res_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.reserve_inventory(UUID, UUID, INTEGER, INTEGER) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reserve_inventory(UUID, UUID, INTEGER, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.release_reservation(p_reservation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.inventory_reservations SET status = 'CANCELLED'
    WHERE id = p_reservation_id AND status = 'ACTIVE' 
      AND (public.is_store_member(store_id) OR public.is_org_manager_or_owner((SELECT organization_id FROM public.stores WHERE id = store_id)));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.release_reservation(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.release_reservation(UUID) TO authenticated;


-- 4. Atomic Inventory Mutation RPC
CREATE OR REPLACE FUNCTION public.record_inventory_movement(
    p_store_id UUID,
    p_variant_id UUID,
    p_movement_type public.movement_type,
    p_quantity INTEGER,
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
    v_new_movement_id UUID;
    v_org_id UUID;
    v_active_reservations INTEGER;
    v_available_stock INTEGER;
BEGIN
    IF p_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be positive absolute value'; END IF;
    
    SELECT organization_id INTO v_org_id FROM public.stores WHERE id = p_store_id;
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Store not found';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.product_variants
        WHERE id = p_variant_id
          AND organization_id = v_org_id
          AND is_active = TRUE
    ) THEN
        RAISE EXCEPTION 'Variant does not belong to this organization or is inactive';
    END IF;

    IF p_movement_type IN ('sale', 'customer_return') THEN
        IF NOT public.is_store_member(p_store_id) AND NOT public.is_org_manager_or_owner(v_org_id) THEN
            RAISE EXCEPTION 'Unauthorized: Store membership required for sales/returns';
        END IF;
    ELSE
        IF NOT public.is_org_manager_or_owner(v_org_id) THEN
            RAISE EXCEPTION 'Unauthorized: Manager or Owner required for inventory adjustments';
        END IF;
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
    ) VALUES (
        p_store_id, p_variant_id, p_movement_type, p_quantity, p_reference_id, p_notes, auth.uid()
    ) RETURNING id INTO v_new_movement_id;

    RETURN v_new_movement_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.record_inventory_movement(UUID, UUID, public.movement_type, INTEGER, UUID, TEXT, public.return_disposition) FROM public, anon, authenticated;


-- 5. Process Sale Atomic RPC
CREATE OR REPLACE FUNCTION public.process_sale(
    p_store_id UUID,
    p_customer_id UUID,
    p_items JSONB,    -- Array of { variant_id, quantity, discount_amount, reservation_id }
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
    v_qty INTEGER;
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
        v_qty := (v_item->>'quantity')::INTEGER;
        v_disc := COALESCE((v_item->>'discount_amount')::NUMERIC, 0);
        
        IF v_qty <= 0 THEN RAISE EXCEPTION 'Item quantity must be positive'; END IF;

        SELECT * INTO v_variant FROM public.product_variants WHERE id = (v_item->>'variant_id')::UUID AND organization_id = v_org_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Variant % not found', v_item->>'variant_id'; END IF;
        
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
        v_qty := (v_item->>'quantity')::INTEGER;
        v_disc := COALESCE((v_item->>'discount_amount')::NUMERIC, 0);
        SELECT * INTO v_variant FROM public.product_variants WHERE id = (v_item->>'variant_id')::UUID;
        
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
                RAISE EXCEPTION 'Reservation quantity (%) must match sale quantity (%) for MVP', v_res.quantity, v_qty;
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
REVOKE EXECUTE ON FUNCTION public.process_sale(UUID, UUID, JSONB, JSONB) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.process_sale(UUID, UUID, JSONB, JSONB) TO authenticated;


-- 6. Receive Purchase Receipt RPC
CREATE OR REPLACE FUNCTION public.receive_purchase(
    p_po_id UUID,
    p_items JSONB -- Array of { po_item_id, quantity_received }
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_po RECORD;
    v_receipt_id UUID;
    v_item JSONB;
    v_po_item RECORD;
    v_qty INTEGER;
    v_total_ordered INTEGER;
    v_total_received INTEGER;
BEGIN
    SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id 
    AND status IN ('APPROVED', 'ORDERED', 'PARTIAL_RECEIVED');
    IF NOT FOUND THEN RAISE EXCEPTION 'PO not found or cannot be received'; END IF;
    
    IF NOT public.is_org_manager_or_owner(v_po.organization_id) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    INSERT INTO public.purchase_receipts (po_id, status, created_by)
    VALUES (p_po_id, 'COMPLETED', auth.uid())
    RETURNING id INTO v_receipt_id;
    
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_qty := (v_item->>'quantity_received')::INTEGER;
        IF v_qty <= 0 THEN RAISE EXCEPTION 'Received quantity must be positive'; END IF;
        
        -- Row lock the PO item to prevent concurrent receiving races
        SELECT * INTO v_po_item FROM public.po_items WHERE id = (v_item->>'po_item_id')::UUID FOR UPDATE;
        IF NOT FOUND OR v_po_item.po_id != p_po_id THEN
            RAISE EXCEPTION 'PO Item not found';
        END IF;
        
        IF v_qty > (v_po_item.quantity_ordered - v_po_item.quantity_received) THEN
            RAISE EXCEPTION 'Cannot receive more than remaining ordered quantity';
        END IF;
        
        INSERT INTO public.purchase_receipt_items (receipt_id, receipt_po_id, po_item_id, po_item_po_id, quantity_received)
        VALUES (v_receipt_id, p_po_id, v_po_item.id, p_po_id, v_qty);
        
        PERFORM public.record_inventory_movement(
            v_po.store_id, v_po_item.variant_id, 'purchase_received'::public.movement_type, v_qty, v_receipt_id, 'PO Received', 'RESELLABLE'::public.return_disposition
        );
    END LOOP;
    
    -- Calculate PO Status
    SELECT SUM(quantity_ordered), SUM(quantity_received) INTO v_total_ordered, v_total_received
    FROM public.po_items WHERE po_id = p_po_id;
    
    IF v_total_received >= v_total_ordered THEN
        UPDATE public.purchase_orders SET status = 'COMPLETED' WHERE id = p_po_id;
    ELSE
        UPDATE public.purchase_orders SET status = 'PARTIAL_RECEIVED' WHERE id = p_po_id;
    END IF;
    
    RETURN v_receipt_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.receive_purchase(UUID, JSONB) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.receive_purchase(UUID, JSONB) TO authenticated;


-- 7. Process Return RPC
CREATE OR REPLACE FUNCTION public.process_return(
    p_sale_id UUID,
    p_items JSONB, -- Array of { sale_item_id, quantity, disposition }
    p_refund_method public.payment_method DEFAULT 'CASH'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_sale RECORD;
    v_return_id UUID;
    v_item JSONB;
    v_sale_item RECORD;
    v_qty INTEGER;
    v_previously_returned INTEGER;
    v_refund NUMERIC := 0;
    v_line_refund NUMERIC := 0;
BEGIN
    SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found'; END IF;
    
    IF NOT public.is_store_member(v_sale.store_id) AND NOT public.is_org_manager_or_owner(v_sale.organization_id) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'Return must contain at least one item'; END IF;

    INSERT INTO public.returns (sale_id, store_id, customer_id, status, created_by)
    VALUES (p_sale_id, v_sale.store_id, v_sale.customer_id, 'REFUNDED', auth.uid())
    RETURNING id INTO v_return_id;
    
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_qty := (v_item->>'quantity')::INTEGER;
        IF v_qty <= 0 THEN RAISE EXCEPTION 'Return quantity must be positive'; END IF;
        
        -- Row lock sale item
        SELECT * INTO v_sale_item FROM public.sale_items WHERE id = (v_item->>'sale_item_id')::UUID FOR UPDATE;
        IF NOT FOUND OR v_sale_item.sale_id != p_sale_id THEN
            RAISE EXCEPTION 'Sale Item not found';
        END IF;
        
        SELECT COALESCE(SUM(quantity), 0) INTO v_previously_returned
        FROM public.return_items WHERE sale_item_id = v_sale_item.id;
        
        IF v_qty > (v_sale_item.quantity - v_previously_returned) THEN
            RAISE EXCEPTION 'Cannot return more than previously sold minus already returned';
        END IF;
        
        INSERT INTO public.return_items (return_id, sale_item_id, quantity, disposition)
        VALUES (v_return_id, v_sale_item.id, v_qty, (v_item->>'disposition')::public.return_disposition);
        
        -- Calculate proportional refund correctly accounting for initial line discount
        v_line_refund := ((v_sale_item.unit_selling_price * v_sale_item.quantity) - v_sale_item.discount_amount) * (v_qty::NUMERIC / v_sale_item.quantity::NUMERIC);
        v_refund := v_refund + v_line_refund;
        
        PERFORM public.record_inventory_movement(
            v_sale.store_id, v_sale_item.variant_id, 'customer_return'::public.movement_type, v_qty, v_return_id, 'Return', (v_item->>'disposition')::public.return_disposition
        );
    END LOOP;
    
    UPDATE public.returns SET total_refund_amount = v_refund WHERE id = v_return_id;
    
    -- Record refund payment
    INSERT INTO public.payments (sale_id, method, amount, status, provider)
    VALUES (p_sale_id, p_refund_method, v_refund, 'REFUNDED', 'POS_REFUND');
    
    RETURN v_return_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.process_return(UUID, JSONB, public.payment_method) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.process_return(UUID, JSONB, public.payment_method) TO authenticated;
