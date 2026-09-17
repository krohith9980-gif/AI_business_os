-- Migration 0045: Optional SKU, Batch Numbers, and Manufacturing Dates

-- 1. Make SKU optional in product_variants
ALTER TABLE public.product_variants ALTER COLUMN sku DROP NOT NULL;

-- 2. Add Batch and Date tracking to purchasing tables
ALTER TABLE public.po_items ADD COLUMN batch_number TEXT;
ALTER TABLE public.po_items ADD COLUMN mfg_date DATE;
ALTER TABLE public.po_items ADD COLUMN expiry_date DATE;

ALTER TABLE public.purchase_receipt_items ADD COLUMN batch_number TEXT;
ALTER TABLE public.purchase_receipt_items ADD COLUMN mfg_date DATE;
ALTER TABLE public.purchase_receipt_items ADD COLUMN expiry_date DATE;

-- 3. Add Batch and Date tracking to inventory movements
ALTER TABLE public.inventory_movements ADD COLUMN batch_number TEXT;
ALTER TABLE public.inventory_movements ADD COLUMN mfg_date DATE;
ALTER TABLE public.inventory_movements ADD COLUMN expiry_date DATE;

-- 4. Update Inventory Movement RPC to accept Batch and Dates
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
    v_movement_id UUID;
    v_sign INTEGER;
    v_org_id UUID;
BEGIN
    -- 1. Resolve organization
    SELECT organization_id INTO v_org_id FROM public.stores WHERE id = p_store_id;
    IF v_org_id IS NULL THEN RAISE EXCEPTION 'Invalid store_id'; END IF;

    -- 2. Determine quantity sign
    CASE p_movement_type
        WHEN 'opening_stock', 'purchase_received', 'transfer_in' THEN v_sign := 1;
        WHEN 'sale', 'supplier_return', 'damage', 'transfer_out' THEN v_sign := -1;
        WHEN 'customer_return' THEN
            IF p_disposition = 'RESELLABLE' THEN v_sign := 1;
            ELSIF p_disposition = 'DAMAGED' THEN v_sign := 0; 
            ELSE RAISE EXCEPTION 'Invalid disposition for customer return'; END IF;
        WHEN 'adjustment', 'correction' THEN
            -- Positive or negative quantity is passed as absolute, but sign should be determined by the caller logic
            -- For simplicity in this raw function, we assume caller passes absolute value and dictates sign by type.
            -- Actually, adjustment/correction sign is tricky. We'll assume the caller passes the signed quantity here?
            -- No, quantity is strictly positive in the schema constraint: CHECK (quantity > 0)
            -- If adjustment/correction, we'd need specialized functions or pass sign.
            -- For this app's current usage, we only use 'purchase_received' here.
            v_sign := 1; 
    END CASE;

    -- 3. Insert Movement Record
    INSERT INTO public.inventory_movements (
        store_id, variant_id, movement_type, quantity, reference_id, notes, batch_number, mfg_date, expiry_date
    ) VALUES (
        p_store_id, p_variant_id, p_movement_type, p_quantity, p_reference_id, p_notes, p_batch_number, p_mfg_date, p_expiry_date
    ) RETURNING id INTO v_movement_id;

    -- 4. Update Balances
    -- Create balance record if it doesn't exist
    INSERT INTO public.inventory_balances (store_id, organization_id, variant_id, on_hand_stock, incoming_stock, damaged_stock)
    VALUES (p_store_id, v_org_id, p_variant_id, 0, 0, 0)
    ON CONFLICT (store_id, variant_id) DO NOTHING;

    -- Update quantities based on movement type
    IF p_movement_type = 'purchase_received' THEN
        UPDATE public.inventory_balances
        SET on_hand_stock = on_hand_stock + p_quantity,
            incoming_stock = GREATEST(0, incoming_stock - p_quantity),
            updated_at = NOW()
        WHERE store_id = p_store_id AND variant_id = p_variant_id;
    ELSIF p_movement_type = 'sale' THEN
        UPDATE public.inventory_balances
        SET on_hand_stock = on_hand_stock - p_quantity,
            updated_at = NOW()
        WHERE store_id = p_store_id AND variant_id = p_variant_id;
    ELSIF p_movement_type = 'customer_return' THEN
        IF p_disposition = 'RESELLABLE' THEN
            UPDATE public.inventory_balances
            SET on_hand_stock = on_hand_stock + p_quantity, updated_at = NOW()
            WHERE store_id = p_store_id AND variant_id = p_variant_id;
        ELSIF p_disposition = 'DAMAGED' THEN
            UPDATE public.inventory_balances
            SET damaged_stock = damaged_stock + p_quantity, updated_at = NOW()
            WHERE store_id = p_store_id AND variant_id = p_variant_id;
        END IF;
    ELSIF p_movement_type = 'damage' THEN
        UPDATE public.inventory_balances
        SET on_hand_stock = on_hand_stock - p_quantity,
            damaged_stock = damaged_stock + p_quantity,
            updated_at = NOW()
        WHERE store_id = p_store_id AND variant_id = p_variant_id;
    ELSE
        -- Generic fallback
        UPDATE public.inventory_balances
        SET on_hand_stock = on_hand_stock + (p_quantity * v_sign),
            updated_at = NOW()
        WHERE store_id = p_store_id AND variant_id = p_variant_id;
    END IF;

    RETURN v_movement_id;
