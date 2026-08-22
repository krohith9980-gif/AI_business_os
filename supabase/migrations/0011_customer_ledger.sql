-- Migration 0011: Customer Ledger Foundation

-- 1. Customers Table Updates
ALTER TABLE public.customers 
ADD COLUMN village TEXT,
ADD COLUMN outstanding_balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
ADD COLUMN credit_limit NUMERIC(12, 2);

CREATE INDEX idx_customers_village ON public.customers(organization_id, village);

-- 2. Sales Table Updates (Prepared for transaction-level due dates)
ALTER TABLE public.sales
ADD COLUMN due_date TIMESTAMPTZ;

-- 3. Payments Table Updates (Support standalone customer payments)
ALTER TABLE public.payments
ADD COLUMN customer_id UUID REFERENCES public.customers(id) ON DELETE RESTRICT,
ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE RESTRICT,
ADD COLUMN store_id UUID REFERENCES public.stores(id) ON DELETE RESTRICT,
ADD COLUMN notes TEXT;

ALTER TABLE public.payments ALTER COLUMN sale_id DROP NOT NULL;

-- A payment must either be tied to a sale (POS checkout) OR tied to a customer (standalone payment)
ALTER TABLE public.payments ADD CONSTRAINT chk_payment_target CHECK (
    (sale_id IS NOT NULL) OR (customer_id IS NOT NULL AND organization_id IS NOT NULL AND store_id IS NOT NULL)
);

-- 4. Update Payments RLS (SELECT only; INSERT/UPDATE are strictly via RPCs)
DROP POLICY IF EXISTS "Payments visible to store members" ON public.payments;
CREATE POLICY "Payments visible to authorized users" ON public.payments FOR SELECT USING (
    (sale_id IS NOT NULL AND (
        public.is_store_member((SELECT store_id FROM public.sales WHERE id = sale_id)) OR 
        public.is_org_manager_or_owner((SELECT organization_id FROM public.sales WHERE id = sale_id))
    ))
    OR 
    (store_id IS NOT NULL AND (
        public.is_store_member(store_id) OR
        public.is_org_manager_or_owner(organization_id)
    ))
);

-- 5. Customer Sub-Ledger (Authoritative log for customers)
CREATE TYPE ledger_transaction_type AS ENUM ('SALE', 'PAYMENT', 'RETURN', 'ADJUSTMENT');

CREATE TABLE public.customer_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    store_id UUID REFERENCES public.stores(id) ON DELETE RESTRICT,
    transaction_type ledger_transaction_type NOT NULL,
    amount NUMERIC(12, 2) NOT NULL, -- Positive for Debit (e.g. Sale), Negative for Credit (e.g. Payment)
    balance_after NUMERIC(12, 2) NOT NULL,
    reference_id UUID, -- References sale_id, payment_id, etc.
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.customer_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ledger visible to org members" ON public.customer_ledger FOR SELECT USING (public.is_org_member(organization_id));
CREATE INDEX idx_customer_ledger_customer ON public.customer_ledger(customer_id, created_at DESC);


-- 6. Updated process_sale RPC
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
    v_customer RECORD;
    v_subtotal NUMERIC := 0;
    v_discount_total NUMERIC := 0;
    v_tax_total NUMERIC := 0;
    v_grand_total NUMERIC := 0;
    v_payment_total NUMERIC := 0;
    v_qty INTEGER;
    v_disc NUMERIC;
    v_line_total NUMERIC;
    v_is_mgr BOOLEAN;
    v_customer_balance NUMERIC := 0;
