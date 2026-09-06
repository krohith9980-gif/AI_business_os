-- Migration 0040: Atomic Purchase Creation RPC

-- Ensure purchase_orders has an idempotency_key for true idempotency
ALTER TABLE public.purchase_orders 
ADD COLUMN IF NOT EXISTS idempotency_key UUID UNIQUE;

CREATE OR REPLACE FUNCTION public.process_purchase_order(
    p_store_id UUID,
    p_supplier_id UUID,
    p_idempotency_key UUID,
    p_items JSONB -- Array of { variant_id: UUID, quantity: INTEGER, purchase_cost: NUMERIC }
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
    v_variant_exists BOOLEAN;
    
    v_po_item_id UUID;
    v_receipt_item_id UUID;
BEGIN
    -- 1. Identify caller
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- 2. Resolve organization from store
    SELECT organization_id INTO v_org_id FROM public.stores WHERE id = p_store_id;
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Invalid store_id';
    END IF;

    -- 3. Verify RBAC (Owner or Manager)
    IF NOT public.is_org_manager_or_owner(v_org_id) THEN
        RAISE EXCEPTION 'Unauthorized: Only Managers and Owners can create purchases';
    END IF;

    -- 4. Verify Supplier belongs to the same org
    SELECT EXISTS (
        SELECT 1 FROM public.suppliers 
        WHERE id = p_supplier_id AND organization_id = v_org_id
    ) INTO v_supplier_exists;
    
    IF NOT v_supplier_exists THEN
        RAISE EXCEPTION 'Supplier not found or unauthorized for this organization';
    END IF;

    -- 5. Safe Concurrency Idempotency Block
    -- In PostgreSQL, if two transactions try to insert the same unique key simultaneously,
    -- one will proceed and the other will wait. Once the first commits, the second throws
    -- unique_violation. We catch this explicitly to return the existing PO without an error.
    BEGIN
        -- 6. Insert Purchase Order Header
        INSERT INTO public.purchase_orders (
            store_id, supplier_id, organization_id, status, created_by, idempotency_key
        ) VALUES (
            p_store_id, p_supplier_id, v_org_id, 'COMPLETED', v_caller_id, p_idempotency_key
        ) RETURNING id INTO v_new_po_id;

        -- 7. Insert Receipt Header
        INSERT INTO public.purchase_receipts (
            po_id, status, created_by
        ) VALUES (
            v_new_po_id, 'COMPLETED', v_caller_id
        ) RETURNING id INTO v_receipt_id;

        -- 8. Process Items
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
        LOOP
            v_variant_id := (v_item->>'variant_id')::UUID;
            v_quantity := (v_item->>'quantity')::INTEGER;
            v_cost := (v_item->>'purchase_cost')::NUMERIC;
            
            -- Basic numeric validation
            IF v_quantity IS NULL OR v_quantity <= 0 THEN
                RAISE EXCEPTION 'Invalid quantity for variant %', v_variant_id;
            END IF;
            IF v_cost IS NULL OR v_cost < 0 THEN
                RAISE EXCEPTION 'Invalid cost for variant %', v_variant_id;
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
                quantity_ordered, quantity_received, purchase_cost
            ) VALUES (
                v_new_po_id, p_store_id, v_org_id, v_variant_id,
                v_quantity, v_quantity, v_cost
            ) RETURNING id INTO v_po_item_id;

            -- Insert Receipt Item
            INSERT INTO public.purchase_receipt_items (
                receipt_id, receipt_po_id, po_item_id, po_item_po_id, quantity_received
            ) VALUES (
                v_receipt_id, v_new_po_id, v_po_item_id, v_new_po_id, v_quantity
            ) RETURNING id INTO v_receipt_item_id;

            -- Record Inventory Movement (Note: record_inventory_movement does quantity * item_size internally!)
            PERFORM public.record_inventory_movement(
                p_store_id,
                v_variant_id,
                'purchase_received'::public.movement_type,
                v_quantity,
                v_receipt_id,
                'Purchase Order Receipt',
                'RESELLABLE'::public.return_disposition
            );
        END LOOP;

        RETURN v_new_po_id;
        
    EXCEPTION WHEN unique_violation THEN
        -- If we hit a unique violation, it means another transaction just created this exact logical purchase
        SELECT id INTO v_existing_po_id 
        FROM public.purchase_orders 
        WHERE idempotency_key = p_idempotency_key;
        
        -- Safely return the existing ID to the caller so both requests resolve to the same result
        RETURN v_existing_po_id;
    END;
END;
$$;
