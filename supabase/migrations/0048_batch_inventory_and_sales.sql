-- Migration 0048: Batch-First Inventory and Sales

-- 1. Add batch_number to sale_items and inventory_reservations
ALTER TABLE public.sale_items ADD COLUMN batch_number TEXT;
ALTER TABLE public.inventory_reservations ADD COLUMN batch_number TEXT;

-- 2. Add disposition to inventory_movements for accurate batch calculations
-- Without this, aggregating customer_return movements would risk counting DAMAGED goods as sellable batch stock.
ALTER TABLE public.inventory_movements ADD COLUMN disposition public.return_disposition;

-- 3. Update Inventory Movement RPC to persist disposition in the ledger and restore 0037 security checks
CREATE OR REPLACE FUNCTION public.record_inventory_movement(
    p_store_id UUID,
    p_variant_id UUID,
    p_movement_type public.movement_type,
    p_quantity INTEGER,
    p_reference_id UUID,
    p_notes TEXT DEFAULT NULL,
    p_disposition public.return_disposition DEFAULT 'RESELLABLE',
    p_batch_number TEXT DEFAULT NULL,
    p_mfg_date DATE DEFAULT NULL,
    p_expiry_date DATE DEFAULT NULL
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
            UPDATE public.inventory_balances SET on_hand_stock = on_hand_stock + p_quantity, incoming_stock = GREATEST(0, incoming_stock - p_quantity) WHERE id = v_balance.id;
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
        store_id, variant_id, movement_type, quantity, reference_id, notes, created_by, 
        batch_number, mfg_date, expiry_date, disposition
    )
    VALUES (
        p_store_id, p_variant_id, p_movement_type, p_quantity, p_reference_id, p_notes, auth.uid(),
        p_batch_number, p_mfg_date, p_expiry_date,
        CASE WHEN p_movement_type = 'customer_return' THEN p_disposition ELSE NULL END
    )
    RETURNING id INTO v_movement_id;

    RETURN v_movement_id;
END;
$$;

-- 4. Create View for Batch Available Stock
-- Safely groups by batch identity: store_id + variant_id + batch_number
-- MFG and EXP dates are metadata (using MAX to avoid splitting same batch rows)
-- Also subtracts active reservations for the specific batch.
CREATE OR REPLACE VIEW public.vw_batch_inventory AS
WITH batch_movements AS (
    SELECT 
        store_id, 
        variant_id, 
        batch_number, 
        MAX(mfg_date) as mfg_date, 
        MAX(expiry_date) as expiry_date,
        SUM(
            CASE 
                WHEN movement_type IN ('opening_stock', 'purchase_received', 'transfer_in', 'adjustment') THEN quantity
                WHEN movement_type = 'customer_return' AND disposition = 'RESELLABLE' THEN quantity
                WHEN movement_type IN ('sale', 'supplier_return', 'damage', 'transfer_out', 'correction') THEN -quantity
                ELSE 0
            END
        ) as on_hand_stock
    FROM public.inventory_movements
    GROUP BY store_id, variant_id, batch_number
),
batch_reservations AS (
    SELECT 
        store_id,
        variant_id,
        batch_number,
        SUM(quantity) as active_reserved_stock
    FROM public.inventory_reservations
    WHERE status = 'ACTIVE' AND expires_at > NOW()
    GROUP BY store_id, variant_id, batch_number
)
SELECT 
    m.store_id,
    m.variant_id,
    m.batch_number,
    m.mfg_date,
    m.expiry_date,
    m.on_hand_stock,
    COALESCE(r.active_reserved_stock, 0) AS active_reserved_stock,
    m.on_hand_stock - COALESCE(r.active_reserved_stock, 0) AS available_stock
FROM batch_movements m
LEFT JOIN batch_reservations r 
    ON m.store_id = r.store_id 
    AND m.variant_id = r.variant_id 
    AND m.batch_number IS NOT DISTINCT FROM r.batch_number
WHERE m.on_hand_stock > 0;

