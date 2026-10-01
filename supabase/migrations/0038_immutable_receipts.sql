-- Migration 0038: Immutable Receipts and Concurrency-Safe Invoice Numbering

-- 1. Create concurrency-safe sequence table for store invoices
CREATE TABLE public.store_invoice_sequences (
    store_id UUID REFERENCES public.stores(id) ON DELETE RESTRICT,
    business_year INTEGER NOT NULL,
    last_value INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (store_id, business_year)
);

-- Protect the sequence table from direct manipulation
REVOKE ALL ON TABLE public.store_invoice_sequences FROM anon, authenticated, public;

-- 2. Add invoice_number to sales
ALTER TABLE public.sales ADD COLUMN invoice_number TEXT;
-- Enforce invoice number uniqueness per store
ALTER TABLE public.sales ADD CONSTRAINT uq_sales_store_invoice UNIQUE (store_id, invoice_number);

-- 3. Add historical snapshot fields to sale_items
ALTER TABLE public.sale_items ADD COLUMN product_name TEXT;
ALTER TABLE public.sale_items ADD COLUMN sku TEXT;

-- 4. Safely redefine process_sale to encapsulate immutable snapshotting and invoice allocation
-- DO NOT DROP 4-ARGUMENT LEGACY OVERLOAD
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
    
    -- Invoice generation variables
    v_business_year INTEGER;
    v_seq_num INTEGER;
    v_invoice_number TEXT;
BEGIN
    IF jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'Sale must contain at least one item'; END IF;

    SELECT organization_id INTO v_org_id FROM public.stores WHERE id = p_store_id;
    IF NOT public.is_store_member(p_store_id) AND NOT public.is_org_manager_or_owner(v_org_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    
    v_is_mgr := public.is_org_manager_or_owner(v_org_id);

    -- Calculate Totals and Verify Limits
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_display_qty := (v_item->>'display_quantity')::INTEGER;
        v_sale_unit := v_item->>'sale_unit';
        v_disc := COALESCE((v_item->>'discount_amount')::NUMERIC, 0);
        IF v_display_qty <= 0 THEN RAISE EXCEPTION 'Item quantity must be positive'; END IF;

        SELECT * INTO v_variant FROM public.product_variants WHERE id = (v_item->>'variant_id')::UUID AND organization_id = v_org_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Variant % not found', v_item->>'variant_id'; END IF;
        
        -- Packaging Logic
        IF v_sale_unit = v_variant.packaging_type AND v_variant.packaging_type != 'NONE' THEN
            v_qty := v_display_qty * v_variant.units_per_pack;
        ELSE
            v_qty := v_display_qty;
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

        -- Enforce credit limit if there is an unpaid amount from this sale
        IF (v_grand_total - v_payment_total) > 0 AND v_customer.credit_limit IS NOT NULL THEN
            IF (v_customer.outstanding_balance + (v_grand_total - v_payment_total)) > v_customer.credit_limit THEN
                RAISE EXCEPTION 'Transaction blocked: New outstanding balance (₹%) would exceed customer credit limit (₹%)', 
                    (v_customer.outstanding_balance + (v_grand_total - v_payment_total)), v_customer.credit_limit;
            END IF;
        END IF;
    END IF;

    -- =======================================================
    -- INVOICE NUMBER GENERATION (Concurrency-Safe)
    -- =======================================================
    v_business_year := EXTRACT(YEAR FROM NOW());
    
    INSERT INTO public.store_invoice_sequences (store_id, business_year, last_value)
    VALUES (p_store_id, v_business_year, 1)
    ON CONFLICT (store_id, business_year) DO UPDATE
    SET last_value = public.store_invoice_sequences.last_value + 1
    RETURNING last_value INTO v_seq_num;
    
    -- Format: INV-YYYY-00000X
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

    -- Customer Ledger Execution Atomically
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

    -- Insert Items and Deduct Inventory
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_display_qty := (v_item->>'display_quantity')::INTEGER;
        v_sale_unit := v_item->>'sale_unit';
        v_disc := COALESCE((v_item->>'discount_amount')::NUMERIC, 0);
        
        -- Retrieve variant and product snapshot securely
        SELECT v.*, p.name AS product_name 
        INTO v_variant 
        FROM public.product_variants v
        JOIN public.products p ON p.id = v.product_id
        WHERE v.id = (v_item->>'variant_id')::UUID;
        
        IF v_sale_unit = v_variant.packaging_type AND v_variant.packaging_type != 'NONE' THEN
            v_qty := v_display_qty * v_variant.units_per_pack;
        ELSE
            v_qty := v_display_qty;
        END IF;
        
        IF v_item->>'reservation_id' IS NOT NULL THEN
            SELECT * INTO v_res FROM public.inventory_reservations WHERE id = (v_item->>'reservation_id')::UUID FOR UPDATE;
            IF NOT FOUND OR v_res.status != 'ACTIVE' OR v_res.expires_at <= NOW() THEN RAISE EXCEPTION 'Reservation is not active or has expired'; END IF;
            IF v_res.store_id != p_store_id OR v_res.variant_id != v_variant.id THEN RAISE EXCEPTION 'Reservation does not match store or variant'; END IF;
            IF v_res.quantity != v_qty THEN RAISE EXCEPTION 'Reservation quantity (%) must match sale base quantity (%)', v_res.quantity, v_qty; END IF;
            UPDATE public.inventory_reservations SET status = 'COMPLETED' WHERE id = v_res.id;
        END IF;

        v_line_total := (v_variant.selling_price * v_qty) - v_disc;
        
        -- Insert with immutable snapshots (tax_rate preserved identically as 0)
        INSERT INTO public.sale_items (
            sale_id, organization_id, variant_id, quantity, 
            unit_purchase_cost, unit_selling_price, discount_amount, 
            tax_rate, total_price, product_name, sku
        )
        VALUES (
            v_sale_id, v_org_id, v_variant.id, v_qty, 
            v_variant.purchase_cost, v_variant.selling_price, v_disc, 
            0, v_line_total, v_variant.product_name, v_variant.sku
        );

        PERFORM public.record_inventory_movement(p_store_id, v_variant.id, 'sale'::public.movement_type, v_qty, v_sale_id, 'Sale', 'RESELLABLE'::public.return_disposition);
    END LOOP;

    -- Create Payments
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

REVOKE EXECUTE ON FUNCTION public.process_sale(UUID, UUID, JSONB, JSONB, TIMESTAMPTZ) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.process_sale(UUID, UUID, JSONB, JSONB, TIMESTAMPTZ) TO authenticated;
