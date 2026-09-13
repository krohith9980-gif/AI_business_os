-- Migration 0044: PO Items Packaging and Discounts
-- Adds packaging fields and line-level discount support to PO items, and round-off to POs.

-- 1. Add round_off to Purchase Orders
ALTER TABLE public.purchase_orders 
ADD COLUMN IF NOT EXISTS round_off NUMERIC(12, 2) NOT NULL DEFAULT 0;

-- 2. Add packaging and financial fields to PO Items
ALTER TABLE public.po_items 
ADD COLUMN IF NOT EXISTS package_quantity NUMERIC(12, 2),
ADD COLUMN IF NOT EXISTS package_unit TEXT,
ADD COLUMN IF NOT EXISTS units_per_package INTEGER,
ADD COLUMN IF NOT EXISTS gross_purchase_cost NUMERIC(12, 2),
ADD COLUMN IF NOT EXISTS discount_percentage NUMERIC(5, 2),
ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12, 2);

-- 3. Replace process_invoice_purchase with strict server authority math
CREATE OR REPLACE FUNCTION public.process_invoice_purchase(
    p_store_id UUID,
    p_supplier_id UUID,
    p_idempotency_key UUID,
    p_items JSONB, 
    -- Array of { is_new, variant_id, product_name, category_id, sku, barcode, 
    -- quantity, purchase_cost (net), sale_cost, attributes,
    -- package_quantity, package_unit, units_per_package, 
    -- gross_purchase_cost, discount_percentage, discount_amount }
    p_invoice_discount NUMERIC DEFAULT 0,
    p_additional_discount NUMERIC DEFAULT 0,
    p_tax_total NUMERIC DEFAULT 0,
    p_amount_paid NUMERIC DEFAULT 0,
    p_payment_method TEXT DEFAULT 'CASH',
    p_payment_reference TEXT DEFAULT NULL,
    p_round_off NUMERIC DEFAULT 0
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
    
    v_pkg_qty NUMERIC(12, 2);
    v_pkg_unit TEXT;
    v_units_per_pkg INTEGER;
    
    v_gross_cost NUMERIC(12, 2);
    v_discount_pct NUMERIC(5, 2);
    v_discount_amt NUMERIC(12, 2);
    v_net_cost NUMERIC(12, 2); -- The actual purchase_cost
    
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
    
    v_subtotal NUMERIC(12, 2) := 0; -- Net Subtotal
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

    -- Pre-calculate Net Subtotal to validate constraints
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_quantity := (v_item->>'quantity')::INTEGER;
        
        -- STRICT SERVER MATH
        v_gross_cost := COALESCE((v_item->>'gross_purchase_cost')::NUMERIC, (v_item->>'purchase_cost')::NUMERIC, 0);
        v_discount_amt := COALESCE((v_item->>'discount_amount')::NUMERIC, 0);
        
        IF v_quantity IS NULL OR v_quantity <= 0 THEN RAISE EXCEPTION 'Invalid quantity in purchase'; END IF;
        IF v_gross_cost < 0 THEN RAISE EXCEPTION 'Gross cost cannot be negative'; END IF;
        IF v_discount_amt < 0 THEN RAISE EXCEPTION 'Discount amount cannot be negative'; END IF;

        -- We derive the net cost per unit purely based on totals
        v_net_cost := ((v_quantity * v_gross_cost) - v_discount_amt) / v_quantity;
        
        IF v_net_cost < 0 THEN RAISE EXCEPTION 'Net purchase cost cannot be negative'; END IF;

        v_subtotal := v_subtotal + (v_quantity * v_net_cost);
    END LOOP;

    -- Calculate Grand Total (Net Subtotal - Invoice Discounts + Tax + Round Off)
    v_grand_total := v_subtotal - p_invoice_discount - p_additional_discount + p_tax_total + p_round_off;
    
    IF p_amount_paid > v_grand_total THEN RAISE EXCEPTION 'Payment cannot exceed final payable amount'; END IF;
    
    IF p_amount_paid = v_grand_total THEN v_payment_status := 'PAID';
    ELSIF p_amount_paid > 0 THEN v_payment_status := 'PARTIALLY_PAID';
    ELSE v_payment_status := 'PENDING'; END IF;

    -- 6. Safe Concurrency Idempotency Block
    BEGIN
        -- 7. Insert Purchase Order Header
        INSERT INTO public.purchase_orders (
            store_id, supplier_id, organization_id, status, created_by, idempotency_key,
            subtotal, invoice_discount, additional_discount, tax_total, round_off, grand_total, amount_paid, payment_status
        ) VALUES (
            p_store_id, p_supplier_id, v_org_id, 'COMPLETED', v_caller_id, p_idempotency_key,
            v_subtotal, p_invoice_discount, p_additional_discount, p_tax_total, p_round_off, v_grand_total, p_amount_paid, v_payment_status
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
            
            -- Packaging
            v_pkg_qty := (v_item->>'package_quantity')::NUMERIC;
            v_pkg_unit := v_item->>'package_unit';
            v_units_per_pkg := (v_item->>'units_per_package')::INTEGER;
            
            -- Financials
            v_gross_cost := COALESCE((v_item->>'gross_purchase_cost')::NUMERIC, (v_item->>'purchase_cost')::NUMERIC, 0);
            v_discount_pct := (v_item->>'discount_percentage')::NUMERIC;
            v_discount_amt := COALESCE((v_item->>'discount_amount')::NUMERIC, 0);
            
            -- Re-calculate authoritative net cost
            v_net_cost := ((v_quantity * v_gross_cost) - v_discount_amt) / v_quantity;

            v_sale_cost := (v_item->>'sale_cost')::NUMERIC;

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
                ) VALUES (v_product_id, v_org_id, v_sku, v_barcode, v_attributes, v_net_cost, v_sale_cost, true) RETURNING id INTO v_variant_id;
                
                INSERT INTO public.variant_price_history (
                    organization_id, variant_id, purchase_cost, selling_price
                ) VALUES (v_org_id, v_variant_id, v_net_cost, v_sale_cost);
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

            -- Insert PO Item preserving the legacy purchase_cost as NET, and adding new fields
            INSERT INTO public.po_items (
                po_id, po_store_id, organization_id, variant_id, quantity_ordered, quantity_received, 
                purchase_cost,
                package_quantity, package_unit, units_per_package,
                gross_purchase_cost, discount_percentage, discount_amount
            ) VALUES (
                v_new_po_id, p_store_id, v_org_id, v_variant_id, v_quantity, 0, 
                v_net_cost,
                v_pkg_qty, v_pkg_unit, v_units_per_pkg,
                v_gross_cost, v_discount_pct, v_discount_amt
            ) RETURNING id INTO v_po_item_id;

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
        SELECT outstanding_balance INTO v_current_balance 
        FROM public.suppliers 
        WHERE id = p_supplier_id FOR UPDATE;

        -- Apply Purchase
        v_balance_after_purchase := v_current_balance + v_grand_total;
        
        INSERT INTO public.supplier_ledger (
            organization_id, supplier_id, store_id, transaction_type, amount, balance_after, reference_id, notes, created_by
        ) VALUES (
            v_org_id, p_supplier_id, p_store_id, 'PURCHASE', v_grand_total, v_balance_after_purchase, v_new_po_id, 'Invoice Purchase', v_caller_id
        );

        v_current_balance := v_balance_after_purchase;

        -- Apply Payment
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