-- 3. Update process_sale RPC to handle batches and validate stock
-- Drops the existing 5-argument function
DROP FUNCTION IF EXISTS public.process_sale(UUID, UUID, JSONB, JSONB, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.process_sale(
    p_store_id UUID,
    p_customer_id UUID,
    p_items JSONB,    
    p_payments JSONB,
    p_due_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_org_id UUID; v_sale_id UUID; v_item JSONB; v_payment JSONB;
    v_variant RECORD; v_res RECORD; v_customer RECORD;
    v_subtotal NUMERIC := 0; v_discount_total NUMERIC := 0; v_tax_total NUMERIC := 0;
    v_grand_total NUMERIC := 0; v_payment_total NUMERIC := 0;
    v_display_qty INTEGER; v_qty INTEGER; v_sale_unit TEXT;
    v_disc NUMERIC; v_line_total NUMERIC; v_is_mgr BOOLEAN;
    v_customer_balance NUMERIC := 0;
    
    v_business_year INTEGER;
    v_seq_num INTEGER;
    v_invoice_number TEXT;
    v_batch_number TEXT;
    
    v_on_hand_stock NUMERIC;
    v_available_stock NUMERIC;
    v_batch_key TEXT;
    v_requested_available JSONB := '{}'::JSONB;
    v_requested_on_hand JSONB := '{}'::JSONB;
    v_consumed_reservations JSONB := '{}'::JSONB;
    v_current_req_available INTEGER;
    v_current_req_on_hand INTEGER;
BEGIN
    IF jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'Sale must contain at least one item'; END IF;

    SELECT organization_id INTO v_org_id FROM public.stores WHERE id = p_store_id;
    IF NOT public.is_store_member(p_store_id) AND NOT public.is_org_manager_or_owner(v_org_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    
    v_is_mgr := public.is_org_manager_or_owner(v_org_id);

    -- =========================================================================
    -- LOOP 1: Calculate Totals, Verify Security, and Validate Aggregated Stock
    -- =========================================================================
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_display_qty := (v_item->>'display_quantity')::INTEGER;
        v_sale_unit := v_item->>'sale_unit';
        v_disc := COALESCE((v_item->>'discount_amount')::NUMERIC, 0);
        v_batch_number := v_item->>'batch_number';

        IF v_display_qty <= 0 THEN RAISE EXCEPTION 'Item quantity must be positive'; END IF;

        SELECT * INTO v_variant FROM public.product_variants WHERE id = (v_item->>'variant_id')::UUID AND organization_id = v_org_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Variant % not found', v_item->>'variant_id'; END IF;
        
        IF v_sale_unit = v_variant.packaging_type AND v_variant.packaging_type != 'NONE' THEN
            v_qty := v_display_qty * v_variant.units_per_pack;
        ELSE
            v_qty := v_display_qty;
        END IF;

        -- Fetch precise batch stock accounting for reservations
        SELECT on_hand_stock, available_stock INTO v_on_hand_stock, v_available_stock
        FROM public.vw_batch_inventory
        WHERE store_id = p_store_id 
          AND variant_id = v_variant.id 
          AND (batch_number IS NOT DISTINCT FROM v_batch_number);

        v_on_hand_stock := COALESCE(v_on_hand_stock, 0);
        v_available_stock := COALESCE(v_available_stock, 0);
        
        v_batch_key := v_variant.id::TEXT || ':' || COALESCE(v_batch_number, 'UNBATCHED');

        -- Reservation and Stock Validation
        IF v_item->>'reservation_id' IS NOT NULL THEN
            IF (v_consumed_reservations ? (v_item->>'reservation_id')) THEN
                RAISE EXCEPTION 'Duplicate reservation_id % found in request', v_item->>'reservation_id';
            END IF;
            v_consumed_reservations := jsonb_set(v_consumed_reservations, ARRAY[v_item->>'reservation_id'], 'true'::jsonb);

            SELECT * INTO v_res FROM public.inventory_reservations WHERE id = (v_item->>'reservation_id')::UUID;
            IF NOT FOUND OR v_res.status != 'ACTIVE' OR v_res.expires_at <= NOW() THEN 
                RAISE EXCEPTION 'Reservation is not active or has expired'; 
            END IF;
            IF v_res.store_id != p_store_id OR v_res.variant_id != v_variant.id OR v_res.batch_number IS DISTINCT FROM v_batch_number THEN 
                RAISE EXCEPTION 'Reservation does not match store, variant, or batch'; 
            END IF;
            IF v_res.quantity != v_qty THEN 
                RAISE EXCEPTION 'Reservation quantity (%) must match sale base quantity (%)', v_res.quantity, v_qty; 
            END IF;

            -- If using a reservation, the stock is already deducted from available_stock.
            -- We only need to verify it doesn't exceed true physical on-hand stock across multiple cart lines.
            v_current_req_on_hand := COALESCE((v_requested_on_hand->>v_batch_key)::INTEGER, 0) + v_qty;
            v_requested_on_hand := jsonb_set(v_requested_on_hand, ARRAY[v_batch_key], to_jsonb(v_current_req_on_hand));
            
            IF v_on_hand_stock < v_current_req_on_hand THEN
                 RAISE EXCEPTION 'Insufficient on-hand stock for reserved variant % batch %', v_variant.id, COALESCE(v_batch_number, 'UNBATCHED');
            END IF;
        ELSE
            -- Normal sale without reservation
            v_current_req_available := COALESCE((v_requested_available->>v_batch_key)::INTEGER, 0) + v_qty;
            v_requested_available := jsonb_set(v_requested_available, ARRAY[v_batch_key], to_jsonb(v_current_req_available));
            
            IF v_available_stock < v_current_req_available THEN
                RAISE EXCEPTION 'Insufficient stock. Requested % total but only % available for variant % batch %', v_current_req_available, v_available_stock, v_variant.id, COALESCE(v_batch_number, 'UNBATCHED');
            END IF;
            
            v_current_req_on_hand := COALESCE((v_requested_on_hand->>v_batch_key)::INTEGER, 0) + v_qty;
            v_requested_on_hand := jsonb_set(v_requested_on_hand, ARRAY[v_batch_key], to_jsonb(v_current_req_on_hand));
            
            IF v_on_hand_stock < v_current_req_on_hand THEN
                 RAISE EXCEPTION 'Insufficient on-hand stock for variant % batch %', v_variant.id, COALESCE(v_batch_number, 'UNBATCHED');
            END IF;
        END IF;
        
        IF v_disc > 0 THEN
            IF v_is_mgr THEN
                IF v_disc > (v_variant.selling_price * v_qty) * 0.20 AND NOT public.is_org_owner(v_org_id) THEN RAISE EXCEPTION 'Manager discount exceeds 20%% limit'; END IF;
            ELSE
                IF v_disc > (v_variant.selling_price * v_qty) * 0.05 THEN RAISE EXCEPTION 'Cashier discount exceeds 5%% limit'; END IF;
            END IF;
        END IF;
        
        v_line_total := (v_variant.selling_price * v_qty) - v_disc;
        IF v_line_total < 0 THEN RAISE EXCEPTION 'Line total cannot be negative'; END IF;
        
        v_subtotal := v_subtotal + (v_variant.selling_price * v_qty);
        v_discount_total := v_discount_total + v_disc;
        v_grand_total := v_grand_total + v_line_total + 0;
    END LOOP;

    -- Verify Payments
    IF p_payments IS NOT NULL AND jsonb_array_length(p_payments) > 0 THEN
        FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments)
        LOOP
            IF (v_payment->>'amount')::NUMERIC <= 0 THEN RAISE EXCEPTION 'Payment amount must be positive'; END IF;
            v_payment_total := v_payment_total + (v_payment->>'amount')::NUMERIC;
        END LOOP;
    END IF;
    
    IF v_payment_total > v_grand_total THEN RAISE EXCEPTION 'Payment total (%) cannot exceed grand total (%)', v_payment_total, v_grand_total; END IF;
    IF p_customer_id IS NULL AND v_payment_total < v_grand_total THEN RAISE EXCEPTION 'Walk-in customers must pay in full'; END IF;

    -- Customer Ledger Lock and Credit Enforcement
    IF p_customer_id IS NOT NULL THEN
        SELECT * INTO v_customer FROM public.customers WHERE id = p_customer_id AND organization_id = v_org_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found in this organization'; END IF;

        IF (v_grand_total - v_payment_total) > 0 AND v_customer.credit_limit IS NOT NULL THEN
            IF (v_customer.outstanding_balance + (v_grand_total - v_payment_total)) > v_customer.credit_limit THEN
                RAISE EXCEPTION 'Transaction blocked: New outstanding balance (₹%) would exceed customer credit limit (₹%)', 
                    (v_customer.outstanding_balance + (v_grand_total - v_payment_total)), v_customer.credit_limit;
            END IF;
        END IF;
    END IF;

    -- INVOICE NUMBER GENERATION
    v_business_year := EXTRACT(YEAR FROM NOW());
    
    INSERT INTO public.store_invoice_sequences (store_id, business_year, last_value)
    VALUES (p_store_id, v_business_year, 1)
    ON CONFLICT (store_id, business_year) DO UPDATE
    SET last_value = public.store_invoice_sequences.last_value + 1
    RETURNING last_value INTO v_seq_num;
    
    v_invoice_number := 'INV-' || v_business_year::TEXT || '-' || LPAD(v_seq_num::TEXT, 6, '0');

    -- Create Sale
    INSERT INTO public.sales (
        store_id, organization_id, customer_id, cashier_id, status, 
        subtotal, discount_total, tax_total, grand_total, due_date, 
        invoice_number
    )
    VALUES (
        p_store_id, v_org_id, p_customer_id, auth.uid(), 'COMPLETED', 
        v_subtotal, v_discount_total, v_tax_total, v_grand_total, p_due_date, 
        v_invoice_number
    )
    RETURNING id INTO v_sale_id;

    -- Customer Ledger
    IF p_customer_id IS NOT NULL THEN
        v_customer_balance := v_customer.outstanding_balance + v_grand_total;
        
        INSERT INTO public.customer_ledger (organization_id, customer_id, store_id, transaction_type, amount, balance_after, reference_id, notes, created_by)
        VALUES (v_org_id, p_customer_id, p_store_id, 'SALE', v_grand_total, v_customer_balance, v_sale_id, 'Sale #' || v_sale_id, auth.uid());

        IF v_payment_total > 0 THEN
            v_customer_balance := v_customer_balance - v_payment_total;
            INSERT INTO public.customer_ledger (organization_id, customer_id, store_id, transaction_type, amount, balance_after, reference_id, notes, created_by)
            VALUES (v_org_id, p_customer_id, p_store_id, 'PAYMENT', -v_payment_total, v_customer_balance, v_sale_id, 'Payment for Sale #' || v_sale_id, auth.uid());
        END IF;

        UPDATE public.customers SET outstanding_balance = v_customer_balance WHERE id = p_customer_id;
    END IF;

    -- =========================================================================
    -- LOOP 2: Insert Items, Fulfill Reservations, and Deduct Inventory
    -- =========================================================================
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_display_qty := (v_item->>'display_quantity')::INTEGER;
        v_sale_unit := v_item->>'sale_unit';
        v_disc := COALESCE((v_item->>'discount_amount')::NUMERIC, 0);
        v_batch_number := v_item->>'batch_number';
        
        -- STRICT ISOLATION: Second lookup enforces organization_id explicitly
        SELECT v.*, p.name AS product_name 
        INTO v_variant 
        FROM public.product_variants v
        JOIN public.products p ON p.id = v.product_id
        WHERE v.id = (v_item->>'variant_id')::UUID
          AND v.organization_id = v_org_id;
          
        IF NOT FOUND THEN RAISE EXCEPTION 'Variant not found or unauthorized during insertion'; END IF;
        
        IF v_sale_unit = v_variant.packaging_type AND v_variant.packaging_type != 'NONE' THEN
            v_qty := v_display_qty * v_variant.units_per_pack;
        ELSE
            v_qty := v_display_qty;
        END IF;
        
        IF v_item->>'reservation_id' IS NOT NULL THEN
            -- Complete the reservation (already validated in Loop 1)
            UPDATE public.inventory_reservations SET status = 'COMPLETED' WHERE id = (v_item->>'reservation_id')::UUID;
        END IF;

        v_line_total := (v_variant.selling_price * v_qty) - v_disc;
        
        INSERT INTO public.sale_items (
            sale_id, organization_id, variant_id, quantity, 
            unit_purchase_cost, unit_selling_price, discount_amount, 
            tax_rate, total_price, product_name, sku, batch_number
        )
        VALUES (
            v_sale_id, v_org_id, v_variant.id, v_qty, 
            v_variant.purchase_cost, v_variant.selling_price, v_disc, 
            0, v_line_total, v_variant.product_name, v_variant.sku, v_batch_number
        );

        -- Passed as 8th parameter per migration 0045 definition
        PERFORM public.record_inventory_movement(
            p_store_id, v_variant.id, 'sale'::public.movement_type, v_qty, v_sale_id, 
            'Sale', 'RESELLABLE'::public.return_disposition,
            v_batch_number, NULL, NULL
        );
    END LOOP;

    -- Create Payments
    IF p_payments IS NOT NULL AND jsonb_array_length(p_payments) > 0 THEN
        FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments)
        LOOP
            INSERT INTO public.payments (sale_id, method, amount, status, provider, provider_reference, paid_at)
            VALUES (v_sale_id, (v_payment->>'method')::public.payment_method, (v_payment->>'amount')::NUMERIC, 'COMPLETED', NULL, NULL, NOW());
        END LOOP;
    END IF;

    RETURN v_sale_id;
END;
$$;
