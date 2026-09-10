-- Migration 0042: Invoice Purchase RPC v2 (Sale Cost & Constraint Fix)

CREATE OR REPLACE FUNCTION public.process_invoice_purchase(
    p_store_id UUID,
    p_supplier_id UUID,
    p_idempotency_key UUID,
    p_items JSONB -- Array of { is_new: boolean, variant_id: UUID, product_name: text, category_id: UUID, sku: text, barcode: text, purchase_cost: numeric, sale_cost: numeric, quantity: integer, attributes: jsonb }
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
        WHERE id = p_supplier_id AND organization_id = v_org_id AND is_active = true
    ) INTO v_supplier_exists;
    
    IF NOT v_supplier_exists THEN
        RAISE EXCEPTION 'Supplier not found or unauthorized for this organization';
    END IF;

    -- 5. Safe Concurrency Idempotency Block
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
            v_is_new := COALESCE((v_item->>'is_new')::BOOLEAN, false);
            v_quantity := (v_item->>'quantity')::INTEGER;
            v_cost := COALESCE((v_item->>'purchase_cost')::NUMERIC, 0);
            v_sale_cost := (v_item->>'sale_cost')::NUMERIC;
            
            IF v_quantity IS NULL OR v_quantity <= 0 THEN
                RAISE EXCEPTION 'Invalid quantity in purchase';
            END IF;
            IF v_cost IS NULL OR v_cost < 0 THEN
                RAISE EXCEPTION 'Invalid cost in purchase';
            END IF;

            IF v_is_new THEN
                IF v_sale_cost IS NULL OR v_sale_cost < 0 THEN
                    RAISE EXCEPTION 'Sale cost is required for new products';
                END IF;

                -- Create new product and variant
                v_product_name := v_item->>'product_name';
                v_category_id := (v_item->>'category_id')::UUID;
                v_sku := v_item->>'sku';
                v_barcode := v_item->>'barcode';
                v_attributes := v_item->'attributes';
                
                IF v_product_name IS NULL OR length(trim(v_product_name)) = 0 THEN
                    RAISE EXCEPTION 'Product name is required for new products';
                END IF;
                
                -- Generate SKU if missing
                IF v_sku IS NULL OR length(trim(v_sku)) = 0 THEN
                    -- Simple deterministic-like generator: SYS-[hash]
                    v_sku := 'SYS-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
                END IF;
                
                -- Ensure barcode is null if empty
                IF v_barcode IS NOT NULL AND length(trim(v_barcode)) = 0 THEN
                    v_barcode := NULL;
                END IF;

                -- Insert Product
                INSERT INTO public.products (
                    organization_id, category_id, name, is_active
                ) VALUES (
                    v_org_id, v_category_id, v_product_name, true
                ) RETURNING id INTO v_product_id;
                
                -- Insert Variant
                INSERT INTO public.product_variants (
                    product_id, organization_id, sku, barcode, attributes, purchase_cost, selling_price, is_active
                ) VALUES (
                    v_product_id, v_org_id, v_sku, v_barcode, v_attributes, v_cost, v_sale_cost, true
                ) RETURNING id INTO v_variant_id;
                
                -- Insert Price History
                INSERT INTO public.variant_price_history (
                    organization_id, variant_id, purchase_cost, selling_price
                ) VALUES (
                    v_org_id, v_variant_id, v_cost, v_sale_cost
                );
            ELSE
                v_variant_id := (v_item->>'variant_id')::UUID;
                IF v_variant_id IS NULL THEN
                    RAISE EXCEPTION 'Variant ID is required for existing products';
                END IF;

                -- Fetch existing variant prices
                SELECT selling_price, purchase_cost INTO v_existing_selling_price, v_existing_purchase_cost
                FROM public.product_variants 
                WHERE id = v_variant_id AND organization_id = v_org_id AND is_active = true;
                
                IF NOT FOUND THEN
                    RAISE EXCEPTION 'Product variant % not found or unauthorized', v_variant_id;
                END IF;

                -- If the owner provided a new sale cost that differs from the existing master selling price, update it.
                -- Note: We DO NOT update the master purchase_cost as the invoice cost is transaction-specific.
                IF v_sale_cost IS NOT NULL AND v_sale_cost != v_existing_selling_price THEN
                    UPDATE public.product_variants
                    SET selling_price = v_sale_cost,
                        updated_at = NOW()
                    WHERE id = v_variant_id;

                    INSERT INTO public.variant_price_history (
                        organization_id, variant_id, purchase_cost, selling_price
                    ) VALUES (
                        v_org_id, v_variant_id, v_existing_purchase_cost, v_sale_cost
                    );
                END IF;
            END IF;

            -- Insert PO Item (quantity_received initialized to 0 to avoid trigger double-counting)
            INSERT INTO public.po_items (
                po_id, po_store_id, organization_id, variant_id, 
                quantity_ordered, quantity_received, purchase_cost
            ) VALUES (
                v_new_po_id, p_store_id, v_org_id, v_variant_id,
                v_quantity, 0, v_cost
            ) RETURNING id INTO v_po_item_id;

            -- Insert Receipt Item
            INSERT INTO public.purchase_receipt_items (
                receipt_id, receipt_po_id, po_item_id, po_item_po_id, quantity_received
            ) VALUES (
                v_receipt_id, v_new_po_id, v_po_item_id, v_new_po_id, v_quantity
            ) RETURNING id INTO v_receipt_item_id;

            -- Record Inventory Movement
            PERFORM public.record_inventory_movement(
                p_store_id,
                v_variant_id,
                'purchase_received'::public.movement_type,
                v_quantity,
                v_receipt_id,
                'Invoice Purchase Receipt',
                'RESELLABLE'::public.return_disposition
            );
        END LOOP;

        RETURN v_new_po_id;
        
    EXCEPTION WHEN unique_violation THEN
        -- If we hit a unique violation, check if the PO already exists for this idempotency key
        SELECT id INTO v_existing_po_id 
        FROM public.purchase_orders 
        WHERE idempotency_key = p_idempotency_key;
        
        IF v_existing_po_id IS NOT NULL THEN
            RETURN v_existing_po_id;
        END IF;
        
        -- If we didn't find the PO, it means the unique violation was on something else (e.g., SKU, Barcode)
        RAISE EXCEPTION 'Unique constraint violation (e.g., SKU or Barcode already exists).';
    END;
END;
$$;
