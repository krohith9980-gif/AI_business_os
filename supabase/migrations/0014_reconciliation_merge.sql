-- Migration 0014: Safe Reconciliation of 0009, 0011, 0012, 0013, and Overload Fix

-- ==========================================
-- 0. FIX DUPLICATE FUNCTION OVERLOAD 
-- ==========================================
-- Safely drop the obsolete 13-parameter signature from 0010.
-- The 16-parameter signature from 0013 will remain as the sole authoritative function.
DROP FUNCTION IF EXISTS public.create_product_with_variant(
    UUID, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, UUID, TEXT, TEXT, JSONB, public.tracking_mode, TEXT, BOOLEAN
);

-- ==========================================
-- 1. From 0009: Purchasing Mutations
-- ==========================================
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Managers and owners insert suppliers') THEN
        CREATE POLICY "Managers and owners insert suppliers" ON public.suppliers FOR INSERT WITH CHECK (public.is_org_manager_or_owner(organization_id));
        CREATE POLICY "Managers and owners update suppliers" ON public.suppliers FOR UPDATE USING (public.is_org_manager_or_owner(organization_id)) WITH CHECK (public.is_org_manager_or_owner(organization_id));
    END IF;
END $$;

-- ==========================================
-- 2. From 0010: Type Creation (Failsafe)
-- ==========================================
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_creation_result') THEN
        CREATE TYPE public.product_creation_result AS (
            product_id UUID,
            variant_id UUID
        );
    END IF;
END $$;

-- ==========================================
-- 3. From 0011: Customer Ledger Tables
-- ==========================================
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS village TEXT,
ADD COLUMN IF NOT EXISTS outstanding_balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(12, 2);

CREATE INDEX IF NOT EXISTS idx_customers_village ON public.customers(organization_id, village);

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;

ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE RESTRICT,
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE RESTRICT,
ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE RESTRICT,
ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE public.payments ALTER COLUMN sale_id DROP NOT NULL;

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS chk_payment_target;
ALTER TABLE public.payments ADD CONSTRAINT chk_payment_target CHECK (
    (sale_id IS NOT NULL) OR (customer_id IS NOT NULL AND organization_id IS NOT NULL AND store_id IS NOT NULL)
);

DROP POLICY IF EXISTS "Payments visible to store members" ON public.payments;
DROP POLICY IF EXISTS "Payments visible to authorized users" ON public.payments;
CREATE POLICY "Payments visible to authorized users" ON public.payments FOR SELECT USING (
    (sale_id IS NOT NULL AND (
        public.is_store_member((SELECT store_id FROM public.sales WHERE id = sale_id)) OR 
        public.is_org_manager_or_owner((SELECT organization_id FROM public.sales WHERE id = sale_id))
    )) OR 
    (store_id IS NOT NULL AND (
        public.is_store_member(store_id) OR
        public.is_org_manager_or_owner(organization_id)
    ))
);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ledger_transaction_type') THEN
        CREATE TYPE ledger_transaction_type AS ENUM ('SALE', 'PAYMENT', 'RETURN', 'ADJUSTMENT');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.customer_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    store_id UUID REFERENCES public.stores(id) ON DELETE RESTRICT,
    transaction_type ledger_transaction_type NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    balance_after NUMERIC(12, 2) NOT NULL,
    reference_id UUID,
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.customer_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Ledger visible to org members" ON public.customer_ledger;
CREATE POLICY "Ledger visible to org members" ON public.customer_ledger FOR SELECT USING (public.is_org_member(organization_id));
CREATE INDEX IF NOT EXISTS idx_customer_ledger_customer ON public.customer_ledger(customer_id, created_at DESC);


-- ==========================================
-- 4. From 0012: Organization Setup
-- ==========================================
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS business_type TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS village TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT;

CREATE OR REPLACE FUNCTION public.create_organization_and_store(
    p_org_name TEXT, p_store_name TEXT, p_business_type TEXT, p_owner_name TEXT, p_phone TEXT, p_address TEXT, p_village TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_org_id UUID;
    v_store_id UUID;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id) THEN RAISE EXCEPTION 'User profile not found'; END IF;
    IF EXISTS (SELECT 1 FROM public.organization_members WHERE profile_id = v_user_id AND is_active = true) THEN
        RAISE EXCEPTION 'User already belongs to an active organization';
    END IF;

    INSERT INTO public.organizations (name, business_type, phone, address, village)
    VALUES (trim(p_org_name), trim(p_business_type), trim(p_phone), trim(p_address), trim(p_village))
    RETURNING id INTO v_org_id;

    INSERT INTO public.organization_members (organization_id, profile_id, role, is_active)
    VALUES (v_org_id, v_user_id, 'OWNER', true);

    INSERT INTO public.stores (organization_id, name, location, is_active)
    VALUES (v_org_id, trim(p_store_name), trim(p_address), true)
    RETURNING id INTO v_store_id;
    
    INSERT INTO public.user_stores (profile_id, store_id, is_active)
    VALUES (v_user_id, v_store_id, true);

    RETURN v_org_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_unauthorized_role_escalation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_member_count INT;
