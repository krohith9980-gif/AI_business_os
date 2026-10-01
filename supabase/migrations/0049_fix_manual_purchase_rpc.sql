-- Migration 0049: Fix Manual Purchase RPC Constraint and Package Support

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
    v_receipt_id UUID;
    v_supplier_exists BOOLEAN;
    
    v_item JSONB;
    v_variant_id UUID;
    v_quantity INTEGER;
    v_cost NUMERIC(12, 2);
    
    v_pkg_qty NUMERIC(12, 2);
    v_pkg_unit TEXT;
    v_units_per_pkg INTEGER;
    
    v_variant_exists BOOLEAN;
    
    v_po_item_id UUID;
    v_receipt_item_id UUID;
    
    v_constraint_name TEXT;
BEGIN
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
        -- Insert Purchase Order Header
        INSERT INTO public.purchase_orders (
            store_id, supplier_id, organization_id, status, created_by, idempotency_key
        ) VALUES (
            p_store_id, p_supplier_id, v_org_id, 'COMPLETED', v_caller_id, p_idempotency_key
        ) RETURNING id INTO v_new_po_id;

        -- Insert Receipt Header
        INSERT INTO public.purchase_receipts (
            po_id, status, created_by
        ) VALUES (
            v_new_po_id, 'COMPLETED', v_caller_id
        ) RETURNING id INTO v_receipt_id;

        -- Process Items
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
                -- Individual / base-unit purchase
                IF v_pkg_qty IS NOT NULL OR v_units_per_pkg IS NOT NULL THEN
                    IF COALESCE(v_units_per_pkg, 1) != 1 THEN
                        RAISE EXCEPTION 'Individual unit purchase (PCS) cannot have units_per_package != 1';
                    END IF;
                    IF COALESCE(v_pkg_qty, v_quantity) != v_quantity THEN
                        RAISE EXCEPTION 'Individual unit purchase (PCS) cannot have package_quantity differing from base quantity';
                    END IF;
                END IF;
            ELSIF v_pkg_unit IN ('BOX', 'CTN', 'CARTON', 'CASE', 'PACK', 'PAC', 'PKT', 'BAG', 'BTL', 'BOTTLE', 'STRIP', 'BALE', 'DOZEN', 'ROLL', 'DRUM', 'JAR', 'TIN', 'CAN') THEN
                -- Supported Package Purchase
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
                -- Unknown/Unsupported Package Unit
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
            -- BUGFIX: quantity_received must be initialized to 0 because trg_update_po_received_qty 
            -- will automatically increment it when the purchase_receipt_items row is inserted.
            INSERT INTO public.po_items (
                po_id, po_store_id, organization_id, variant_id, 
                quantity_ordered, quantity_received, purchase_cost,
                package_quantity, package_unit, units_per_package
            ) VALUES (
                v_new_po_id, p_store_id, v_org_id, v_variant_id,
                v_quantity, 0, v_cost,
                v_pkg_qty, v_pkg_unit, v_units_per_pkg
            ) RETURNING id INTO v_po_item_id;

            -- Insert Receipt Item
            INSERT INTO public.purchase_receipt_items (
                receipt_id, receipt_po_id, po_item_id, po_item_po_id, quantity_received
            ) VALUES (
                v_receipt_id, v_new_po_id, v_po_item_id, v_new_po_id, v_quantity
            ) RETURNING id INTO v_receipt_item_id;

            -- Record Inventory Movement
            -- Pass explicitly validated base v_quantity.
            -- Pass NULLs for batch params as manual UI currently does not capture them.
            PERFORM public.record_inventory_movement(
                p_store_id,
                v_variant_id,
                'purchase_received'::public.movement_type,
                v_quantity,
                v_receipt_id,
                'Purchase Order Receipt',
                'RESELLABLE'::public.return_disposition,
                NULL, -- p_batch_number
                NULL, -- p_mfg_date
                NULL  -- p_expiry_date
            );
        END LOOP;

        RETURN v_new_po_id;
        
    EXCEPTION WHEN unique_violation THEN
        -- Safely return the existing ID to the caller so both requests resolve to the same result
        -- ONLY if the conflict was on the idempotency_key constraint
        GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
        IF v_constraint_name LIKE '%idempotency_key%' THEN
            SELECT id INTO v_existing_po_id 
            FROM public.purchase_orders 
            WHERE idempotency_key = p_idempotency_key;
            
            RETURN v_existing_po_id;
        ELSE
            RAISE; -- Re-raise if it's an unrelated unique constraint failure
        END IF;
    END;
END;
$$;
