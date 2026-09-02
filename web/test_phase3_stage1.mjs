import { createClient } from '@supabase/supabase-js'
import * as e2e from './e2e_guard.mjs'

const supabase = createClient(e2e.SUPABASE_URL, e2e.SUPABASE_KEY);
const adminSupabase = createClient(e2e.SUPABASE_URL, e2e.SUPABASE_KEY, { auth: { persistSession: false } });

let passed = 0
let failed = 0

function assert(condition, testName, expected, actual, details = '') {
  if (condition) {
    console.log(`\x1b[32m✓ PASS\x1b[0m | ${testName.padEnd(6)} | ${String(expected).padEnd(20)} | ${String(actual).padEnd(20)} | ${details}`)
    passed++
  } else {
    console.error(`\x1b[31m✗ FAIL\x1b[0m | ${testName.padEnd(6)} | ${String(expected).padEnd(20)} | ${String(actual).padEnd(20)} | ${details}`)
    failed++
  }
}

async function runTests() {
  console.log("==================================================")
  console.log("PHASE 3: STAGE 1 DETERMINISTIC ENGINE TESTS")
  console.log("==================================================")
  console.log("TEST   | EXPECTED             | ACTUAL               | DETAILS")
  console.log("--------------------------------------------------------------------------------")

  const { data: loginData } = await supabase.auth.signInWithPassword({ email: 'krohith9980@gmail.com', password: 'Rohith89@@' });

  // STRONGER E2E SAFETY GUARD
  const PROD_ORG_ID = 'ec19612a-e6e7-4145-8344-4c46d0e8e555';
  const TEST_ORG_ID = process.env.TEST_ORG_ID;
  const IS_TEST_ENV = process.env.TEST_ENV === 'true';
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

  if (!IS_TEST_ENV) {
    console.error('CRITICAL SAFETY ABORT: TEST_ENV is not explicitly enabled.');
    process.exit(1);
  }
  if (!TEST_ORG_ID) {
    console.error('CRITICAL SAFETY ABORT: TEST_ORG_ID must be explicitly supplied.');
    process.exit(1);
  }
  if (TEST_ORG_ID === PROD_ORG_ID) {
    console.error('CRITICAL SAFETY ABORT: TEST_ORG_ID must NOT equal PRODUCTION_ORG_ID.');
    process.exit(1);
  }
  if (URL.includes('lhtibverxjpcvmajzazv')) {
    console.error('CRITICAL SAFETY ABORT: Production Supabase URL detected. Run tests against a dedicated TEST instance.');
    process.exit(1);
  }

  // Ensure we don't automatically select the first organization
  const orgId = TEST_ORG_ID;

  const userId = loginData.user.id;
  const { data: memberships } = await supabase.from('organization_members').select('organization_id').eq('profile_id', userId).limit(1)
  const dynamicOrgId = memberships[0].organization_id;
  const { data: stores } = await supabase.from('stores').select('id').eq('organization_id', dynamicOrgId).limit(1)
  const storeId = stores[0].id;

  const chk = (err, ctx) => { if (err) { console.error("Error at", ctx, err); throw err; } }

  const createProduct = async (name, sku, uom, size, packType, unitsPerPack) => {
    const pId = crypto.randomUUID()
    const vId = crypto.randomUUID()
    const { error: e1 } = await supabase.from('products').insert({ id: pId, organization_id: orgId, name: name })
    chk(e1, "createProduct " + name)
    const { error: e2 } = await supabase.from('product_variants').insert({
      id: vId, product_id: pId, organization_id: orgId, sku: sku,
      unit_of_measure: uom, item_size: size, purchase_cost: 100, selling_price: 150,
      packaging_type: packType, units_per_pack: unitsPerPack,
      purchase_packaging_type: packType, purchase_units_per_pack: unitsPerPack
    })
    chk(e2, "createVariant " + name)
    return vId
  }

  const addMovement = async (vId, type, qty, dateStr) => {
    const { error } = await supabase.rpc('test_inject_historical_movement', { p_store_id: storeId, p_variant_id: vId, p_movement_type: type, p_quantity: qty, p_created_at: dateStr })
    chk(error, "addMovement")
  }

  const addSaleWithCustomer = async (vId, qty, dateStr, customerId) => {
    // Inject sale directly using service key to set historical created_at
    const { data: sale, error: saleErr } = await adminSupabase.from('sales').insert({
      store_id: storeId,
      organization_id: orgId,
      customer_id: customerId,
      cashier_id: userId,
      status: 'COMPLETED',
      grand_total: 100,
      created_at: dateStr
    }).select('id').single();
    chk(saleErr, "inject_sale");

    const { error: itemErr } = await adminSupabase.from('sale_items').insert({
      sale_id: sale.id,
      organization_id: orgId,
      variant_id: vId,
      quantity: qty,
      unit_purchase_cost: 5,
      unit_selling_price: 10,
      total_price: qty * 10
    });
    chk(itemErr, "inject_sale_item");

    await addMovement(vId, 'sale', qty, dateStr);
  }

  const createCustomer = async (village) => {
    const cId = crypto.randomUUID();
    const { error } = await supabase.from('customers').insert({ id: cId, organization_id: orgId, name: 'Test Customer', village: village });
    chk(error, "createCustomer")
    return cId;
  }

  const ts = Date.now();
  const getPastDate = (daysAgo) => {
    const d = new Date(); d.setUTCHours(12,0,0,0); d.setUTCDate(d.getUTCDate() - daysAgo); return d.toISOString();
  }

  // A, B, C, D, E, K, P, S, U, V, W
  // A, B, C, D, E, K, P, S, U, V, W
  const vId_A = await createProduct(`Prod A ${ts}`, `SKU-A-${ts}`, 'ML', 500, 'BOX', 10);
  await addMovement(vId_A, 'opening_stock', 60000, getPastDate(61)); // 60 days active
  const promA = [];
  for (let i = 1; i <= 60; i++) promA.push(addMovement(vId_A, 'sale', 1000, getPastDate(i)));
  await Promise.all(promA);

  const suppId_A = crypto.randomUUID();
  await supabase.from('suppliers').insert({ id: suppId_A, organization_id: orgId, name: 'Test Supp A' });
  await supabase.rpc('test_inject_historical_po', {
    p_store_id: storeId, p_supplier_id: suppId_A, p_org_id: orgId, p_variant_id: vId_A,
    p_qty: 10, p_po_created_at: getPastDate(15), p_received_at: getPastDate(5)
  });

  await supabase.rpc('calculate_product_intelligence', { p_organization_id: orgId, p_variant_id: vId_A })
  let { data: intel_A } = await supabase.from('product_intelligence_cache').select('*').eq('variant_id', vId_A).single()

  assert(Math.abs(intel_A.avg_daily_sales - 1000) < 1, "A", 1000, intel_A.avg_daily_sales, "ADS exact logic (30d)");
  assert(intel_A.classification === 'BUY_MORE', "B", 'BUY_MORE', intel_A.classification, "Classification matches BUY_MORE");
  assert(intel_A.reorder_point === 7000, "C", 7000, intel_A.reorder_point, "Reorder point logic (no safety stock)");
  assert(intel_A.trend_status === 'STABLE', "K", 'STABLE', intel_A.trend_status, "Trend: STABLE");
  assert(intel_A.confidence_score === 90, "P", 90, intel_A.confidence_score, "Confidence: High (Strong Data)");
  assert(intel_A.safety_stock === 0, "S", 0, intel_A.safety_stock, "Safety Stock: Zero case");

  // D, E (Stockout adjust)
  const vId_D = await createProduct(`Prod D ${ts}`, `SKU-D-${ts}`, 'ML', 500, 'BOX', 10);
  await addMovement(vId_D, 'opening_stock', 10000, getPastDate(31)); // Day 31
  const promD1 = [];
  for (let i = 21; i <= 30; i++) promD1.push(addMovement(vId_D, 'sale', 1000, getPastDate(i)));
  await Promise.all(promD1);
  // Stock is 0 from day 20 to day 11
  await addMovement(vId_D, 'opening_stock', 10000, getPastDate(10));
  const promD2 = [];
  for (let i = 1; i <= 10; i++) promD2.push(addMovement(vId_D, 'sale', 1000, getPastDate(i)));
  await Promise.all(promD2);

  await supabase.rpc('calculate_product_intelligence', { p_organization_id: orgId, p_variant_id: vId_D })
  let { data: intel_D } = await supabase.from('product_intelligence_cache').select('*').eq('variant_id', vId_D).single()

  const expectedAds = 20000 / 19; // 19 selling days (11 out of stock days)
  assert(Math.abs(intel_D.avg_daily_sales - expectedAds) < 1, "D", expectedAds, intel_D.avg_daily_sales, "Stockout adjustment logic");
  assert(Math.abs(intel_D.forecast_demand_30d - (expectedAds * 30)) < 1, "E", expectedAds * 30, intel_D.forecast_demand_30d, "Out of stock tracking -> Forecast");

  // F, G (Insufficient Data & New Product)
  const vId_F = await createProduct(`Prod F ${ts}`, `SKU-F-${ts}`, 'PCS', 1, 'NONE', 1);
  await addMovement(vId_F, 'opening_stock', 100, getPastDate(10));
  await addMovement(vId_F, 'sale', 10, getPastDate(5));
  await supabase.rpc('calculate_product_intelligence', { p_organization_id: orgId, p_variant_id: vId_F })
  let { data: intel_F } = await supabase.from('product_intelligence_cache').select('*').eq('variant_id', vId_F).single()
  assert(intel_F.trend_status === 'INSUFFICIENT_DATA', "F", 'INSUFFICIENT_DATA', intel_F.trend_status, "Trend: INSUFFICIENT_DATA (<14d)");
  assert(intel_F.classification === 'NEW_PRODUCT', "G", 'NEW_PRODUCT', intel_F.classification, "Classification: NEW_PRODUCT (<14d)");
  assert(intel_F.confidence_score <= 50, "Q", 50, intel_F.confidence_score, "Confidence: Low (New product)");

  // H (Spike)
  const vId_H = await createProduct(`Prod H ${ts}`, `SKU-H-${ts}`, 'PCS', 1, 'NONE', 1);
  await addMovement(vId_H, 'opening_stock', 1000, getPastDate(30));
  let promH = [];
  for (let i = 8; i <= 30; i++) promH.push(addMovement(vId_H, 'sale', 1, getPastDate(i)));
  for (let i = 1; i <= 7; i++) promH.push(addMovement(vId_H, 'sale', 20, getPastDate(i)));
  await Promise.all(promH);
  await supabase.rpc('calculate_product_intelligence', { p_organization_id: orgId, p_variant_id: vId_H })
  let { data: intel_H } = await supabase.from('product_intelligence_cache').select('*').eq('variant_id', vId_H).single()
  assert(intel_H.trend_status === 'SPIKE', "H", 'SPIKE', intel_H.trend_status, "Trend: SPIKE");

  // I (Growing)
  const vId_I = await createProduct(`Prod I ${ts}`, `SKU-I-${ts}`, 'PCS', 1, 'NONE', 1);
  await addMovement(vId_I, 'opening_stock', 1000, getPastDate(61));
  let promI = [];
  for (let i = 31; i <= 60; i++) promI.push(addMovement(vId_I, 'sale', 10, getPastDate(i)));
  for (let i = 1; i <= 30; i++) promI.push(addMovement(vId_I, 'sale', 20, getPastDate(i)));
  await Promise.all(promI);
  await supabase.rpc('calculate_product_intelligence', { p_organization_id: orgId, p_variant_id: vId_I })
  let { data: intel_I } = await supabase.from('product_intelligence_cache').select('*').eq('variant_id', vId_I).single()
  assert(intel_I.trend_status === 'GROWING', "I", 'GROWING', intel_I.trend_status, "Trend: GROWING");

  // J (Declining)
  const vId_J = await createProduct(`Prod J ${ts}`, `SKU-J-${ts}`, 'PCS', 1, 'NONE', 1);
  await addMovement(vId_J, 'opening_stock', 1000, getPastDate(61));
  let promJ = [];
  for (let i = 31; i <= 60; i++) promJ.push(addMovement(vId_J, 'sale', 20, getPastDate(i)));
  for (let i = 1; i <= 30; i++) promJ.push(addMovement(vId_J, 'sale', 10, getPastDate(i)));
  await Promise.all(promJ);
  await supabase.rpc('calculate_product_intelligence', { p_organization_id: orgId, p_variant_id: vId_J })
  let { data: intel_J } = await supabase.from('product_intelligence_cache').select('*').eq('variant_id', vId_J).single()
  assert(intel_J.trend_status === 'DECLINING', "J", 'DECLINING', intel_J.trend_status, "Trend: DECLINING");

  // L (Seasonal - Recurring)
  const vId_L = await createProduct(`Prod L ${ts}`, `SKU-L-${ts}`, 'PCS', 1, 'NONE', 1);
  await addMovement(vId_L, 'opening_stock', 10000, getPastDate(400));
  let promL = [];
  for (let i = 1; i <= 365; i++) promL.push(addMovement(vId_L, 'sale', 1, getPastDate(i)));
  for (let i = 1; i <= 30; i++) promL.push(addMovement(vId_L, 'sale', 10, getPastDate(i)));
  for (let i = 366; i <= 395; i++) promL.push(addMovement(vId_L, 'sale', 10, getPastDate(i)));
  await Promise.all(promL);
  await supabase.rpc('calculate_product_intelligence', { p_organization_id: orgId, p_variant_id: vId_L })
  let { data: intel_L } = await supabase.from('product_intelligence_cache').select('*').eq('variant_id', vId_L).single()
  assert(intel_L.trend_status === 'SEASONAL', "L", 'SEASONAL', intel_L.trend_status, "Trend: SEASONAL (Recurring >1.3x, >365d)");

  // M (Not Seasonal - Just Growing Yearly but no monthly recurrence)
  const vId_M = await createProduct(`Prod M ${ts}`, `SKU-M-${ts}`, 'PCS', 1, 'NONE', 1);
  await addMovement(vId_M, 'opening_stock', 10000, getPastDate(400));
  let promM = [];
  for (let i = 1; i <= 365; i++) promM.push(addMovement(vId_M, 'sale', 1, getPastDate(i)));
  for (let i = 1; i <= 30; i++) promM.push(addMovement(vId_M, 'sale', 10, getPastDate(i)));
  await Promise.all(promM);
  await supabase.rpc('calculate_product_intelligence', { p_organization_id: orgId, p_variant_id: vId_M })
  let { data: intel_M } = await supabase.from('product_intelligence_cache').select('*').eq('variant_id', vId_M).single()
  assert(intel_M.trend_status !== 'SEASONAL', "M", true, intel_M.trend_status !== 'SEASONAL', "Trend: NOT SEASONAL (Growing but no recurrence)");

  // N (Supplier Lead Time Exact) & P, T, U, V, W
  const vId_N = await createProduct(`Prod N ${ts}`, `SKU-N-${ts}`, 'ML', 500, 'BOX', 10);
  await addMovement(vId_N, 'opening_stock', 50000, getPastDate(31));
  let promN = [];
  for (let i = 1; i <= 30; i++) promN.push(addMovement(vId_N, 'sale', 500, getPastDate(i)));
  await Promise.all(promN);

  const suppId = crypto.randomUUID();
  await supabase.from('suppliers').insert({ id: suppId, organization_id: orgId, name: 'Test Supp N' });
  await supabase.rpc('test_inject_historical_po', {
    p_store_id: storeId, p_supplier_id: suppId, p_org_id: orgId, p_variant_id: vId_N,
    p_qty: 10, p_po_created_at: getPastDate(15), p_received_at: getPastDate(5)
  });

  await addMovement(vId_N, 'sale', 1500, getPastDate(2));

  await supabase.rpc('calculate_product_intelligence', { p_organization_id: orgId, p_variant_id: vId_N })
  let { data: intel_N } = await supabase.from('product_intelligence_cache').select('*').eq('variant_id', vId_N).single()

  assert(intel_N.supplier_lead_time_days === 7, "N", 7, intel_N.supplier_lead_time_days, "Lead Time: Exact calculation");
  assert(intel_N.safety_stock === 10150, "T", 10150, intel_N.safety_stock, "Safety Stock: Non-zero exact match");
  assert(intel_N.reorder_point === 14000, "U", 14000, intel_N.reorder_point, "Reorder Point logic");
  assert(intel_N.forecast_demand_30d === 16500, "V", 16500, intel_N.forecast_demand_30d, "Forecast Demand (30d) logic");
  assert(intel_N.recommended_purchase_base_units === 0, "W", 0, intel_N.recommended_purchase_base_units, "Recommended Purchase (Base Units)");

  // O & R (Fallback Lead time & Confidence)
  const vId_O = await createProduct(`Prod O ${ts}`, `SKU-O-${ts}`, 'ML', 500, 'BOX', 10);
  await addMovement(vId_O, 'opening_stock', 50000, getPastDate(31));
  await addMovement(vId_O, 'sale', 100, getPastDate(15)); // Day 15 sale to make days_active > 14
  await addMovement(vId_O, 'sale', 100, getPastDate(1));
  await supabase.rpc('calculate_product_intelligence', { p_organization_id: orgId, p_variant_id: vId_O })
  let { data: intel_O } = await supabase.from('product_intelligence_cache').select('*').eq('variant_id', vId_O).single()
  assert(intel_O.supplier_lead_time_days === 7, "O", 7, intel_O.supplier_lead_time_days, "Supplier Lead Time: Fallback 7 days");
  assert(intel_O.confidence_score <= 90, "R", 90, intel_O.confidence_score, "Confidence: Reduced (Fallback lead time)");

  // X, Y, Z (Village Intelligence)
  const vId_X = await createProduct(`Prod X ${ts}`, `SKU-X-${ts}`, 'PCS', 1, 'NONE', 1);
  await addMovement(vId_X, 'opening_stock', 10000, getPastDate(31));
  const c1 = await createCustomer('Village 1');
  const c2 = await createCustomer('Village 1');
  const c3 = await createCustomer('Village 1');
  const c4 = await createCustomer('Village 1');
  const c5 = await createCustomer('Other');

  await addSaleWithCustomer(vId_X, 100, getPastDate(20), c1);
  for(let i=1; i<=15; i++) await addSaleWithCustomer(vId_X, 1, getPastDate(i), c5);
  await supabase.rpc('calculate_product_intelligence', { p_organization_id: orgId, p_variant_id: vId_X })
  let { data: intel_X } = await supabase.from('product_intelligence_cache').select('*').eq('variant_id', vId_X).single()
  assert(intel_X.village_signal === null, "X", null, intel_X.village_signal, "Village Signal: Does not trigger for 1 large customer");

  await addSaleWithCustomer(vId_X, 100, getPastDate(19), c2);
  await supabase.rpc('calculate_product_intelligence', { p_organization_id: orgId, p_variant_id: vId_X })
  let { data: intel_Y } = await supabase.from('product_intelligence_cache').select('*').eq('variant_id', vId_X).single()
  assert(intel_Y.village_signal === null, "Y", null, intel_Y.village_signal, "Village Signal: Does not trigger for 2 customers");

  for(let i=1; i<=20; i++) {
     await addSaleWithCustomer(vId_X, 10, getPastDate(i), c1);
     await addSaleWithCustomer(vId_X, 10, getPastDate(i), c2);
     await addSaleWithCustomer(vId_X, 10, getPastDate(i), c3);
     await addSaleWithCustomer(vId_X, 10, getPastDate(i), c4);
  }
  await supabase.rpc('calculate_product_intelligence', { p_organization_id: orgId, p_variant_id: vId_X })
  let { data: intel_Z } = await supabase.from('product_intelligence_cache').select('*').eq('variant_id', vId_X).single()
  assert(intel_Z.village_signal !== null && intel_Z.village_signal.includes('Village 1'), "Z", true, intel_Z.village_signal !== null, "Village Signal: Triggers for >3 cust, >15 txn, >25%");

  // AA: Package conversion chain
  const vId_AA = await createProduct(`Prod AA ${ts}`, `SKU-AA-${ts}`, 'ML', 500, 'BOX', 10);
  await addMovement(vId_AA, 'opening_stock', 200000, getPastDate(31));
  const promAA = [];
  for (let i = 1; i <= 30; i++) promAA.push(addMovement(vId_AA, 'sale', 5000, getPastDate(i)));
  await Promise.all(promAA);

  await supabase.rpc('test_inject_historical_po', {
    p_store_id: storeId, p_supplier_id: suppId, p_org_id: orgId, p_variant_id: vId_AA,
    p_qty: 10, p_po_created_at: getPastDate(15), p_received_at: getPastDate(5)
  });

  await supabase.rpc('calculate_product_intelligence', { p_organization_id: orgId, p_variant_id: vId_AA })
  let { data: intel_AA } = await supabase.from('product_intelligence_cache').select('*').eq('variant_id', vId_AA).single()

  const calculatePackaging = (recommendationBase, size, unitsPerPack) => (recommendationBase / size) / unitsPerPack;
  const boxes = calculatePackaging(intel_AA.recommended_purchase_base_units, 500, 10);
  // Forecast: 150000 (30 * 5000)
  // Stock at end: 200000 - 150000 = 50000
  // Rec: 150000 - 50000 = 100000. 100000 / 500 / 10 = 20.
  assert(boxes === 20, "AA", 20, boxes, "Package conversion chain (Base -> Items -> Boxes)");

  console.log("==================================================")
  console.log(`Tests Completed: ${passed} Passed, ${failed} Failed`)
  if (failed > 0) process.exit(1)
}

runTests().catch(console.error)
