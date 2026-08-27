import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://lhtibverxjpcvmajzazv.supabase.co'
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxodGlidmVyeGpwY3ZtYWp6YXp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MjgxMTgsImV4cCI6MjEwMjMwNDExOH0.N_DwZogAi_wqfmZdjlFBeeV59fMkv46n2PoqJNoHOvM'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function runTests() {
  console.log("==================================================")
  console.log('Authenticating...');
  const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
    email: 'krohith9980@gmail.com',
    password: 'Rohith89@@'
  });
  
  if (loginError) {
    console.error('Login Error:', loginError);
    return;
  }
  
  const userId = loginData.user.id;

  // wait for triggers to run and org to be created
  let orgId = null;
  for (let i = 0; i < 10; i++) {
    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('profile_id', userId)
      .limit(1)
      
    if (memberships && memberships.length > 0) {
      orgId = memberships[0].organization_id;
      break;
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  
  if (!orgId) {
    console.error("No organization found for user.");
    return;
  }
  
  const { data: stores } = await supabase
    .from('stores')
    .select('id')
    .eq('organization_id', orgId)
    .limit(1)
  const storeId = stores[0].id

  let passed = 0;
  let failed = 0;

  function assertEq(name, actual, expected, ctx = '') {
    // Note: Numbers from Postgres might come as strings depending on types (NUMERIC vs INT).
    const isEq = String(actual) === String(expected);
    if (isEq) {
      console.log(`✓ PASS: ${name} (Expected: ${expected}, Actual: ${actual}) ${ctx}`)
      passed++;
    } else {
      console.log(`❌ FAIL: ${name} (Expected: ${expected}, Actual: ${actual}) ${ctx}`)
      failed++;
    }
  }

  console.log("\n==================================================")
  console.log("TEST 1 — NEW 500 ML PRODUCT")
  console.log("==================================================")
  
  const { data: createRes, error: createErr } = await supabase.rpc('create_product_with_variant', {
      p_organization_id: orgId,
      p_name: 'Test 500ML Box',
      p_sku: '500ML-BOX-' + Date.now(),
      p_purchase_cost: 50,
      p_selling_price: 100,
      p_unit_of_measure: 'ML',
      p_packaging_type: 'BOX',
      p_units_per_pack: 10,
      p_item_size: 500
  })
  
  if (createErr) throw createErr;
  
  const vId_500 = createRes.variant_id;
  
  const { data: v500 } = await supabase.from('product_variants').select('*').eq('id', vId_500).single();
  assertEq("Item Size", v500.item_size, 500);
  assertEq("Unit", v500.unit_of_measure, 'ML');
  assertEq("Units per pack", v500.units_per_pack, 10);
  assertEq("Packaging", v500.packaging_type, 'BOX');
  
  console.log("\n==================================================")
  console.log("TEST 2 — OPENING STOCK")
  console.log("==================================================")
  // Opening stock: 5 BOXES. Physical quantity = 5 * 10 = 50.
  const { error: osErr } = await supabase.rpc('record_inventory_movement', {
      p_store_id: storeId,
      p_variant_id: vId_500,
      p_movement_type: 'opening_stock',
      p_quantity: 50, 
      p_reference_id: null,
      p_notes: 'Initial opening stock',
      p_disposition: 'RESELLABLE'
  })
  if (osErr) {
    console.error("TEST 2 ERROR:", osErr);
  }
  
  const { data: inv1, error: invErr1 } = await supabase.from('inventory_balances').select('on_hand_stock').eq('variant_id', vId_500).single();
  if (invErr1) {
    console.error("Fetch Inv1 Error:", invErr1);
  }
  
  assertEq("Opening Stock Balance", inv1?.on_hand_stock, 25000, "50 items * 500 ML");


  console.log("\n==================================================")
  console.log("TEST 3 — PURCHASE RECEIPT")
  console.log("==================================================")
  // Receive 2 BOXES = 20 items.
  const { error: prErr } = await supabase.rpc('record_inventory_movement', {
      p_store_id: storeId,
      p_variant_id: vId_500,
      p_movement_type: 'purchase_received',
      p_quantity: 20
  })
  
  const { data: inv2 } = await supabase.from('inventory_balances').select('on_hand_stock').eq('variant_id', vId_500).single();
  assertEq("After Purchase Stock", inv2.on_hand_stock, 35000, "25000 + (20 * 500)");


  console.log("\n==================================================")
  console.log("TEST 4 — POS PIECE SALE")
  console.log("==================================================")
  // Sell 1 PIECE.
  const itemsPiece = [{ variant_id: vId_500, display_quantity: 1, sale_unit: 'PIECE', discount_amount: 0 }]
  const paymentsPiece = [{ method: 'CASH', amount: 100 }]
  const { data: sale1Id, error: s1Err } = await supabase.rpc('process_sale', {
    p_store_id: storeId, p_customer_id: null, p_items: itemsPiece, p_payments: paymentsPiece, p_due_date: null
  })
  if (s1Err) console.error("TEST 4 ERROR:", s1Err);
  
  const { data: inv3 } = await supabase.from('inventory_balances').select('on_hand_stock').eq('variant_id', vId_500).single();
  assertEq("After Piece Sale Stock", inv3.on_hand_stock, 34500, "35000 - 500");
  
  const { data: saleItems1 } = await supabase.from('sale_items').select('quantity, total_price').eq('sale_id', sale1Id).single();
  assertEq("Sale Item Quantity", saleItems1.quantity, 1);
  assertEq("Sale Item Total Price", saleItems1.total_price, 100);

  console.log("\n==================================================")
  console.log("TEST 5 — POS BOX SALE")
  console.log("==================================================")
  // Sell 1 BOX (10 pieces)
  const itemsBox = [{ variant_id: vId_500, display_quantity: 1, sale_unit: 'BOX', discount_amount: 0 }]
  const paymentsBox = [{ method: 'CASH', amount: 1000 }]
  const { data: sale2Id } = await supabase.rpc('process_sale', {
    p_store_id: storeId, p_customer_id: null, p_items: itemsBox, p_payments: paymentsBox, p_due_date: null
  })
  
  const { data: inv4 } = await supabase.from('inventory_balances').select('on_hand_stock').eq('variant_id', vId_500).single();
  assertEq("After Box Sale Stock", inv4.on_hand_stock, 29500, "34500 - 5000");


  console.log("\n==================================================")
  console.log("TEST 6 — CUSTOMER RETURN")
  console.log("==================================================")
  // Return 1 PIECE.
  await supabase.rpc('record_inventory_movement', {
      p_store_id: storeId, p_variant_id: vId_500, p_movement_type: 'customer_return', p_quantity: 1
  })
  
  const { data: inv5 } = await supabase.from('inventory_balances').select('on_hand_stock').eq('variant_id', vId_500).single();
  assertEq("After Customer Return Stock", inv5.on_hand_stock, 30000, "29500 + 500");

  console.log("\n==================================================")
  console.log("TEST 7 — MANUAL ADJUSTMENT")
  console.log("==================================================")
  // Adjust 2 PIECES.
  await supabase.rpc('record_inventory_movement', {
      p_store_id: storeId, p_variant_id: vId_500, p_movement_type: 'adjustment', p_quantity: 2
  })
  
  const { data: inv6 } = await supabase.from('inventory_balances').select('on_hand_stock').eq('variant_id', vId_500).single();
  assertEq("After Adjustment Stock", inv6.on_hand_stock, 31000, "30000 + 1000");


  console.log("\n==================================================")
  console.log("TEST 8 — CUSTOM DECIMAL")
  console.log("==================================================")
  const { data: crDec } = await supabase.rpc('create_product_with_variant', {
      p_organization_id: orgId, p_name: 'Test 1.5L', p_sku: '1.5L-' + Date.now(),
      p_purchase_cost: 50, p_selling_price: 100, p_unit_of_measure: 'L',
      p_packaging_type: 'BOX', p_units_per_pack: 10, p_item_size: 1.5
  })
  const vId_1_5L = crDec.variant_id;
  
  // Opening stock 2 BOXES = 20 items.
  await supabase.rpc('record_inventory_movement', {
      p_store_id: storeId, p_variant_id: vId_1_5L, p_movement_type: 'opening_stock', p_quantity: 20
  })
  
  const { data: inv7 } = await supabase.from('inventory_balances').select('on_hand_stock').eq('variant_id', vId_1_5L).single();
  assertEq("Decimal Inventory Balance", inv7.on_hand_stock, 30, "20 items * 1.5 L = 30 L");
  // verify exact NUMERIC is returned (might be "30.0000")
  console.log(`   (Raw database value string: "${inv7.on_hand_stock}")`);


  console.log("\n==================================================")
  console.log("TEST 9 — 250 G")
  console.log("==================================================")
  const { data: cr250 } = await supabase.rpc('create_product_with_variant', {
      p_organization_id: orgId, p_name: 'Test 250G', p_sku: '250G-' + Date.now(),
      p_purchase_cost: 50, p_selling_price: 100, p_unit_of_measure: 'G',
      p_packaging_type: 'BOX', p_units_per_pack: 20, p_item_size: 250
  })
  const vId_250G = cr250.variant_id;
  
  // 1 BOX = 20 items
  await supabase.rpc('record_inventory_movement', {
      p_store_id: storeId, p_variant_id: vId_250G, p_movement_type: 'opening_stock', p_quantity: 20
  })
  
  const { data: inv8 } = await supabase.from('inventory_balances').select('on_hand_stock').eq('variant_id', vId_250G).single();
  assertEq("250G Inventory Balance", inv8.on_hand_stock, 5000, "20 items * 250 = 5000 G");


  console.log("\n==================================================")
  console.log("TEST 10 — LEGACY PCS PRODUCT")
  console.log("==================================================")
  const { data: crPcs } = await supabase.rpc('create_product_with_variant', {
      p_organization_id: orgId, p_name: 'Legacy PCS', p_sku: 'PCS-' + Date.now(),
      p_purchase_cost: 50, p_selling_price: 100, p_unit_of_measure: 'PCS',
      p_packaging_type: 'NONE', p_units_per_pack: 1, p_item_size: 1
  })
  const vId_PCS = crPcs.variant_id;
  
  await supabase.rpc('record_inventory_movement', {
      p_store_id: storeId, p_variant_id: vId_PCS, p_movement_type: 'opening_stock', p_quantity: 10
  })
  
  const { data: inv9 } = await supabase.from('inventory_balances').select('on_hand_stock').eq('variant_id', vId_PCS).single();
  assertEq("Legacy Opening Stock", inv9.on_hand_stock, 10, "10 items * 1 = 10 PCS");

  const itemsLeg = [{ variant_id: vId_PCS, display_quantity: 1, sale_unit: 'NONE', discount_amount: 0 }]
  await supabase.rpc('process_sale', {
    p_store_id: storeId, p_customer_id: null, p_items: itemsLeg, p_payments: [{ method: 'CASH', amount: 100 }], p_due_date: null
  })
  
  const { data: inv10 } = await supabase.from('inventory_balances').select('on_hand_stock').eq('variant_id', vId_PCS).single();
  assertEq("Legacy Sale Deduction", inv10.on_hand_stock, 9, "10 - 1 = 9 PCS");


  console.log("\n==================================================")
  console.log("TEST 11 — INVENTORY VIEW")
  console.log("==================================================")
  const { data: vws } = await supabase.from('vw_inventory_available').select('*').eq('variant_id', vId_500).single();
  assertEq("View Available Stock", vws.available_stock, 31000);


  console.log("\n==================================================")
  console.log("TEST 12 — INSUFFICIENT STOCK")
  console.log("==================================================")
  // Try to sell 200 boxes = 2000 items (we only have 62 boxes (31000 ML))
  const itemsInsuff = [{ variant_id: vId_500, display_quantity: 200, sale_unit: 'BOX', discount_amount: 0 }]
  const { error: insuffErr } = await supabase.rpc('process_sale', {
    p_store_id: storeId, p_customer_id: null, p_items: itemsInsuff, p_payments: [{ method: 'CASH', amount: 200000 }], p_due_date: null
  })
  
  if (insuffErr && insuffErr.message.includes('Insufficient available stock')) {
     assertEq("Insufficient Stock Blocking", true, true, "Blocked correctly");
  } else {
     console.error("Test 12 unexpected error:", insuffErr);
     assertEq("Insufficient Stock Blocking", false, true, "Did not block");
  }
  
  const { data: inv11 } = await supabase.from('inventory_balances').select('on_hand_stock').eq('variant_id', vId_500).single();
  assertEq("Inventory unmutated after block", inv11.on_hand_stock, 31000);


  console.log("\n==================================================")
  console.log("TEST 13/14 — CREDIT REGRESSION")
  console.log("==================================================")
  const { data: customer } = await supabase.from('customers').insert({
      organization_id: orgId, name: 'Credit Test ' + Date.now(), credit_limit: 10000, outstanding_balance: 0
  }).select().single();
  
  const creditItems = [{ variant_id: vId_500, display_quantity: 1, sale_unit: 'PIECE', discount_amount: 0 }]
  const due = new Date(); due.setDate(due.getDate() + 7);
  
  const { error: creditSaleErr } = await supabase.rpc('process_sale', {
    p_store_id: storeId, p_customer_id: customer.id, p_items: creditItems, 
    p_payments: [], p_due_date: due.toISOString()
  });
  
  if (creditSaleErr) {
    console.error("TEST 13/14 ERROR:", creditSaleErr);
  }
  
  const { data: cAfter } = await supabase.from('customers').select('outstanding_balance').eq('id', customer.id).single();
  assertEq("Customer Ledger Updated", cAfter.outstanding_balance, 100);

  const { data: inv12 } = await supabase.from('inventory_balances').select('on_hand_stock').eq('variant_id', vId_500).single();
  assertEq("Credit Sale Inventory Deduction", inv12.on_hand_stock, 30500, "31000 - 500");

  console.log(`\nTests Completed: ${passed} Passed, ${failed} Failed`);
}

runTests();
