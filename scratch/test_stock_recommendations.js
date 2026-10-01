const { Client } = require('pg');

async function run() {
  const client = new Client('postgresql://postgres.wtzyngynxxnncgnniyym:Rohith89012@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres');
  await client.connect();

  const user_id = "62523573-58d2-4ce0-a640-f1593d6f67f0"; // Staging Manager Profile ID

  try {
    await client.query("BEGIN;");
    
    // Get pre/post counts for R, S, T tests
    const preCount = await client.query("SELECT (SELECT count(*) FROM purchase_orders) as po, (SELECT count(*) FROM inventory_movements) as mv;");

    // Fetch dynamic context
    const storeRes = await client.query('SELECT id, organization_id FROM public.stores LIMIT 1');
    const store_id = storeRes.rows[0].id;
    const org_id = storeRes.rows[0].organization_id;

    // A mock unauthorized org
    const fake_org_res = await client.query("INSERT INTO public.organizations (name) VALUES ('Test Org 4') RETURNING id");
    const fake_org_id = fake_org_res.rows[0].id;

    console.log("Setting JWT claims...");
    await client.query("set local request.jwt.claims = '{\"sub\": \"62523573-58d2-4ce0-a640-f1593d6f67f0\"}';");

    // 1. Setup Source & Mappings
    const sourceRes = await client.query(`
      INSERT INTO public.agri_intelligence_sources (organization_id, name, source_type)
      VALUES ($1, 'Test Source 4', 'TEST') RETURNING id;
    `, [org_id]);
    const source_id = sourceRes.rows[0].id;
    
    const catRes = await client.query(`
      INSERT INTO public.categories (organization_id, name) VALUES ($1, 'Shop Fertilizer') RETURNING id;
    `, [org_id]);
    const cat_id = catRes.rows[0].id;
    
    await client.query(`
      INSERT INTO public.agri_input_category_mappings (organization_id, input_category, mapping_type, category_id, product_id)
      VALUES ($1, 'Nitrogen Fertilizer', 'CATEGORY', $2, NULL);
    `, [org_id, cat_id]);

    // 2. Setup Products & Variants
    // Product 1: Two variants
    const p1 = await client.query(`
      INSERT INTO public.products (organization_id, category_id, name) VALUES ($1, $2, 'Urea Brand X') RETURNING id;
    `, [org_id, cat_id]);
    const prod1 = p1.rows[0].id;
    
    const v1_50kg = await client.query(`
      INSERT INTO public.product_variants (product_id, organization_id, sku, item_size, unit_of_measure)
      VALUES ($1, $2, 'UREA-50KG', 50, 'KG') RETURNING id;
    `, [prod1, org_id]);
    const var1_50 = v1_50kg.rows[0].id;
    
    const v1_10kg = await client.query(`
      INSERT INTO public.product_variants (product_id, organization_id, sku, item_size, unit_of_measure)
      VALUES ($1, $2, 'UREA-10KG', 10, 'KG') RETURNING id;
    `, [prod1, org_id]);
    const var1_10 = v1_10kg.rows[0].id;
    
    // Unmapped Product
    const unmapped = await client.query(`
      INSERT INTO public.products (organization_id, name) VALUES ($1, 'Random Snax') RETURNING id;
    `, [org_id]);
    
    // 3. Helper to insert sales & inventory
    const insertSale = async (varId, qty, daysAgo) => {
      const sale = await client.query(`
        INSERT INTO public.sales (store_id, organization_id, status, created_at)
        VALUES ($1, $2, 'COMPLETED', NOW() - INTERVAL '${daysAgo} days') RETURNING id;
      `, [store_id, org_id]);
      await client.query(`
        INSERT INTO public.sale_items (sale_id, organization_id, variant_id, quantity, unit_purchase_cost, unit_selling_price, total_price)
        VALUES ($1, $2, $3, $4, 0, 0, 0);
      `, [sale.rows[0].id, org_id, varId, qty]);
    };

    const setInventory = async (varId, onHand, reserved) => {
      await client.query(`
        INSERT INTO public.inventory_balances (store_id, organization_id, variant_id, on_hand_stock)
        VALUES ($1, $2, $3, $4) ON CONFLICT (store_id, variant_id) DO UPDATE SET on_hand_stock = $4;
      `, [store_id, org_id, varId, onHand]);
      
      if (reserved > 0) {
        await client.query(`
          INSERT INTO public.inventory_reservations (store_id, variant_id, quantity, expires_at, status)
          VALUES ($1, $2, $3, NOW() + INTERVAL '1 day', 'ACTIVE');
        `, [store_id, varId, reserved]);
      }
    };

    const runRpc = async (region, crop) => {
      const res = await client.query("SELECT * FROM calculate_stock_recommendations($1, $2, $3, $4)", [org_id, store_id, region, crop]);
      return res.rows;
    };

    console.log("\\n--- RUNNING TESTS ---");
    
    // TEST A: SUFFICIENT History (NORMAL, recent + historical)
    // NORMAL Timing Observation
    const obs_A = await client.query(`
      INSERT INTO public.agri_observations (organization_id, source_id, geographic_level, region, crop_name, crop_stage, progress_status, freshness_status, observation_date, publication_date, season)
      VALUES ($1, $2, 'DISTRICT', 'Dist A', 'Crop A', 'Veg', 'NORMAL', 'FRESH', NOW(), NOW(), 'Kharif') RETURNING id;
    `, [org_id, source_id]);
    await client.query(`INSERT INTO public.agri_observation_inputs (observation_id, input_category) VALUES ($1, 'Nitrogen Fertilizer')`, [obs_A.rows[0].id]);
    
    await insertSale(var1_50, 15, 5);    // Recent: 15
    await insertSale(var1_50, 10, 380);  // Historical: 10
    await setInventory(var1_50, 2, 1);   // Available: 1
    
    let resA = await runRpc('Dist A', 'Crop A');
    let v50 = resA.find(r => r.sku === 'UREA-50KG');
    console.log("TEST A (SUFFICIENT History & Deduction):", 
      v50 && v50.history_status === 'SUFFICIENT' && parseFloat(v50.available_stock) === 1 && v50.demand_method === 'BLENDED_HISTORY' 
      ? "PASS" : "FAIL", v50 ? "Status: " + v50.history_status + ", Rec: " + v50.recommended_reorder_quantity : "");

    // TEST B: NO History
    // Let's use var1_10 for this
    let v10 = resA.find(r => r.sku === 'UREA-10KG');
    console.log("TEST B (NO History -> NULL):", 
      v10 && v10.history_status === 'NONE' && v10.recommended_reorder_quantity === null 
      ? "PASS" : "FAIL", v10 ? "Status: " + v10.history_status + ", Rec: " + v10.recommended_reorder_quantity : "");

    // TEST C: LIMITED History (Historical ONLY, NO Recent -> NULL)
    await insertSale(var1_10, 10, 380); // Only historical
    let resC = await runRpc('Dist A', 'Crop A');
    let v10_C = resC.find(r => r.sku === 'UREA-10KG');
    console.log("TEST C (LIMITED History, Historical Only -> NULL):", 
      v10_C && v10_C.history_status === 'LIMITED' && v10_C.recommended_reorder_quantity === null 
      ? "PASS" : "FAIL");
      
    // TEST H & I: EARLY Timing overrides historical
    const obs_H = await client.query(`
      INSERT INTO public.agri_observations (organization_id, source_id, geographic_level, region, crop_name, crop_stage, progress_status, freshness_status, observation_date, publication_date, season)
      VALUES ($1, $2, 'DISTRICT', 'Dist H', 'Crop H', 'Veg', 'EARLY', 'FRESH', NOW(), NOW(), 'Kharif') RETURNING id;
    `, [org_id, source_id]);
    await client.query(`INSERT INTO public.agri_observation_inputs (observation_id, input_category) VALUES ($1, 'Nitrogen Fertilizer')`, [obs_H.rows[0].id]);
    
    let resH = await runRpc('Dist H', 'Crop H');
    let v50_H = resH.find(r => r.sku === 'UREA-50KG');
    console.log("TEST H (EARLY Timing disables history):", 
      v50_H && v50_H.demand_method === 'RECENT_ONLY' 
      ? "PASS" : "FAIL");

    // TEST J & K & L: Security
    let authFail = false;
    try {
      await client.query("SAVEPOINT test_auth;");
      await client.query("SELECT * FROM calculate_stock_recommendations($1, $2, 'Dist A', 'Crop A')", [fake_org_id, store_id]);
      await client.query("RELEASE SAVEPOINT test_auth;");
    } catch (e) {
      if(e.message.includes("Unauthorized")) authFail = true;
      await client.query("ROLLBACK TO SAVEPOINT test_auth;");
    }
    console.log("TEST L (Unauthorized Organization Access):", authFail ? "PASS" : "FAIL");

    // TEST M: Unmapped Product Excluded
    let hasUnmapped = resA.some(r => r.product_name === 'Random Snax');
    console.log("TEST M (Unmapped Product Excluded):", !hasUnmapped ? "PASS" : "FAIL");

    // TEST N: No variant aggregation
    // resA should have 2 distinct rows for UREA-50KG and UREA-10KG
    let distinctVariants = resA.filter(r => r.product_name === 'Urea Brand X').length;
    console.log("TEST N (No Variant Aggregation):", distinctVariants === 2 ? "PASS" : "FAIL");
    
    // TEST P, Q: Explanation strings exist
    console.log("TEST P/Q (Reasoning exists):", v50.calculation_reasoning.includes("stockouts") ? "PASS" : "FAIL", "(" + v50.calculation_reasoning + ")");

    // TEST R, S, T: Boundaries
    const postCount = await client.query("SELECT (SELECT count(*) FROM purchase_orders) as po, (SELECT count(*) FROM inventory_movements) as mv;");
    const countsMatch = preCount.rows[0].po === postCount.rows[0].po && preCount.rows[0].mv === postCount.rows[0].mv;
    console.log("TEST R/S/T (No PO/Inventory mutations):", countsMatch ? "PASS" : "FAIL");

    await client.query("ROLLBACK;");
    console.log("All tests completed. Changes rolled back.");
  } catch(e) {
    console.error("TEST FAILED:", e);
    await client.query("ROLLBACK;");
  } finally {
    await client.end();
  }
}
run();
