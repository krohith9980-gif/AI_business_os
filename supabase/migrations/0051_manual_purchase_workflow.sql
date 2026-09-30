-- Migration 0051: Manual Purchase Workflow & Inventory Decoupling

-- 1. Add idempotency key to receipts
ALTER TABLE public.purchase_receipts ADD COLUMN IF NOT EXISTS idempotency_key UUID UNIQUE;

-- 2. Replace process_purchase_order (PO Creation ONLY)
CREATE OR REPLACE FUNCTION public.process_purchase_order(
    p_store_id UUID,
    p_supplier_id UUID,
    p_idempotency_key UUID,
    p_items JSONB -- Array of { variant_id: UUID, quantity: INTEGER, purchase_cost: NUMERIC, package_quantity: NUMERIC, package_unit: TEXT, units_per_package: INTEGER }
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
    v_supplier_exists BOOLEAN;
    
    v_item JSONB;
    v_variant_id UUID;
    v_quantity INTEGER;
    v_cost NUMERIC(12, 2);
    
    v_pkg_qty NUMERIC(12, 2);
    v_pkg_unit TEXT;
    v_units_per_pkg INTEGER;
    
    v_variant_exists BOOLEAN;
    v_constraint_name TEXT;
BEGIN
    -- Idempotency check 
    IF p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'idempotency_key is required';
    END IF;

    -- 1. Identify caller
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- 2. Validate Items Payload
    IF p_items IS NULL OR jsonb_typeof(p_items) != 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'A purchase must contain at least one item';
    END IF;

    -- 3. Resolve organization from store
    SELECT organization_id INTO v_org_id FROM public.stores WHERE id = p_store_id;
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Invalid store_id';
    END IF;

    -- 4. Verify RBAC (Owner or Manager)
    IF NOT public.is_org_manager_or_owner(v_org_id) THEN
        RAISE EXCEPTION 'Unauthorized: Only Managers and Owners can create purchases';
    END IF;

    -- 5. Verify Supplier belongs to the same org
    SELECT EXISTS (
        SELECT 1 FROM public.suppliers 
        WHERE id = p_supplier_id AND organization_id = v_org_id
    ) INTO v_supplier_exists;
    
    IF NOT v_supplier_exists THEN
        RAISE EXCEPTION 'Supplier not found or unauthorized for this organization';
    END IF;

    -- 6. Safe Concurrency Idempotency Block
    BEGIN
        -- Insert Purchase Order Header with status PENDING
        INSERT INTO public.purchase_orders (
            store_id, supplier_id, organization_id, status, created_by, idempotency_key
        ) VALUES (
            p_store_id, p_supplier_id, v_org_id, 'PENDING', v_caller_id, p_idempotency_key
        ) RETURNING id INTO v_new_po_id;

        -- Process Items (NO RECEIPTS, NO INVENTORY, NO LEDGER)
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
        LOOP
            v_variant_id := (v_item->>'variant_id')::UUID;
            v_quantity := (v_item->>'quantity')::INTEGER;
            v_cost := (v_item->>'purchase_cost')::NUMERIC;
            
            v_pkg_qty := (v_item->>'package_quantity')::NUMERIC;
            v_pkg_unit := NULLIF(UPPER(TRIM(v_item->>'package_unit')), '');
            v_units_per_pkg := (v_item->>'units_per_package')::INTEGER;
            
            -- Basic numeric validation
            IF v_quantity IS NULL OR v_quantity <= 0 THEN
                RAISE EXCEPTION 'Invalid base quantity for variant %', v_variant_id;
            END IF;
            IF v_cost IS NULL OR v_cost < 0 THEN
                RAISE EXCEPTION 'Invalid unit cost for variant %', v_variant_id;
            END IF;
            
            -- Server-side Package Arithmetic Validation
            IF v_pkg_unit IS NULL OR v_pkg_unit = 'PCS' THEN
                IF v_pkg_qty IS NOT NULL OR v_units_per_pkg IS NOT NULL THEN
                    IF COALESCE(v_units_per_pkg, 1) != 1 THEN
                        RAISE EXCEPTION 'Individual unit purchase (PCS) cannot have units_per_package != 1';
                    END IF;
                    IF COALESCE(v_pkg_qty, v_quantity) != v_quantity THEN
                        RAISE EXCEPTION 'Individual unit purchase (PCS) cannot have package_quantity differing from base quantity';
                    END IF;
                END IF;
            ELSIF v_pkg_unit IN ('BOX', 'CTN', 'CARTON', 'CASE', 'PACK', 'PAC', 'PKT', 'BAG', 'BTL', 'BOTTLE', 'STRIP', 'BALE', 'DOZEN', 'ROLL', 'DRUM', 'JAR', 'TIN', 'CAN') THEN
                IF v_pkg_qty IS NULL OR v_pkg_qty <= 0 THEN
                    RAISE EXCEPTION 'Package quantity must be > 0 when package unit is %', v_pkg_unit;
                END IF;
                IF v_units_per_pkg IS NULL OR v_units_per_pkg <= 0 THEN
                    RAISE EXCEPTION 'Units per package must be > 0 when package unit is %', v_pkg_unit;
                END IF;
                IF v_quantity != (v_pkg_qty * v_units_per_pkg) THEN
                    RAISE EXCEPTION 'Base quantity % must exactly equal package_quantity % * units_per_package %', v_quantity, v_pkg_qty, v_units_per_pkg;
                END IF;
            ELSE
                RAISE EXCEPTION 'Unknown or unsupported package_unit: %', v_pkg_unit;
            END IF;

            -- Verify Variant belongs to same org
            SELECT EXISTS (
                SELECT 1 FROM public.product_variants 
                WHERE id = v_variant_id AND organization_id = v_org_id
            ) INTO v_variant_exists;
            
            IF NOT v_variant_exists THEN
                RAISE EXCEPTION 'Product variant % not found or unauthorized', v_variant_id;
            END IF;

            -- Insert PO Item
            INSERT INTO public.po_items (
                po_id, po_store_id, organization_id, variant_id, 
                quantity_ordered, quantity_received, purchase_cost,
                package_quantity, package_unit, units_per_package
            ) VALUES (
                v_new_po_id, p_store_id, v_org_id, v_variant_id,
                v_quantity, 0, v_cost,
                v_pkg_qty, v_pkg_unit, v_units_per_pkg
            );
        END LOOP;

        RETURN v_new_po_id;
        
    EXCEPTION WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
        IF v_constraint_name LIKE '%idempotency_key%' THEN
            SELECT id INTO v_existing_po_id 
            FROM public.purchase_orders 
            WHERE idempotency_key = p_idempotency_key;
            
            RETURN v_existing_po_id;
        ELSE
            RAISE;
        END IF;
    END;
END;
$$;


-- 3. record_supplier_response
CREATE OR REPLACE FUNCTION public.record_supplier_response(
    p_po_id UUID,
    p_status public.po_status
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_po RECORD;
    v_org_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

    -- Lock PO
    SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order not found'; END IF;

    v_org_id := v_po.organization_id;

    -- Verify RBAC
    IF NOT public.is_org_manager_or_owner(v_org_id) THEN
        RAISE EXCEPTION 'Unauthorized: Only Managers and Owners can record supplier responses';
    END IF;

    IF v_po.status != 'PENDING' THEN
        RAISE EXCEPTION 'Purchase order is not in PENDING state';
    END IF;

    IF p_status NOT IN ('SUPPLIER_CONFIRMED', 'REJECTED', 'CANCELLED') THEN
        RAISE EXCEPTION 'Invalid status for supplier response: %', p_status;
    END IF;

    UPDATE public.purchase_orders
    SET status = p_status,
        updated_at = NOW()
    WHERE id = p_po_id;

    RETURN p_po_id;
END;
$$;


-- 4. record_goods_receipt
CREATE OR REPLACE FUNCTION public.record_goods_receipt(
    p_po_id UUID,
    p_idempotency_key UUID,
    p_items JSONB -- Array of { po_item_id: UUID, quantity_received: INTEGER, batch_number: TEXT, mfg_date: DATE, expiry_date: DATE }
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_po RECORD;
    v_org_id UUID;
    v_receipt_id UUID;
    
    v_existing_receipt RECORD;
    
    v_item JSONB;
    v_po_item_id UUID;
    v_qty_received INTEGER;
    v_batch_number TEXT;
    v_mfg_date DATE;
    v_expiry_date DATE;
    
    v_po_item RECORD;
    
    v_receipt_total NUMERIC(12, 2) := 0;
    v_current_balance NUMERIC(12, 2);
    v_balance_after_purchase NUMERIC(12, 2);
    
    v_tot_ordered INTEGER;
    v_tot_received INTEGER;
    v_new_status public.po_status;
    v_constraint_name TEXT;
BEGIN
    IF p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'idempotency_key is required';
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) != 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'A goods receipt must contain at least one item';
    END IF;

    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

    -- Lock PO
    SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order not found'; END IF;

    v_org_id := v_po.organization_id;

    -- Verify RBAC
    IF NOT public.is_org_manager_or_owner(v_org_id) THEN
        RAISE EXCEPTION 'Unauthorized: Only Managers and Owners can record goods receipt';
    END IF;

    IF v_po.status NOT IN ('SUPPLIER_CONFIRMED', 'PARTIAL_RECEIVED') THEN
        RAISE EXCEPTION 'Purchase order must be SUPPLIER_CONFIRMED or PARTIAL_RECEIVED';
    END IF;

    -- Safe Idempotency Check
    BEGIN
        INSERT INTO public.purchase_receipts (
            po_id, status, created_by, idempotency_key
        ) VALUES (
            p_po_id, 'COMPLETED', v_caller_id, p_idempotency_key
        ) RETURNING id INTO v_receipt_id;
    EXCEPTION WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
        IF v_constraint_name LIKE '%idempotency_key%' THEN
            SELECT * INTO v_existing_receipt FROM public.purchase_receipts WHERE idempotency_key = p_idempotency_key;
            IF FOUND THEN
                IF v_existing_receipt.po_id = p_po_id THEN
                    RETURN v_existing_receipt.id;
                ELSE
                    RAISE EXCEPTION 'Idempotency key already belongs to another purchase order';
                END IF;
            END IF;
        END IF;
        RAISE;
    END;

    -- Process items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_po_item_id := (v_item->>'po_item_id')::UUID;
        v_qty_received := (v_item->>'quantity_received')::INTEGER;
        v_batch_number := NULLIF(TRIM(v_item->>'batch_number'), '');
        v_mfg_date := (v_item->>'mfg_date')::DATE;
        v_expiry_date := (v_item->>'expiry_date')::DATE;
        
        IF v_qty_received IS NULL OR v_qty_received <= 0 THEN
            RAISE EXCEPTION 'Received quantity must be greater than 0';
        END IF;
        
        -- Lock PO Item
        SELECT * INTO v_po_item FROM public.po_items WHERE id = v_po_item_id AND po_id = p_po_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'PO item % not found on this PO', v_po_item_id; END IF;
        
        IF v_qty_received > (v_po_item.quantity_ordered - v_po_item.quantity_received) THEN
            RAISE EXCEPTION 'Cannot receive more than remaining quantity for item %', v_po_item_id;
        END IF;
        
        -- Insert Receipt Item
        -- (This triggers trg_update_po_received_qty which increments po_items.quantity_received)
        INSERT INTO public.purchase_receipt_items (
            receipt_id, receipt_po_id, po_item_id, po_item_po_id, quantity_received,
            batch_number, mfg_date, expiry_date
        ) VALUES (
            v_receipt_id, p_po_id, v_po_item_id, p_po_id, v_qty_received,
            v_batch_number, v_mfg_date, v_expiry_date
        );
        
        -- Record Inventory Movement
        PERFORM public.record_inventory_movement(
            v_po.store_id, v_po_item.variant_id, 'purchase_received'::public.movement_type, 
            v_qty_received, v_receipt_id, 'Purchase Order Receipt', 'RESELLABLE'::public.return_disposition,
            v_batch_number, v_mfg_date, v_expiry_date
        );
        
        -- Add to receipt total value for ledger
        v_receipt_total := v_receipt_total + (v_qty_received * v_po_item.purchase_cost);
    END LOOP;

    -- Update Supplier Ledger for actual received goods
    IF v_receipt_total > 0 THEN
        SELECT outstanding_balance INTO v_current_balance 
        FROM public.suppliers 
        WHERE id = v_po.supplier_id FOR UPDATE;

        v_balance_after_purchase := COALESCE(v_current_balance, 0) + v_receipt_total;
        
        INSERT INTO public.supplier_ledger (
            supplier_id, organization_id, store_id, transaction_type, reference_id,
            amount, balance_after, notes, created_by
        ) VALUES (
            v_po.supplier_id, v_org_id, v_po.store_id, 'PURCHASE', v_receipt_id,
            v_receipt_total, v_balance_after_purchase, 'Goods receipt for PO', v_caller_id
        );
        
        UPDATE public.suppliers 
        SET outstanding_balance = v_balance_after_purchase 
        WHERE id = v_po.supplier_id;
    END IF;

    -- Re-evaluate PO Status
    -- Note: The triggers on purchase_receipt_items have already incremented quantity_received
    SELECT COALESCE(SUM(quantity_ordered), 0), COALESCE(SUM(quantity_received), 0)
    INTO v_tot_ordered, v_tot_received
    FROM public.po_items WHERE po_id = p_po_id;
    
    IF v_tot_received >= v_tot_ordered THEN
        v_new_status := 'COMPLETED';
    ELSE
        v_new_status := 'PARTIAL_RECEIVED';
    END IF;
    
    UPDATE public.purchase_orders
    SET status = v_new_status,
        updated_at = NOW()
    WHERE id = p_po_id;

    RETURN v_receipt_id;
END;
$$;
