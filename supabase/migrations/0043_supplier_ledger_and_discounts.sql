-- Migration 0043: Supplier Ledger, Discounts, and Payments

-- 1. Suppliers - Add Outstanding Balance
ALTER TABLE public.suppliers 
ADD COLUMN IF NOT EXISTS outstanding_balance NUMERIC(12, 2) NOT NULL DEFAULT 0;

-- 2. Purchase Orders - Add Financial Totals and Payment Tracking
ALTER TABLE public.purchase_orders 
ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS invoice_discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS additional_discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS tax_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS grand_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS payment_status payment_status NOT NULL DEFAULT 'PENDING';

-- 3. Supplier Payments (Standalone Accounts Payable tracking)
CREATE TABLE IF NOT EXISTS public.supplier_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id UUID REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
    method payment_method NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    reference TEXT,
    notes TEXT,
    idempotency_key UUID UNIQUE,
    created_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT chk_supplier_payment_amount_positive CHECK (amount > 0)
);
CREATE TRIGGER set_supplier_payments_updated_at BEFORE UPDATE ON public.supplier_payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Supplier payments visible to authorized users" ON public.supplier_payments FOR SELECT USING (
    public.is_store_member(store_id) OR public.is_org_manager_or_owner(organization_id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier_id ON public.supplier_payments(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_po_id ON public.supplier_payments(po_id);

-- 4. Supplier Sub-Ledger (Authoritative log for AP)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'supplier_transaction_type') THEN
        CREATE TYPE supplier_transaction_type AS ENUM ('OPENING_BALANCE', 'PURCHASE', 'PAYMENT', 'ADJUSTMENT', 'RETURN');
    END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.supplier_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
    store_id UUID REFERENCES public.stores(id) ON DELETE RESTRICT,
    transaction_type supplier_transaction_type NOT NULL,
    amount NUMERIC(12, 2) NOT NULL, -- Positive for Purchase (increases payable), Negative for Payment (decreases payable)
    balance_after NUMERIC(12, 2) NOT NULL,
    reference_id UUID, -- References po_id, supplier_payment_id, etc.
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.supplier_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Supplier ledger visible to org members" ON public.supplier_ledger FOR SELECT USING (public.is_org_member(organization_id));
CREATE INDEX IF NOT EXISTS idx_supplier_ledger_supplier ON public.supplier_ledger(supplier_id, created_at DESC);


-- 5. Updated process_invoice_purchase RPC (now enforcing ledger atomicity and constraints)
CREATE OR REPLACE FUNCTION public.process_invoice_purchase(
    p_store_id UUID,
    p_supplier_id UUID,
    p_idempotency_key UUID,
    p_items JSONB, -- Array of { is_new, variant_id, product_name, category_id, sku, barcode, purchase_cost, sale_cost, quantity, attributes }
    p_invoice_discount NUMERIC DEFAULT 0,
    p_additional_discount NUMERIC DEFAULT 0,
    p_tax_total NUMERIC DEFAULT 0,
    p_amount_paid NUMERIC DEFAULT 0,
    p_payment_method TEXT DEFAULT 'CASH',
    p_payment_reference TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_org_id UUID;
    v_existing_po_id UUID;
    v_new_po_id UUID;
    v_receipt_id UUID;
    v_supplier_exists BOOLEAN;
    
    v_item JSONB;
    v_is_new BOOLEAN;
    v_variant_id UUID;
    v_product_id UUID;
    v_quantity INTEGER;
    v_cost NUMERIC(12, 2);
    v_sale_cost NUMERIC(12, 2);
    
    v_product_name TEXT;
    v_sku TEXT;
    v_barcode TEXT;
    v_category_id UUID;
    v_attributes JSONB;
    
    v_existing_selling_price NUMERIC(12, 2);
    v_existing_purchase_cost NUMERIC(12, 2);
    
    v_po_item_id UUID;
    v_receipt_item_id UUID;
    
    v_subtotal NUMERIC(12, 2) := 0;
    v_grand_total NUMERIC(12, 2) := 0;
    v_payment_status public.payment_status := 'PENDING';
    
    v_current_balance NUMERIC(12, 2);
    v_balance_after_purchase NUMERIC(12, 2);
    v_balance_after_payment NUMERIC(12, 2);
    v_payment_id UUID;
BEGIN
    -- 1. Identify caller
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

    -- 2. Resolve organization from store
    SELECT organization_id INTO v_org_id FROM public.stores WHERE id = p_store_id;
    IF v_org_id IS NULL THEN RAISE EXCEPTION 'Invalid store_id'; END IF;

    -- 3. Verify RBAC (Owner or Manager)
    IF NOT public.is_org_manager_or_owner(v_org_id) THEN
        RAISE EXCEPTION 'Unauthorized: Only Managers and Owners can create purchases';
    END IF;

    -- 4. Verify Supplier belongs to the same org
    SELECT EXISTS (
        SELECT 1 FROM public.suppliers 
        WHERE id = p_supplier_id AND organization_id = v_org_id AND is_active = true
    ) INTO v_supplier_exists;
    IF NOT v_supplier_exists THEN RAISE EXCEPTION 'Supplier not found or unauthorized for this organization'; END IF;

    -- 5. Validate Payment Amounts and Status
    IF p_invoice_discount < 0 OR p_additional_discount < 0 THEN RAISE EXCEPTION 'Discounts cannot be negative'; END IF;
    IF p_tax_total < 0 THEN RAISE EXCEPTION 'Tax cannot be negative'; END IF;
    IF p_amount_paid < 0 THEN RAISE EXCEPTION 'Amount paid cannot be negative'; END IF;

    -- Pre-calculate subtotal to validate constraints
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_quantity := (v_item->>'quantity')::INTEGER;
        v_cost := COALESCE((v_item->>'purchase_cost')::NUMERIC, 0);
        IF v_quantity > 0 AND v_cost >= 0 THEN
            v_subtotal := v_subtotal + (v_quantity * v_cost);
        END IF;
    END LOOP;

    -- Calculate Grand Total (Owner % discount is expected to be calculated by UI and passed as absolute p_additional_discount value)
    v_grand_total := v_subtotal - p_invoice_discount - p_additional_discount + p_tax_total;
    
    IF p_amount_paid > v_grand_total THEN RAISE EXCEPTION 'Payment cannot exceed final payable amount'; END IF;
    
    IF p_amount_paid = v_grand_total THEN v_payment_status := 'PAID';
    ELSIF p_amount_paid > 0 THEN v_payment_status := 'PARTIALLY_PAID';
    ELSE v_payment_status := 'PENDING'; END IF;

    -- 6. Safe Concurrency Idempotency Block
    BEGIN
        -- 7. Insert Purchase Order Header
        INSERT INTO public.purchase_orders (
            store_id, supplier_id, organization_id, status, created_by, idempotency_key,
            subtotal, invoice_discount, additional_discount, tax_total, grand_total, amount_paid, payment_status
        ) VALUES (
            p_store_id, p_supplier_id, v_org_id, 'COMPLETED', v_caller_id, p_idempotency_key,
            v_subtotal, p_invoice_discount, p_additional_discount, p_tax_total, v_grand_total, p_amount_paid, v_payment_status
        ) RETURNING id INTO v_new_po_id;

        -- 8. Insert Receipt Header
        INSERT INTO public.purchase_receipts (
            po_id, status, created_by
        ) VALUES (
            v_new_po_id, 'COMPLETED', v_caller_id
        ) RETURNING id INTO v_receipt_id;

        -- 9. Process Items
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
        LOOP
            v_is_new := COALESCE((v_item->>'is_new')::BOOLEAN, false);
            v_quantity := (v_item->>'quantity')::INTEGER;
            v_cost := COALESCE((v_item->>'purchase_cost')::NUMERIC, 0);
            v_sale_cost := (v_item->>'sale_cost')::NUMERIC;
            
            IF v_quantity IS NULL OR v_quantity <= 0 THEN RAISE EXCEPTION 'Invalid quantity in purchase'; END IF;
            IF v_cost IS NULL OR v_cost < 0 THEN RAISE EXCEPTION 'Invalid cost in purchase'; END IF;

            IF v_is_new THEN
                IF v_sale_cost IS NULL OR v_sale_cost < 0 THEN RAISE EXCEPTION 'Sale cost is required for new products'; END IF;

                v_product_name := v_item->>'product_name';
                v_category_id := (v_item->>'category_id')::UUID;
                v_sku := v_item->>'sku';
                v_barcode := v_item->>'barcode';
                v_attributes := v_item->'attributes';
                
                IF v_product_name IS NULL OR length(trim(v_product_name)) = 0 THEN RAISE EXCEPTION 'Product name is required for new products'; END IF;
                
                IF v_sku IS NULL OR length(trim(v_sku)) = 0 THEN
                    v_sku := 'SYS-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
                END IF;
                IF v_barcode IS NOT NULL AND length(trim(v_barcode)) = 0 THEN v_barcode := NULL; END IF;

                INSERT INTO public.products (organization_id, category_id, name, is_active) 
                VALUES (v_org_id, v_category_id, v_product_name, true) RETURNING id INTO v_product_id;
                
                INSERT INTO public.product_variants (
                    product_id, organization_id, sku, barcode, attributes, purchase_cost, selling_price, is_active
                ) VALUES (v_product_id, v_org_id, v_sku, v_barcode, v_attributes, v_cost, v_sale_cost, true) RETURNING id INTO v_variant_id;
                
                INSERT INTO public.variant_price_history (
                    organization_id, variant_id, purchase_cost, selling_price
                ) VALUES (v_org_id, v_variant_id, v_cost, v_sale_cost);
            ELSE
                v_variant_id := (v_item->>'variant_id')::UUID;
                IF v_variant_id IS NULL THEN RAISE EXCEPTION 'Variant ID is required for existing products'; END IF;

                SELECT selling_price, purchase_cost INTO v_existing_selling_price, v_existing_purchase_cost
                FROM public.product_variants 
                WHERE id = v_variant_id AND organization_id = v_org_id AND is_active = true;
                
                IF NOT FOUND THEN RAISE EXCEPTION 'Product variant % not found or unauthorized', v_variant_id; END IF;

                IF v_sale_cost IS NOT NULL AND v_sale_cost != v_existing_selling_price THEN
                    UPDATE public.product_variants
                    SET selling_price = v_sale_cost, updated_at = NOW() WHERE id = v_variant_id;

                    INSERT INTO public.variant_price_history (
                        organization_id, variant_id, purchase_cost, selling_price
                    ) VALUES (v_org_id, v_variant_id, v_existing_purchase_cost, v_sale_cost);
                END IF;
            END IF;

            -- Insert PO Item
            INSERT INTO public.po_items (
                po_id, po_store_id, organization_id, variant_id, quantity_ordered, quantity_received, purchase_cost
            ) VALUES (v_new_po_id, p_store_id, v_org_id, v_variant_id, v_quantity, 0, v_cost) RETURNING id INTO v_po_item_id;

            -- Insert Receipt Item
            INSERT INTO public.purchase_receipt_items (
                receipt_id, receipt_po_id, po_item_id, po_item_po_id, quantity_received
            ) VALUES (v_receipt_id, v_new_po_id, v_po_item_id, v_new_po_id, v_quantity) RETURNING id INTO v_receipt_item_id;

            -- Record Inventory Movement
            PERFORM public.record_inventory_movement(
                p_store_id, v_variant_id, 'purchase_received'::public.movement_type, v_quantity, v_receipt_id, 'Invoice Purchase Receipt', 'RESELLABLE'::public.return_disposition
            );
        END LOOP;

        -- 10. Ledger Concurrency and Accounting Updates
        -- Lock the supplier row to prevent concurrent balance corruption
        SELECT outstanding_balance INTO v_current_balance 
        FROM public.suppliers 
        WHERE id = p_supplier_id FOR UPDATE;

        -- Apply Purchase (Debit to Supplier Payable)
        v_balance_after_purchase := v_current_balance + v_grand_total;
        
        INSERT INTO public.supplier_ledger (
            organization_id, supplier_id, store_id, transaction_type, amount, balance_after, reference_id, notes, created_by
        ) VALUES (
            v_org_id, p_supplier_id, p_store_id, 'PURCHASE', v_grand_total, v_balance_after_purchase, v_new_po_id, 'Invoice Purchase', v_caller_id
        );

        v_current_balance := v_balance_after_purchase;

        -- Apply Payment (Credit to Supplier Payable)
        IF p_amount_paid > 0 THEN
            INSERT INTO public.supplier_payments (
                po_id, supplier_id, organization_id, store_id, method, amount, reference, created_by
            ) VALUES (
                v_new_po_id, p_supplier_id, v_org_id, p_store_id, p_payment_method::public.payment_method, p_amount_paid, p_payment_reference, v_caller_id
            ) RETURNING id INTO v_payment_id;

            v_balance_after_payment := v_current_balance - p_amount_paid;

            INSERT INTO public.supplier_ledger (
                organization_id, supplier_id, store_id, transaction_type, amount, balance_after, reference_id, notes, created_by
            ) VALUES (
                v_org_id, p_supplier_id, p_store_id, 'PAYMENT', -p_amount_paid, v_balance_after_payment, v_payment_id, 'Payment at Purchase', v_caller_id
            );

            v_current_balance := v_balance_after_payment;
        END IF;

        -- Finally, safely write the derivative field
        UPDATE public.suppliers 
        SET outstanding_balance = v_current_balance, updated_at = NOW() 
        WHERE id = p_supplier_id;

        RETURN v_new_po_id;
        
    EXCEPTION WHEN unique_violation THEN
        SELECT id INTO v_existing_po_id FROM public.purchase_orders WHERE idempotency_key = p_idempotency_key;
        IF v_existing_po_id IS NOT NULL THEN RETURN v_existing_po_id; END IF;
        RAISE EXCEPTION 'Unique constraint violation (e.g., SKU or Barcode already exists).';
    END;
END;
$$;


-- 6. RPC for Later Supplier Payments
CREATE OR REPLACE FUNCTION public.record_supplier_payment(
    p_store_id UUID,
    p_supplier_id UUID,
    p_idempotency_key UUID,
    p_amount NUMERIC,
    p_method TEXT,
    p_reference TEXT,
    p_notes TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_org_id UUID;
    v_existing_payment_id UUID;
    v_new_payment_id UUID;
    v_supplier_exists BOOLEAN;
    v_current_balance NUMERIC(12, 2);
    v_balance_after_payment NUMERIC(12, 2);
BEGIN
    -- 1. Identify caller
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

    -- 2. Resolve organization
    SELECT organization_id INTO v_org_id FROM public.stores WHERE id = p_store_id;
    IF v_org_id IS NULL THEN RAISE EXCEPTION 'Invalid store_id'; END IF;

    -- 3. Verify RBAC
    IF NOT public.is_org_manager_or_owner(v_org_id) THEN
        RAISE EXCEPTION 'Unauthorized: Only Managers and Owners can record supplier payments';
    END IF;

    -- 4. Validate Inputs
    IF p_amount <= 0 THEN RAISE EXCEPTION 'Payment amount must be greater than zero'; END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.suppliers 
        WHERE id = p_supplier_id AND organization_id = v_org_id AND is_active = true
    ) INTO v_supplier_exists;
    IF NOT v_supplier_exists THEN RAISE EXCEPTION 'Supplier not found or unauthorized'; END IF;

    -- 5. Safe Concurrency Idempotency Block
    BEGIN
        -- Lock Supplier
        SELECT outstanding_balance INTO v_current_balance 
        FROM public.suppliers 
        WHERE id = p_supplier_id FOR UPDATE;

        -- We DO allow overpayment (credit balance) generally in supplier accounts unless strictly forbidden.
        -- But normally payments reduce the positive payable.
        
        -- Insert Payment
        INSERT INTO public.supplier_payments (
            supplier_id, organization_id, store_id, method, amount, reference, notes, idempotency_key, created_by
        ) VALUES (
            p_supplier_id, v_org_id, p_store_id, p_method::public.payment_method, p_amount, p_reference, p_notes, p_idempotency_key, v_caller_id
        ) RETURNING id INTO v_new_payment_id;

        v_balance_after_payment := v_current_balance - p_amount;

        -- Insert Ledger
        INSERT INTO public.supplier_ledger (
            organization_id, supplier_id, store_id, transaction_type, amount, balance_after, reference_id, notes, created_by
        ) VALUES (
            v_org_id, p_supplier_id, p_store_id, 'PAYMENT', -p_amount, v_balance_after_payment, v_new_payment_id, COALESCE(p_notes, 'Standalone Payment'), v_caller_id
        );

        -- Update Balance
        UPDATE public.suppliers 
        SET outstanding_balance = v_balance_after_payment, updated_at = NOW() 
        WHERE id = p_supplier_id;

        RETURN v_new_payment_id;

    EXCEPTION WHEN unique_violation THEN
        SELECT id INTO v_existing_payment_id FROM public.supplier_payments WHERE idempotency_key = p_idempotency_key;
        IF v_existing_payment_id IS NOT NULL THEN RETURN v_existing_payment_id; END IF;
        RAISE EXCEPTION 'Unique constraint violation handling payment.';
    END;
END;
$$;

-- 7. RPC to Create Supplier with Optional Opening Balance
CREATE OR REPLACE FUNCTION public.create_supplier_with_opening_balance(
    p_name TEXT,
    p_attributes JSONB,
    p_store_id UUID, -- For the ledger store_id reference if provided
    p_opening_balance NUMERIC DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_org_id UUID;
    v_supplier_id UUID;
BEGIN
    -- 1. Identify caller
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

    -- 2. Resolve organization (use store_id if provided, else rely on member profile)
    IF p_store_id IS NOT NULL THEN
        SELECT organization_id INTO v_org_id FROM public.stores WHERE id = p_store_id;
    ELSE
        SELECT organization_id INTO v_org_id FROM public.organization_members 
        WHERE profile_id = v_caller_id AND is_active = true LIMIT 1;
    END IF;
    
    IF v_org_id IS NULL THEN RAISE EXCEPTION 'Invalid organization context'; END IF;

    -- 3. Verify RBAC
    IF NOT public.is_org_manager_or_owner(v_org_id) THEN
        RAISE EXCEPTION 'Unauthorized: Only Managers and Owners can create suppliers';
    END IF;

    -- 4. Validate Inputs
    IF p_opening_balance < 0 THEN RAISE EXCEPTION 'Opening balance cannot be negative'; END IF;
    IF p_name IS NULL OR length(trim(p_name)) = 0 THEN RAISE EXCEPTION 'Supplier name is required'; END IF;

    -- 5. Safe Concurrency Transaction
    BEGIN
        -- Insert Supplier with starting outstanding balance
        INSERT INTO public.suppliers (
            organization_id, name, is_active, attributes, outstanding_balance
        ) VALUES (
            v_org_id, trim(p_name), true, p_attributes, p_opening_balance
        ) RETURNING id INTO v_supplier_id;

        -- Create Ledger Entry only if > 0
        IF p_opening_balance > 0 THEN
            INSERT INTO public.supplier_ledger (
                organization_id, supplier_id, store_id, transaction_type, amount, balance_after, notes, created_by
            ) VALUES (
                v_org_id, v_supplier_id, p_store_id, 'OPENING_BALANCE', p_opening_balance, p_opening_balance, 'Opening Balance', v_caller_id
            );
        END IF;

        RETURN v_supplier_id;

    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'A supplier with this name already exists in your organization.';
    END;
END;
$$;
