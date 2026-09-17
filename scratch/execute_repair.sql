BEGIN;

DO $$
DECLARE
    v_variant RECORD;
    v_product RECORD;
    v_movement RECORD;
    v_balance RECORD;
    v_movement_count INT;
    v_affected_rows INT;
BEGIN
    -- =========================================================================
    -- STRICT PRE-CONDITIONS
    -- =========================================================================

    -- 1 & 2. Verify the exact target variant exists EXACTLY ONCE with required properties
    SELECT * INTO STRICT v_variant FROM public.product_variants 
    WHERE id = 'ce1351a1-4c40-429d-bc5e-29d09021769a';
    
    IF v_variant.item_size != 250 THEN RAISE EXCEPTION 'Precondition Failed: item_size is % (expected 250)', v_variant.item_size; END IF;
    IF v_variant.packaging_type != 'BOX' THEN RAISE EXCEPTION 'Precondition Failed: packaging_type is % (expected BOX)', v_variant.packaging_type; END IF;
    IF v_variant.units_per_pack != 1 THEN RAISE EXCEPTION 'Precondition Failed: units_per_pack is % (expected 1)', v_variant.units_per_pack; END IF;
    
    -- 3. Verify target variant's product belongs to the expected organization
    SELECT * INTO STRICT v_product FROM public.products WHERE id = v_variant.product_id;
    IF v_product.organization_id != 'ec19612a-e6e7-4145-8344-4c46d0e8e555' THEN 
        RAISE EXCEPTION 'Precondition Failed: Product org is % (expected ec19612a-e6e7-4145-8344-4c46d0e8e555)', v_product.organization_id; 
    END IF;

    -- 5, 7, 8. Verify there is exactly ONE inventory movement for this variant (No sales, returns, etc.)
    SELECT COUNT(*) INTO v_movement_count FROM public.inventory_movements WHERE variant_id = 'ce1351a1-4c40-429d-bc5e-29d09021769a';
    IF v_movement_count != 1 THEN RAISE EXCEPTION 'Precondition Failed: Movement count is % (expected exactly 1)', v_movement_count; END IF;
    
    -- 4. Verify the exact target movement exists with exact attributes
    SELECT * INTO STRICT v_movement FROM public.inventory_movements 
    WHERE id = 'b342a17a-3fa2-48d6-958a-a9a6387cfcc2' 
      AND variant_id = 'ce1351a1-4c40-429d-bc5e-29d09021769a'
      AND store_id = 'a959f768-74d8-4474-a4cc-b6ba99b26b38'
      AND movement_type = 'opening_stock'
      AND quantity = 2500;
      
    -- 6. Verify the exact target balance exists with exact attributes
    SELECT * INTO STRICT v_balance FROM public.inventory_balances
    WHERE id = '8b5e424b-ec02-4bdd-9daf-b5dcd9e31501'
      AND variant_id = 'ce1351a1-4c40-429d-bc5e-29d09021769a'
      AND store_id = 'a959f768-74d8-4474-a4cc-b6ba99b26b38'
      AND on_hand_stock = 2500;

    -- =========================================================================
    -- TARGETED UPDATES
    -- =========================================================================

    -- 9. Update movement using exact primary key + variant ID + store ID
    UPDATE public.inventory_movements
    SET quantity = 10
    WHERE id = 'b342a17a-3fa2-48d6-958a-a9a6387cfcc2' 
      AND variant_id = 'ce1351a1-4c40-429d-bc5e-29d09021769a'
      AND store_id = 'a959f768-74d8-4474-a4cc-b6ba99b26b38';
      
    -- 10. Require exactly 1 row affected
    GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
    IF v_affected_rows != 1 THEN RAISE EXCEPTION 'Safety Abort: Movement UPDATE affected % rows (expected 1)', v_affected_rows; END IF;
    
    -- 9. Update balance using exact primary key + variant ID + store ID
    UPDATE public.inventory_balances
    SET on_hand_stock = 10
    WHERE id = '8b5e424b-ec02-4bdd-9daf-b5dcd9e31501' 
      AND variant_id = 'ce1351a1-4c40-429d-bc5e-29d09021769a'
      AND store_id = 'a959f768-74d8-4474-a4cc-b6ba99b26b38';
      
    -- 10. Require exactly 1 row affected
    GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
    IF v_affected_rows != 1 THEN RAISE EXCEPTION 'Safety Abort: Balance UPDATE affected % rows (expected 1)', v_affected_rows; END IF;
    
    -- =========================================================================
    -- STRICT POST-CONDITIONS
    -- =========================================================================

    -- 11. Verify no other movement rows appeared/changed
    SELECT COUNT(*) INTO v_movement_count FROM public.inventory_movements WHERE variant_id = 'ce1351a1-4c40-429d-bc5e-29d09021769a';
    IF v_movement_count != 1 THEN RAISE EXCEPTION 'Post-condition Failed: Movement count shifted to % (expected 1)', v_movement_count; END IF;
    
    -- 11. Verify exact movement quantity = 10
    SELECT * INTO STRICT v_movement FROM public.inventory_movements WHERE id = 'b342a17a-3fa2-48d6-958a-a9a6387cfcc2';
    IF v_movement.quantity != 10 THEN RAISE EXCEPTION 'Post-condition Failed: Movement quantity is % (expected 10)', v_movement.quantity; END IF;
    
    -- 11. Verify exact balance quantity = 10 (and implicitly matches ledger)
    SELECT * INTO STRICT v_balance FROM public.inventory_balances WHERE id = '8b5e424b-ec02-4bdd-9daf-b5dcd9e31501';
    IF v_balance.on_hand_stock != 10 THEN RAISE EXCEPTION 'Post-condition Failed: Balance is % (expected 10)', v_balance.on_hand_stock; END IF;

END $$;

COMMIT;