BEGIN
    IF jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'Sale must contain at least one item'; END IF;

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
    IF p_payments IS NOT NULL AND jsonb_array_length(p_payments) > 0 THEN
        FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments)
        LOOP
            IF (v_payment->>'amount')::NUMERIC <= 0 THEN
                RAISE EXCEPTION 'Payment amount must be positive';
            END IF;
            v_payment_total := v_payment_total + (v_payment->>'amount')::NUMERIC;
        END LOOP;
    END IF;
    
    IF v_payment_total > v_grand_total THEN
        RAISE EXCEPTION 'Payment total (%) cannot exceed grand total (%)', v_payment_total, v_grand_total;
    END IF;

    IF p_customer_id IS NULL AND v_payment_total < v_grand_total THEN
        RAISE EXCEPTION 'Walk-in customers must pay in full';
    END IF;

    -- Lock Customer Row
    IF p_customer_id IS NOT NULL THEN
        SELECT * INTO v_customer FROM public.customers WHERE id = p_customer_id AND organization_id = v_org_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found in this organization'; END IF;
    END IF;

    -- Create Sale
    INSERT INTO public.sales (store_id, organization_id, customer_id, cashier_id, status, subtotal, discount_total, tax_total, grand_total)
    VALUES (p_store_id, v_org_id, p_customer_id, auth.uid(), 'COMPLETED', v_subtotal, v_discount_total, v_tax_total, v_grand_total)
    RETURNING id INTO v_sale_id;

    -- Handle Customer Ledger and Outstanding Balance Atomically
    IF p_customer_id IS NOT NULL THEN
        v_customer_balance := v_customer.outstanding_balance + v_grand_total;
        
        -- Record SALE Debit
        INSERT INTO public.customer_ledger (
            organization_id, customer_id, store_id, transaction_type, amount, balance_after, reference_id, notes, created_by
        ) VALUES (
            v_org_id, p_customer_id, p_store_id, 'SALE', v_grand_total, v_customer_balance, v_sale_id, 'Sale #' || v_sale_id, auth.uid()
        );

        -- Record PAYMENT Credit if applicable
        IF v_payment_total > 0 THEN
            v_customer_balance := v_customer_balance - v_payment_total;
            INSERT INTO public.customer_ledger (
                organization_id, customer_id, store_id, transaction_type, amount, balance_after, reference_id, notes, created_by
            ) VALUES (
                v_org_id, p_customer_id, p_store_id, 'PAYMENT', -v_payment_total, v_customer_balance, v_sale_id, 'Payment for Sale #' || v_sale_id, auth.uid()
            );
        END IF;

        UPDATE public.customers SET outstanding_balance = v_customer_balance WHERE id = p_customer_id;
    END IF;

    -- Insert Items and Deduct Inventory
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_qty := (v_item->>'quantity')::INTEGER;
        v_disc := COALESCE((v_item->>'discount_amount')::NUMERIC, 0);
        SELECT * INTO v_variant FROM public.product_variants WHERE id = (v_item->>'variant_id')::UUID;
        
        -- Complete reservation if supplied
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

    -- Create POS Payments
    IF p_payments IS NOT NULL AND jsonb_array_length(p_payments) > 0 THEN
        FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments)
        LOOP
            INSERT INTO public.payments (sale_id, method, amount, status, provider, provider_reference, paid_at)
            VALUES (v_sale_id, (v_payment->>'method')::public.payment_method, (v_payment->>'amount')::NUMERIC, 'PAID', v_payment->>'provider', v_payment->>'provider_reference', NOW());
        END LOOP;
    END IF;

    RETURN v_sale_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.process_sale(UUID, UUID, JSONB, JSONB) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.process_sale(UUID, UUID, JSONB, JSONB) TO authenticated;


-- 7. New record_customer_payment RPC
CREATE OR REPLACE FUNCTION public.record_customer_payment(
    p_store_id UUID,
    p_customer_id UUID,
    p_amount NUMERIC,
    p_method public.payment_method,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_org_id UUID;
    v_customer RECORD;
    v_payment_id UUID;
    v_new_balance NUMERIC;
BEGIN
    IF p_method = 'SPLIT' THEN
        RAISE EXCEPTION 'SPLIT payments are not currently supported for standalone customer sub-ledger payments';
    END IF;

    IF p_amount <= 0 THEN 
        RAISE EXCEPTION 'Payment amount must be positive'; 
    END IF;
    
    SELECT organization_id INTO v_org_id FROM public.stores WHERE id = p_store_id;
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Store not found';
    END IF;

    IF NOT public.is_store_member(p_store_id) AND NOT public.is_org_manager_or_owner(v_org_id) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Lock customer to prevent concurrent balance updates
    SELECT * INTO v_customer FROM public.customers WHERE id = p_customer_id AND organization_id = v_org_id FOR UPDATE;
    IF NOT FOUND THEN 
        RAISE EXCEPTION 'Customer not found or does not belong to your organization'; 
    END IF;

    -- For now, reject overpayments
    IF p_amount > v_customer.outstanding_balance THEN
        RAISE EXCEPTION 'Payment amount cannot exceed current outstanding balance';
    END IF;

    -- Create standalone Payment
    INSERT INTO public.payments (customer_id, organization_id, store_id, method, amount, status, provider_reference, notes, paid_at)
    VALUES (p_customer_id, v_org_id, p_store_id, p_method, p_amount, 'PAID', NULL, p_notes, NOW())
    RETURNING id INTO v_payment_id;

    -- Update Balance atomically
    v_new_balance := v_customer.outstanding_balance - p_amount;
    
    -- Insert into Ledger
    INSERT INTO public.customer_ledger (
        organization_id, customer_id, store_id, transaction_type, amount, balance_after, reference_id, notes, created_by
    ) VALUES (
        v_org_id, p_customer_id, p_store_id, 'PAYMENT', -p_amount, v_new_balance, v_payment_id, p_notes, auth.uid()
    );

    UPDATE public.customers SET outstanding_balance = v_new_balance WHERE id = p_customer_id;

    RETURN v_payment_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.record_customer_payment(UUID, UUID, NUMERIC, public.payment_method, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_customer_payment(UUID, UUID, NUMERIC, public.payment_method, TEXT) TO authenticated;