BEGIN
    IF NEW.role IN ('OWNER', 'MANAGER') THEN
        SELECT COUNT(*) INTO v_member_count FROM public.organization_members WHERE organization_id = NEW.organization_id;
        IF v_member_count > 0 THEN
            IF NOT public.is_org_owner(NEW.organization_id) THEN
                RAISE EXCEPTION 'Unauthorized: Only an OWNER can assign OWNER or MANAGER roles';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_organization_and_store(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_organization_and_store(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- ==========================================
-- 5. THE UNIFIED process_sale RPC (MERGING 0011 AND 0013)
-- ==========================================
CREATE OR REPLACE FUNCTION public.process_sale(
    p_store_id UUID,
    p_customer_id UUID,
    p_items JSONB,    
    p_payments JSONB 
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
        
        -- 0013 Packaging Logic
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

    -- 0011 Customer Ledger Lock
    IF p_customer_id IS NOT NULL THEN
        SELECT * INTO v_customer FROM public.customers WHERE id = p_customer_id AND organization_id = v_org_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found in this organization'; END IF;
    END IF;

    -- Create Sale
    INSERT INTO public.sales (store_id, organization_id, customer_id, cashier_id, status, subtotal, discount_total, tax_total, grand_total)
    VALUES (p_store_id, v_org_id, p_customer_id, auth.uid(), 'COMPLETED', v_subtotal, v_discount_total, v_tax_total, v_grand_total)
    RETURNING id INTO v_sale_id;

    -- 0011 Customer Ledger Execution Atomically
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
        SELECT * INTO v_variant FROM public.product_variants WHERE id = (v_item->>'variant_id')::UUID;
        
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
        INSERT INTO public.sale_items (sale_id, organization_id, variant_id, quantity, unit_purchase_cost, unit_selling_price, discount_amount, tax_rate, total_price)
        VALUES (v_sale_id, v_org_id, v_variant.id, v_qty, v_variant.purchase_cost, v_variant.selling_price, v_disc, 0, v_line_total);

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
REVOKE EXECUTE ON FUNCTION public.process_sale(UUID, UUID, JSONB, JSONB) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.process_sale(UUID, UUID, JSONB, JSONB) TO authenticated;

-- ==========================================
-- 6. From 0011: Standalone Payment RPC
-- ==========================================
CREATE OR REPLACE FUNCTION public.record_customer_payment(
    p_store_id UUID, p_customer_id UUID, p_amount NUMERIC, p_method public.payment_method, p_notes TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_org_id UUID; v_customer RECORD; v_payment_id UUID; v_new_balance NUMERIC;
BEGIN
    IF p_method = 'SPLIT' THEN RAISE EXCEPTION 'SPLIT payments are not currently supported for standalone customer sub-ledger payments'; END IF;
    IF p_amount <= 0 THEN RAISE EXCEPTION 'Payment amount must be positive'; END IF;
    
    SELECT organization_id INTO v_org_id FROM public.stores WHERE id = p_store_id;
    IF v_org_id IS NULL THEN RAISE EXCEPTION 'Store not found'; END IF;
    IF NOT public.is_store_member(p_store_id) AND NOT public.is_org_manager_or_owner(v_org_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    SELECT * INTO v_customer FROM public.customers WHERE id = p_customer_id AND organization_id = v_org_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found or does not belong to your organization'; END IF;
    IF p_amount > v_customer.outstanding_balance THEN RAISE EXCEPTION 'Payment amount cannot exceed current outstanding balance'; END IF;

    INSERT INTO public.payments (customer_id, organization_id, store_id, method, amount, status, provider_reference, notes, paid_at)
    VALUES (p_customer_id, v_org_id, p_store_id, p_method, p_amount, 'PAID', NULL, p_notes, NOW())
    RETURNING id INTO v_payment_id;

    v_new_balance := v_customer.outstanding_balance - p_amount;
    
    INSERT INTO public.customer_ledger (organization_id, customer_id, store_id, transaction_type, amount, balance_after, reference_id, notes, created_by)
    VALUES (v_org_id, p_customer_id, p_store_id, 'PAYMENT', -p_amount, v_new_balance, v_payment_id, p_notes, auth.uid());

    UPDATE public.customers SET outstanding_balance = v_new_balance WHERE id = p_customer_id;
    RETURN v_payment_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.record_customer_payment(UUID, UUID, NUMERIC, public.payment_method, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_customer_payment(UUID, UUID, NUMERIC, public.payment_method, TEXT) TO authenticated;