END;
$$;


-- 5. Updated process_invoice_purchase with Batch and Dates
CREATE OR REPLACE FUNCTION public.process_invoice_purchase(
    p_store_id UUID,
    p_supplier_id UUID,
    p_idempotency_key UUID,
    p_items JSONB, -- Added batch_number, mfg_date, expiry_date to objects
    p_invoice_discount NUMERIC DEFAULT 0,
    p_additional_discount NUMERIC DEFAULT 0,
    p_tax_total NUMERIC DEFAULT 0,
    p_amount_paid NUMERIC DEFAULT 0,
    p_payment_method TEXT DEFAULT NULL,
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
    v_new_po_id UUID;
    v_receipt_id UUID;
    v_supplier_exists BOOLEAN;
    
    v_item JSONB;
    v_is_new BOOLEAN;
    v_variant_id UUID;
    v_product_id UUID;
    v_quantity INTEGER;
    
    v_gross_cost NUMERIC(12, 2);
    v_discount_pct NUMERIC(5, 2);
    v_discount_amt NUMERIC(12, 2);
    v_net_cost NUMERIC(12, 2);
    v_sale_cost NUMERIC(12, 2);
    
    v_pkg_qty NUMERIC(12, 3);
    v_pkg_unit TEXT;
    v_units_per_pkg INTEGER;
    
    v_product_name TEXT;
    v_sku TEXT;
    v_barcode TEXT;
    v_category_id UUID;
    v_attributes JSONB;
    
    v_batch_number TEXT;
    v_mfg_date DATE;
    v_expiry_date DATE;

    v_existing_selling_price NUMERIC(12, 2);
    v_existing_purchase_cost NUMERIC(12, 2);
    
    v_po_item_id UUID;
    v_receipt_item_id UUID;

    v_subtotal NUMERIC(12, 2) := 0;
    v_grand_total NUMERIC(12, 2) := 0;
    v_payment_status TEXT;
    v_ledger_id UUID;
BEGIN
    -- 1. Identify caller
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

    -- 2. Resolve organization
    SELECT organization_id INTO v_org_id FROM public.stores WHERE id = p_store_id;
    IF v_org_id IS NULL THEN RAISE EXCEPTION 'Invalid store_id'; END IF;

    -- 3. Verify RBAC
    IF NOT public.is_org_manager_or_owner(v_org_id) THEN
        RAISE EXCEPTION 'Unauthorized: Only Managers and Owners can create purchases';
    END IF;

    -- 4. Verify Supplier
    SELECT EXISTS (
        SELECT 1 FROM public.suppliers 
        WHERE id = p_supplier_id AND organization_id = v_org_id AND is_active = true
    ) INTO v_supplier_exists;
    IF NOT v_supplier_exists THEN RAISE EXCEPTION 'Supplier not found or unauthorized'; END IF;

    -- 5. Calculate Subtotal and Grand Total
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_quantity := (v_item->>'quantity')::INTEGER;
        
        v_gross_cost := COALESCE((v_item->>'gross_purchase_cost')::NUMERIC, (v_item->>'purchase_cost')::NUMERIC, 0);
        v_discount_amt := COALESCE((v_item->>'discount_amount')::NUMERIC, 0);
        
        IF v_quantity IS NULL OR v_quantity <= 0 THEN RAISE EXCEPTION 'Invalid quantity in purchase'; END IF;
        IF v_gross_cost < 0 THEN RAISE EXCEPTION 'Gross cost cannot be negative'; END IF;
        IF v_discount_amt < 0 THEN RAISE EXCEPTION 'Discount amount cannot be negative'; END IF;

        v_net_cost := ((v_quantity * v_gross_cost) - v_discount_amt) / v_quantity;
        IF v_net_cost < 0 THEN RAISE EXCEPTION 'Net purchase cost cannot be negative'; END IF;

        v_subtotal := v_subtotal + ((v_quantity * v_gross_cost) - v_discount_amt);
    END LOOP;

    v_grand_total := v_subtotal - p_invoice_discount - p_additional_discount + p_tax_total + p_round_off;
    
    IF p_amount_paid > v_grand_total THEN RAISE EXCEPTION 'Payment cannot exceed final payable amount'; END IF;
    
    IF p_amount_paid = v_grand_total THEN v_payment_status := 'PAID';
    ELSIF p_amount_paid > 0 THEN v_payment_status := 'PARTIALLY_PAID';
    ELSE v_payment_status := 'PENDING'; END IF;

    -- 6. Safe Concurrency Idempotency Block
    BEGIN
        -- 7. Insert Purchase Order
        INSERT INTO public.purchase_orders (
            store_id, supplier_id, organization_id, status, created_by, idempotency_key,
            subtotal, invoice_discount, additional_discount, tax_total, round_off, grand_total, amount_paid, payment_status
        ) VALUES (
            p_store_id, p_supplier_id, v_org_id, 'COMPLETED', v_caller_id, p_idempotency_key,
            v_subtotal, p_invoice_discount, p_additional_discount, p_tax_total, p_round_off, v_grand_total, p_amount_paid, v_payment_status
        ) RETURNING id INTO v_new_po_id;

        -- 8. Insert Receipt
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
            
            -- Batch/Lot and Dates
            v_batch_number := v_item->>'batch_number';
            v_mfg_date := (v_item->>'mfg_date')::DATE;
            v_expiry_date := (v_item->>'expiry_date')::DATE;

            -- Server-side Validation of Packaging Arithmetic
            IF v_pkg_qty IS NOT NULL AND v_pkg_qty > 0 AND v_units_per_pkg IS NOT NULL AND v_units_per_pkg > 0 THEN
                IF v_quantity != (v_pkg_qty * v_units_per_pkg) THEN
                    RAISE EXCEPTION 'Packaging arithmetic mismatch: base quantity (%) does not equal package quantity (%) * units per package (%)', v_quantity, v_pkg_qty, v_units_per_pkg;
                END IF;
            END IF;

            -- Financials
            v_gross_cost := COALESCE((v_item->>'gross_purchase_cost')::NUMERIC, (v_item->>'purchase_cost')::NUMERIC, 0);
            v_discount_pct := (v_item->>'discount_percentage')::NUMERIC;
            v_discount_amt := COALESCE((v_item->>'discount_amount')::NUMERIC, 0);
            v_net_cost := ((v_quantity * v_gross_cost) - v_discount_amt) / v_quantity;
            v_sale_cost := (v_item->>'sale_cost')::NUMERIC;

            IF v_is_new THEN
                IF v_sale_cost IS NULL OR v_sale_cost < 0 THEN RAISE EXCEPTION 'Sale cost is required for new products'; END IF;

                v_product_name := trim(v_item->>'product_name');
                v_category_id := (v_item->>'category_id')::UUID;
                v_sku := trim(v_item->>'sku');
                v_barcode := trim(v_item->>'barcode');
                v_attributes := v_item->'attributes';
                
                IF v_product_name IS NULL OR length(v_product_name) = 0 THEN RAISE EXCEPTION 'Product name is required for new products'; END IF;
                
                IF v_sku IS NOT NULL AND length(v_sku) = 0 THEN v_sku := NULL; END IF;
                IF v_barcode IS NOT NULL AND length(v_barcode) = 0 THEN v_barcode := NULL; END IF;

                -- Insert base product
                INSERT INTO public.products (organization_id, category_id, name, is_active) 
                VALUES (v_org_id, v_category_id, v_product_name, true) RETURNING id INTO v_product_id;
                
                -- Insert variant (sku is now nullable)
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

            -- Insert PO Item
            INSERT INTO public.po_items (
                po_id, po_store_id, organization_id, variant_id, quantity_ordered, quantity_received, 
                purchase_cost,
                package_quantity, package_unit, units_per_package,
                gross_purchase_cost, discount_percentage, discount_amount,
                batch_number, mfg_date, expiry_date
            ) VALUES (
                v_new_po_id, p_store_id, v_org_id, v_variant_id, v_quantity, 0, 
                v_net_cost,
                v_pkg_qty, v_pkg_unit, v_units_per_pkg,
                v_gross_cost, v_discount_pct, v_discount_amt,
                v_batch_number, v_mfg_date, v_expiry_date
            ) RETURNING id INTO v_po_item_id;

            -- Insert Receipt Item
            INSERT INTO public.purchase_receipt_items (
                receipt_id, receipt_po_id, po_item_id, po_item_po_id, quantity_received,
                batch_number, mfg_date, expiry_date
            ) VALUES (
                v_receipt_id, v_new_po_id, v_po_item_id, v_new_po_id, v_quantity,
                v_batch_number, v_mfg_date, v_expiry_date
            ) RETURNING id INTO v_receipt_item_id;

            -- Record Inventory Movement
            PERFORM public.record_inventory_movement(
                p_store_id, v_variant_id, 'purchase_received'::public.movement_type, v_quantity, v_receipt_id, 'Invoice Purchase Receipt', 'RESELLABLE'::public.return_disposition,
                v_batch_number, v_mfg_date, v_expiry_date
            );
        END LOOP;

        -- 10. Ledger Concurrency and Accounting Updates
        IF v_grand_total > 0 THEN
            INSERT INTO public.supplier_ledger (
                supplier_id, organization_id, store_id, transaction_type, reference_id,
                amount, balance_after, payment_method, reference_number, notes
            ) VALUES (
                p_supplier_id, v_org_id, p_store_id, 'PURCHASE', v_new_po_id,
                v_grand_total, 0, NULL, NULL, 'Invoice purchase'
            ) RETURNING id INTO v_ledger_id;

            UPDATE public.supplier_ledger sl
            SET balance_after = COALESCE((
                SELECT SUM(CASE WHEN transaction_type = 'PURCHASE' THEN amount ELSE -amount END)
                FROM public.supplier_ledger
                WHERE supplier_id = p_supplier_id AND id <= sl.id
            ), amount)
            WHERE id = v_ledger_id;
        END IF;

        IF p_amount_paid > 0 THEN
            INSERT INTO public.supplier_ledger (
                supplier_id, organization_id, store_id, transaction_type, reference_id,
                amount, balance_after, payment_method, reference_number, notes
            ) VALUES (
                p_supplier_id, v_org_id, p_store_id, 'PAYMENT', v_new_po_id,
                p_amount_paid, 0, p_payment_method, p_payment_reference, 'Immediate payment for invoice'
            ) RETURNING id INTO v_ledger_id;

            UPDATE public.supplier_ledger sl
            SET balance_after = COALESCE((
                SELECT SUM(CASE WHEN transaction_type = 'PURCHASE' THEN amount ELSE -amount END)
                FROM public.supplier_ledger
                WHERE supplier_id = p_supplier_id AND id <= sl.id
            ), -amount)
            WHERE id = v_ledger_id;
        END IF;

        UPDATE public.suppliers 
        SET outstanding_balance = COALESCE((
            SELECT SUM(CASE WHEN transaction_type = 'PURCHASE' THEN amount ELSE -amount END)
            FROM public.supplier_ledger
            WHERE supplier_id = p_supplier_id
        ), 0), updated_at = NOW()
        WHERE id = p_supplier_id;

        RETURN v_new_po_id;
    EXCEPTION
        WHEN unique_violation THEN
            RAISE EXCEPTION 'Idempotency key % already processed', p_idempotency_key;
        WHEN OTHERS THEN
            RAISE;
    END;
END;
$$;
