const { Client } = require('pg');

async function run() {
  const client = new Client('postgresql://postgres.wtzyngynxxnncgnniyym:Rohith89012@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres');
  await client.connect();

  const user_id = "62523573-58d2-4ce0-a640-f1593d6f67f0"; // Staging Manager Profile ID

  try {
    await client.query("BEGIN;");

    // Fetch dynamic context
    const storeRes = await client.query('SELECT id, organization_id FROM public.stores LIMIT 1');
    const org_id = storeRes.rows[0].organization_id;

    // A mock unauthorized org
    const fake_org_res = await client.query("INSERT INTO public.organizations (name) VALUES ('Test Org') RETURNING id");
    const fake_org_id = fake_org_res.rows[0].id;

    console.log("Setting JWT claims...");
    await client.query("set local request.jwt.claims = '{\"sub\": \"62523573-58d2-4ce0-a640-f1593d6f67f0\"}';");

    console.log("Creating Test Setup...");
    // 1. Create a Source
    const sourceRes = await client.query(`
      INSERT INTO public.agri_intelligence_sources (organization_id, name, source_type)
      VALUES ($1, 'Test Source', 'TEST') RETURNING id;
    `, [org_id]);
    const source_id = sourceRes.rows[0].id;

    // 2. Create Categories & Products for mapping
    const catRes = await client.query(`
      INSERT INTO public.categories (organization_id, name) VALUES ($1, 'Shop Urea Category') RETURNING id;
    `, [org_id]);
    const cat_id = catRes.rows[0].id;

    const prodRes = await client.query(`
      INSERT INTO public.products (organization_id, category_id, name) VALUES ($1, $2, 'Shop Specific Pesticide') RETURNING id;
    `, [org_id, cat_id]);
    const prod_id = prodRes.rows[0].id;
    
    const otherOrgCat = await client.query(`
      INSERT INTO public.categories (organization_id, name) VALUES ($1, 'Other Org Category') RETURNING id;
    `, [fake_org_id]);
    const other_cat_id = otherOrgCat.rows[0].id;
    
    // 3. Create explicit mappings
    await client.query(`
      INSERT INTO public.agri_input_category_mappings (organization_id, input_category, mapping_type, category_id, product_id)
      VALUES 
        ($1, 'Nitrogen Fertilizer', 'CATEGORY', $2, NULL),
        ($1, 'Bollworm Pesticide', 'PRODUCT', NULL, $3),
        ($4, 'Nitrogen Fertilizer', 'CATEGORY', $5, NULL);
    `, [org_id, cat_id, prod_id, fake_org_id, other_cat_id]);

    // Helper to insert observation
    const insertObs = async (geo, region, crop, stage, timing, fresh, dateOff) => {
      const res = await client.query(`
        INSERT INTO public.agri_observations (organization_id, source_id, observation_date, publication_date, season, geographic_level, region, crop_name, crop_stage, progress_status, freshness_status)
        VALUES ($1, $2, CURRENT_DATE - INTERVAL '${dateOff} days', CURRENT_DATE - INTERVAL '${dateOff} days', 'TestSeason', $3, $4, $5, $6, $7, $8) RETURNING id;
      `, [org_id, source_id, geo, region, crop, stage, timing, fresh]);
      return res.rows[0].id;
    };
    const insertInput = async (obsId, inputCat) => {
      await client.query(`INSERT INTO public.agri_observation_inputs (observation_id, input_category) VALUES ($1, $2)`, [obsId, inputCat]);
    };

    console.log("\\n--- RUNNING TESTS ---");
    
    // TEST A: District + Fresh
    const obs_A = await insertObs('DISTRICT', 'District A', 'CropA', 'Sowing', 'NORMAL', 'FRESH', 1);
    await insertInput(obs_A, 'Nitrogen Fertilizer');
    const resA = await client.query("SELECT * FROM resolve_agri_input_needs($1, 'District A', 'CropA')", [org_id]);
    console.log("TEST A (District+Fresh):", resA.rows.length === 1 && resA.rows[0].geographic_level === 'DISTRICT' ? "PASS" : "FAIL", resA.rows[0]);

    // TEST B: District + Aging
    const obs_B = await insertObs('DISTRICT', 'District B', 'CropB', 'Vegetative', 'NORMAL', 'AGING', 10);
    await insertInput(obs_B, 'Nitrogen Fertilizer');
    const resB = await client.query("SELECT * FROM resolve_agri_input_needs($1, 'District B', 'CropB')", [org_id]);
    console.log("TEST B (District+Aging):", resB.rows.length === 1 && resB.rows[0].freshness_status === 'AGING' ? "PASS" : "FAIL");

    // TEST C: District Stale + State Fresh fallback
    const obs_C_stale = await insertObs('DISTRICT', 'District C', 'CropC', 'Flowering', 'NORMAL', 'STALE', 25);
    const obs_C_state = await insertObs('STATE', 'State', 'CropC', 'Vegetative', 'NORMAL', 'FRESH', 1);
    await insertInput(obs_C_state, 'Nitrogen Fertilizer');
    const resC = await client.query("SELECT * FROM resolve_agri_input_needs($1, 'District C', 'CropC')", [org_id]);
    console.log("TEST C (District Stale -> State Fallback):", resC.rows.length === 1 && resC.rows[0].geographic_level === 'STATE' && resC.rows[0].crop_stage === 'Vegetative' ? "PASS" : "FAIL");

    // TEST D: District + State conflicting stages (District should win)
    const obs_D_dist = await insertObs('DISTRICT', 'District D', 'CropD', 'Fruiting', 'NORMAL', 'FRESH', 2);
    await insertInput(obs_D_dist, 'Nitrogen Fertilizer');
    const obs_D_state = await insertObs('STATE', 'State', 'CropD', 'Flowering', 'NORMAL', 'FRESH', 1);
    const resD = await client.query("SELECT * FROM resolve_agri_input_needs($1, 'District D', 'CropD')", [org_id]);
    console.log("TEST D (District wins over State):", resD.rows.length === 1 && resD.rows[0].crop_stage === 'Fruiting' ? "PASS" : "FAIL");

    // TEST E: No valid observation
    const resE = await client.query("SELECT * FROM resolve_agri_input_needs($1, 'Unknown District', 'Unknown Crop')", [org_id]);
    console.log("TEST E (No valid observation):", resE.rows.length === 0 ? "PASS" : "FAIL");

    // TEST F & G & H: Verified Category Mapping, Product Mapping, Cross-org Isolation
    const obs_FG = await insertObs('DISTRICT', 'District FG', 'CropFG', 'Sowing', 'NORMAL', 'FRESH', 1);
    await insertInput(obs_FG, 'Nitrogen Fertilizer'); // CATEGORY
    await insertInput(obs_FG, 'Bollworm Pesticide'); // PRODUCT
    await insertInput(obs_FG, 'Unknown Input'); // NO MAPPING

    const resFG = await client.query("SELECT * FROM resolve_agri_input_needs($1, 'District FG', 'CropFG')", [org_id]);
    let passedFG = resFG.rows.length === 2; // Should only return the 2 mapped categories
    let mappedCat = resFG.rows.find(r => r.input_category === 'Nitrogen Fertilizer');
    let mappedProd = resFG.rows.find(r => r.input_category === 'Bollworm Pesticide');
    
    // Check product isolation (it shouldn't match fake_org_id products)
    let isIsolated = true;
    if (mappedCat && mappedCat.matched_products.length !== 1) isIsolated = false; // Only 1 product in org's category
    
    console.log("TEST F (Verified Category Mapping):", mappedCat && mappedCat.matched_products[0].mapping_type === 'CATEGORY' ? "PASS" : "FAIL");
    console.log("TEST G (Specific Product Mapping):", mappedProd && mappedProd.matched_products[0].product_id === prod_id ? "PASS" : "FAIL");
    console.log("TEST H (Cross-organization product isolation):", isIsolated ? "PASS" : "FAIL");

    // TEST I: Unauthorized organization access
    let unauthorizedPass = false;
    try {
      await client.query("SAVEPOINT test_i;");
      await client.query("SELECT * FROM resolve_agri_input_needs($1, 'District A', 'CropA')", [fake_org_id]);
      await client.query("RELEASE SAVEPOINT test_i;");
    } catch(err) {
      if (err.message.includes("Unauthorized")) unauthorizedPass = true;
      await client.query("ROLLBACK TO SAVEPOINT test_i;");
    }
    console.log("TEST I (Unauthorized organization access):", unauthorizedPass ? "PASS" : "FAIL");

    // TEST J & K: Early / Delayed Timing (Data representation test)
    const obs_J = await insertObs('DISTRICT', 'District J', 'CropJ', 'Sowing', 'EARLY', 'FRESH', 1);
    await insertInput(obs_J, 'Nitrogen Fertilizer');
    const resJ = await client.query("SELECT * FROM resolve_agri_input_needs($1, 'District J', 'CropJ')", [org_id]);
    console.log("TEST J (Early Timing):", resJ.rows[0].progress_status === 'EARLY' ? "PASS" : "FAIL");

    const obs_K = await insertObs('DISTRICT', 'District K', 'CropK', 'Sowing', 'DELAYED', 'FRESH', 1);
    await insertInput(obs_K, 'Nitrogen Fertilizer');
    const resK = await client.query("SELECT * FROM resolve_agri_input_needs($1, 'District K', 'CropK')", [org_id]);
    console.log("TEST K (Delayed Timing):", resK.rows[0].progress_status === 'DELAYED' ? "PASS" : "FAIL");

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
