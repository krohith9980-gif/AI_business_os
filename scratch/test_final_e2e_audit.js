const { Client } = require('pg');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();

async function run() {
  const client = new Client('postgresql://postgres.wtzyngynxxnncgnniyym:Rohith89012@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres');
  await client.connect();

  const user_id = "62523573-58d2-4ce0-a640-f1593d6f67f0";

  try {
    await client.query("BEGIN;");
    
    console.log("Setting JWT claims...");
    await client.query("set local request.jwt.claims = '{\"sub\": \"62523573-58d2-4ce0-a640-f1593d6f67f0\"}';");

    // 1. Setup Staging Context
    const storeRes = await client.query('SELECT id, organization_id FROM public.stores LIMIT 1');
    const store_id = storeRes.rows[0].id;
    const org_id = storeRes.rows[0].organization_id;

    const catRes = await client.query(`INSERT INTO public.categories (organization_id, name) VALUES ($1, 'Pesticides') RETURNING id;`, [org_id]);
    const cat_id = catRes.rows[0].id;

    const p1 = await client.query(`INSERT INTO public.products (organization_id, category_id, name) VALUES ($1, $2, 'Bollworm Killer') RETURNING id;`, [org_id, cat_id]);
    
    const v1 = await client.query(`
      INSERT INTO public.product_variants (product_id, organization_id, sku, item_size, unit_of_measure)
      VALUES ($1, $2, 'BOLLWORM-1L', 1, 'L') RETURNING id;
    `, [p1.rows[0].id, org_id]);
    const var1 = v1.rows[0].id;

    // Insert Supplier
    const s1 = await client.query(`
      INSERT INTO public.suppliers (organization_id, name, phone, outstanding_balance) 
      VALUES ($1, 'E2E Supplier', '919876543210', 0) RETURNING id;
    `, [org_id]);
    const sup_id = s1.rows[0].id;

    // Insert Sales and Inventory for Step 4 relevance
    await client.query(`
      INSERT INTO public.inventory_balances (store_id, organization_id, variant_id, on_hand_stock)
      VALUES ($1, $2, $3, 2)
    `, [store_id, org_id, var1]); // Current Stock: 2

    // Insert Sales History
    const now = new Date();
    const date15DaysAgo = new Date(now.getTime() - (15 * 24 * 60 * 60 * 1000)).toISOString();
    
    const saleId = await client.query(`
      INSERT INTO public.sales (store_id, organization_id, grand_total, status, cashier_id)
      VALUES ($1, $2, 500, 'COMPLETED', $3) RETURNING id
    `, [store_id, org_id, user_id]);
    
    await client.query(`
      INSERT INTO public.sale_items (sale_id, organization_id, variant_id, quantity, unit_selling_price, unit_purchase_cost, total_price)
      VALUES ($1, $2, $3, 30, 500, 300, 15000)
    `, [saleId.rows[0].id, org_id, var1]); // Recent sales: 30
    
    await client.query("UPDATE public.sales SET created_at = $1 WHERE id = $2", [date15DaysAgo, saleId.rows[0].id]);

    // Setup Mapping
    await client.query(`
      INSERT INTO public.agri_input_category_mappings (organization_id, input_category, product_id, mapping_type, reasoning, confidence_score, created_by)
      VALUES ($1, 'Bollworm Pesticide', $2, 'PRODUCT', 'Direct mapping', 0.9, $3)
    `, [org_id, p1.rows[0].id, user_id]);

    // Setup Fresh Agri Observation
    const srcId = await client.query(`INSERT INTO public.agri_intelligence_sources (organization_id, name, source_type) VALUES ($1, 'Source A', 'GOVERNMENT') RETURNING id`, [org_id]);
    
    const obs_id = await client.query(`
      INSERT INTO public.agri_observations 
      (organization_id, source_id, geographic_level, region, crop_name, crop_stage, progress_status, freshness_status, publication_date, observation_date, season, created_by)
      VALUES ($1, $2, 'DISTRICT', 'Khammam', 'Cotton', 'Fruiting', 'NORMAL', 'FRESH', NOW(), NOW(), 'Kharif', $3)
      RETURNING id
    `, [org_id, srcId.rows[0].id, user_id]);

    await client.query(`
      INSERT INTO public.agri_observation_inputs (observation_id, input_category)
      VALUES ($1, 'Bollworm Pesticide')
    `, [obs_id.rows[0].id]);


    console.log("\\n--- E2E AUDIT START ---");

    // 1. STEP 3: Agri Resolution
    const step3 = await client.query(`SELECT * FROM resolve_agri_input_needs($1, 'Khammam', 'Cotton');`, [org_id]);
    const step3Res = step3.rows;
    console.log("STEP 3 (Agricultural Resolution):", step3Res.length > 0 && step3Res[0].matched_products[0].product_id === p1.rows[0].id ? "PASS" : "FAIL");

    // 2. STEP 4: Stock Recommendation
    const step4 = await client.query(`SELECT * FROM calculate_stock_recommendations($1, $2, 'Khammam', 'Cotton');`, [org_id, store_id]);
    const step4Res = step4.rows;
    const recVar1 = step4Res.find(r => r.sku === 'BOLLWORM-1L');
    
    // recent sales = 30 over 30 days => 1 per day => 30 expected demand. stock = 2 => recommended = 28.
    console.log("STEP 4 (Sales-based Rec):", recVar1 && Number(recVar1.recommended_reorder_quantity) === 28 ? "PASS" : "FAIL", "(Rec: " + recVar1?.recommended_reorder_quantity + ")");

    // 3. STEP 5: Owner Edits & Creates PO
    let finalPayload = [{
      variant_id: var1,
      quantity: 30, // Edited by owner
      purchase_cost: 300,
      package_quantity: 30,
      package_unit: 'PCS',
      units_per_package: 1
    }];

    const po_idem = uuidv4();
    const poRes = await client.query(`SELECT process_purchase_order($1, $2, $3, $4::jsonb) AS po_id;`, [store_id, sup_id, po_idem, JSON.stringify(finalPayload)]);
    const po_id = poRes.rows[0].po_id;
    
    const poStatus = await client.query("SELECT status, created_by FROM public.purchase_orders WHERE id = $1", [po_id]);
    console.log("STEP 5 (Owner edited qty -> PENDING PO):", poStatus.rows[0].status === 'PENDING' ? "PASS" : "FAIL", "(Qty=30)");

    // 4. Duplicate Check
    let dupFail = false;
    let dupId = null;
    try {
      const dupRes = await client.query(`SELECT process_purchase_order($1, $2, $3, $4::jsonb) AS po_id;`, [store_id, sup_id, po_idem, JSON.stringify(finalPayload)]);
      dupId = dupRes.rows[0].po_id;
    } catch(e) { dupFail = true; }
    console.log("Duplicate PO creation check:", (!dupFail && dupId === po_id) ? "PASS" : "FAIL");

    // 5. WhatsApp Status 
    console.log("WhatsApp opening PO status check:", poStatus.rows[0].status === 'PENDING' ? "PASS" : "FAIL");

    // 6. Manual Supplier Confirmation
    await client.query("SELECT record_supplier_response($1, 'SUPPLIER_CONFIRMED');", [po_id]);
    const poConfirm = await client.query("SELECT status FROM public.purchase_orders WHERE id = $1", [po_id]);
    console.log("Manual Supplier Confirmation:", poConfirm.rows[0].status === 'SUPPLIER_CONFIRMED' ? "PASS" : "FAIL");

    // 7. Partial Goods Receipt
    const poItemRes = await client.query("SELECT id FROM public.po_items WHERE po_id = $1", [po_id]);
    const po_item_id = poItemRes.rows[0].id;

    const receiptPayload = [{ po_item_id: po_item_id, quantity_received: 20 }];
    await client.query(`SELECT record_goods_receipt($1, $2, $3::jsonb);`, [po_id, uuidv4(), JSON.stringify(receiptPayload)]);

    const partialStatus = await client.query("SELECT status FROM public.purchase_orders WHERE id = $1", [po_id]);
    const partialInv = await client.query("SELECT on_hand_stock FROM public.inventory_balances WHERE variant_id = $1 AND store_id = $2", [var1, store_id]);
    const partialSup = await client.query("SELECT outstanding_balance FROM public.suppliers WHERE id = $1", [sup_id]);

    // Inventory 2 -> 22. Supplier Payable 0 -> 20 * 300 = 6000
    console.log("Partial Receipt (Inventory & Payable Update):", 
      partialStatus.rows[0].status === 'PARTIAL_RECEIVED' && 
      partialInv.rows[0].on_hand_stock == 22 && 
      partialSup.rows[0].outstanding_balance == 6000 ? "PASS" : "FAIL", 
      "(Inv: " + partialInv.rows[0].on_hand_stock + ", Payable: " + partialSup.rows[0].outstanding_balance + ")");

    // 8. Remaining Goods Receipt
    const receiptPayload2 = [{ po_item_id: po_item_id, quantity_received: 10 }];
    await client.query(`SELECT record_goods_receipt($1, $2, $3::jsonb);`, [po_id, uuidv4(), JSON.stringify(receiptPayload2)]);

    const finalStatus = await client.query("SELECT status FROM public.purchase_orders WHERE id = $1", [po_id]);
    const finalInv = await client.query("SELECT on_hand_stock FROM public.inventory_balances WHERE variant_id = $1 AND store_id = $2", [var1, store_id]);
    const finalSup = await client.query("SELECT outstanding_balance FROM public.suppliers WHERE id = $1", [sup_id]);

    // Inventory 22 -> 32. Supplier Payable 6000 -> 9000
    console.log("Remaining Receipt (COMPLETED):", 
      finalStatus.rows[0].status === 'COMPLETED' && 
      finalInv.rows[0].on_hand_stock == 32 && 
      finalSup.rows[0].outstanding_balance == 9000 ? "PASS" : "FAIL",
      "(Inv: " + finalInv.rows[0].on_hand_stock + ", Payable: " + finalSup.rows[0].outstanding_balance + ")");


    // 9. Negative Path Test (STALE)
    const stale_obs_id = await client.query(`
      INSERT INTO public.agri_observations 
      (organization_id, source_id, geographic_level, region, crop_name, crop_stage, progress_status, freshness_status, publication_date, observation_date, season, created_by)
      VALUES ($1, $2, 'DISTRICT', 'Nalgonda', 'Cotton', 'Fruiting', 'NORMAL', 'STALE', NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days', 'Kharif', $3)
      RETURNING id
    `, [org_id, srcId.rows[0].id, user_id]);

    await client.query(`
      INSERT INTO public.agri_observation_inputs (observation_id, input_category)
      VALUES ($1, 'Bollworm Pesticide')
    `, [stale_obs_id.rows[0].id]);

    const step3Stale = await client.query(`SELECT * FROM resolve_agri_input_needs($1, 'Nalgonda', 'Cotton');`, [org_id]);
    const step3StaleRes = step3Stale.rows;
    console.log("Negative Path (STALE evidence returns empty -> no PO -> no WhatsApp):", !step3StaleRes || step3StaleRes.length === 0 ? "PASS" : "FAIL");

    await client.query("ROLLBACK;");
    console.log("Audit complete. Staging database untouched.");
  } catch(e) {
    console.error("AUDIT FAILED:", e);
    await client.query("ROLLBACK;");
  } finally {
    await client.end();
  }
}
run();
