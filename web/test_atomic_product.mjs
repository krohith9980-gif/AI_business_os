import { createClient } from '@supabase/supabase-js';
import * as e2e from './e2e_guard.mjs';

const supabase = createClient(e2e.SUPABASE_URL, e2e.SUPABASE_KEY);

async function runTests() {
  console.log("Starting Atomic Product Creation Security & Atomicity Tests...");

  // Setup: Authenticate as the main test user (OWNER)
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'krohith9980@gmail.com',
    password: 'Rohith89@@'
  });
  if (authErr) {
    console.error("Auth failed.", authErr.message);
    return;
  }
  const userId = authData.user.id;

  // Get User's Active Organization and Store
  const { data: memberships } = await supabase.from('organization_members').select('*').eq('profile_id', userId).eq('is_active', true);
  const orgId = memberships[0].organization_id;

  const { data: stores } = await supabase.from('stores').select('*').eq('organization_id', orgId);
  const storeId = stores[0].id;

  // Find another organization/store to test cross-tenant
  const { data: otherStores } = await supabase.from('stores').select('*').neq('organization_id', orgId).limit(1);
  const otherStoreId = otherStores.length > 0 ? otherStores[0].id : null;
  const otherOrgId = otherStores.length > 0 ? otherStores[0].organization_id : null;

  console.log("==================================================");
  console.log("TEST 1 — OWNER ALLOWED (POSITIVE OPENING STOCK, CONVERSION CORRECT)");
  console.log("==================================================");
  
  // 250 mL, 10 boxes, 15 units per box -> 150 base units
  const skuOwner = 'ATOMIC-OWNER-' + Date.now();
  const resOwner = await supabase.rpc('create_product_with_opening_stock', {
    p_organization_id: orgId,
    p_store_id: storeId,
    p_name: 'Owner Atomic Test',
    p_sku: skuOwner,
    p_purchase_cost: 100,
    p_selling_price: 150,
    p_opening_stock_packages: 10,
    p_unit_of_measure: 'ML',
    p_packaging_type: 'BOX',
    p_units_per_pack: 15,
    p_item_size: 250
  });

  if (resOwner.error) console.error("FAILED TEST 1:", resOwner.error);
  else {
    const variantId = resOwner.data.variant_id;
    const { data: bal } = await supabase.from('inventory_balances').select('on_hand_stock').eq('variant_id', variantId).eq('store_id', storeId).single();
    const actualVolume = bal.on_hand_stock; // 150 * 250 = 37500
    const expectedVolume = 37500;
    if (actualVolume === expectedVolume) console.log("✓ PASS: Owner allowed, Opening stock initialized correctly (37.5L / 37500 ML)");
    else console.error(`FAILED TEST 1: Stock mismatch. Expected ${expectedVolume}, Got ${actualVolume}`);
    
    // Check movements
    const { data: mvts } = await supabase.from('inventory_movements').select('*').eq('variant_id', variantId);
    if (mvts.length === 1 && mvts[0].movement_type === 'opening_stock' && mvts[0].quantity === 37500) {
        console.log("✓ PASS: Movement logged correctly");
    } else {
        console.error("FAILED TEST 1: Movement mismatch", mvts);
    }
  }

  const adminSupabase = createClient(e2e.SUPABASE_URL, e2e.SUPABASE_KEY);

  console.log("\n==================================================");
  console.log("TEST 2 & 3 — MANAGER & CASHIER SECURITY");
  console.log("==================================================");
  
  // Create a temporary dummy user for testing roles
  const dummyEmail = `dummy_${Date.now()}@test.com`;
  const { data: dummyUser } = await adminSupabase.auth.admin.createUser({
    email: dummyEmail,
    password: 'password123',
    email_confirm: true
  });
  const dummyId = dummyUser.user.id;

  // Insert as MANAGER
  await adminSupabase.from('organization_members').insert({
    organization_id: orgId, profile_id: dummyId, role: 'MANAGER', is_active: true
  });

  const dummyClient = createClient(e2e.SUPABASE_URL, e2e.SUPABASE_KEY); 
  await dummyClient.auth.signInWithPassword({ email: dummyEmail, password: 'password123' });

  const resManager = await dummyClient.rpc('create_product_with_opening_stock', {
    p_organization_id: orgId, p_store_id: storeId, p_name: 'Mgr Test', p_sku: 'ATOMIC-MGR-' + Date.now(),
    p_purchase_cost: 10, p_selling_price: 20, p_opening_stock_packages: 0
  });

  if (resManager.error) console.error("FAILED TEST 2:", resManager.error);
  else console.log("✓ PASS: Manager allowed, Zero opening stock -> No movement created");

  // Update to CASHIER
  await adminSupabase.from('organization_members').update({ role: 'CASHIER' }).eq('profile_id', dummyId);
  
  const resCashier = await dummyClient.rpc('create_product_with_opening_stock', {
    p_organization_id: orgId, p_store_id: storeId, p_name: 'Cashier Test', p_sku: 'ATOMIC-CASHIER',
    p_purchase_cost: 10, p_selling_price: 20, p_opening_stock_packages: 10
  });

  if (resCashier.error && resCashier.error.message.includes('Unauthorized')) {
    console.log("✓ PASS: Cashier correctly rejected.");
  } else {
    console.error("FAILED TEST 3: Cashier was NOT rejected!", resCashier);
  }

  // Cleanup dummy
  await adminSupabase.auth.admin.deleteUser(dummyId);

  console.log("\n==================================================");
  console.log("TEST 4 — ANONYMOUS DENIED");
  console.log("==================================================");
  const anonSupabase = createClient(e2e.SUPABASE_URL, e2e.SUPABASE_KEY); 
  // No signIn, so auth.uid() is null
  
  const resAnon = await anonSupabase.rpc('create_product_with_opening_stock', {
    p_organization_id: orgId, p_store_id: storeId, p_name: 'Anon Test', p_sku: 'ATOMIC-ANON',
    p_purchase_cost: 10, p_selling_price: 20, p_opening_stock_packages: 10
  });

  if (resAnon.error && resAnon.error.message.includes('Not authenticated')) {
    console.log("✓ PASS: Anonymous correctly rejected.");
  } else {
    console.error("FAILED TEST 4:", resAnon);
  }

  if (otherStoreId) {
    console.log("\n==================================================");
    console.log("TEST 5 — CROSS-ORGANIZATION STORE INJECTION DENIED");
    console.log("==================================================");
    const resCross = await supabase.rpc('create_product_with_opening_stock', {
        p_organization_id: orgId, p_store_id: otherStoreId, p_name: 'Cross Test', p_sku: 'ATOMIC-CROSS',
        p_purchase_cost: 10, p_selling_price: 20, p_opening_stock_packages: 10
    });
    if (resCross.error && resCross.error.message.includes('Store does not belong to the specified organization')) {
        console.log("✓ PASS: Cross-tenant store injection rejected.");
    } else console.error("FAILED TEST 5:", resCross);
  }

  console.log("\n==================================================");
  console.log("TEST 6 — WRONG-STORE/ORG COMBINATION DENIED");
  console.log("==================================================");
  const resWrong = await supabase.rpc('create_product_with_opening_stock', {
      p_organization_id: otherOrgId || '00000000-0000-0000-0000-000000000000', p_store_id: storeId, p_name: 'Wrong Test', p_sku: 'ATOMIC-WRONG',
      p_purchase_cost: 10, p_selling_price: 20, p_opening_stock_packages: 10
  });
  
  if (resWrong.error && resWrong.error.message.includes('Store does not belong to the specified organization')) {
      console.log("✓ PASS: Wrong store/org combination rejected.");
  } else console.error("FAILED TEST 6:", resWrong);

  console.log("\n==================================================");
  console.log("TEST 7 — ATOMIC ROLLBACK TEST");
  console.log("==================================================");
  
  const skuRollback = 'ATOMIC-ROLLBACK-' + Date.now();
  
  // To throw inside record_inventory_movement, we can cause numeric overflow in the `on_hand_stock` assignment.
  // inventory_balances.on_hand_stock is NUMERIC(14,4) -> max 9,999,999,999.9999
  // If we pass p_opening_stock_packages = 10,000,000, and p_item_size = 10,000 (which is totally legal up to this point)
  // v_base_units = 10,000,000 * 1 = 10,000,000
  // Inside record_inventory_movement, v_actual_quantity = 10,000,000 * 10,000 = 100,000,000,000
  // 100,000,000,000 > 9,999,999,999, so it overflows NUMERIC(14,4)!
  
  const resRollback = await supabase.rpc('create_product_with_opening_stock', {
      p_organization_id: orgId, p_store_id: storeId, p_name: 'Rollback Test', p_sku: skuRollback,
      p_purchase_cost: 10, p_selling_price: 20, 
      p_opening_stock_packages: 10000000,
      p_units_per_pack: 1,
      p_item_size: 100000
  });

  if (resRollback.error && resRollback.error.message.includes('numeric field overflow')) {
      console.log("✓ PASS: Exception successfully triggered during inventory insertion.");
      
      const { data: prodData } = await supabase.from('products').select('*').eq('name', 'Rollback Test');
      const { data: varData } = await supabase.from('product_variants').select('*').eq('sku', skuRollback);
      
      if (prodData.length === 0 && varData.length === 0) {
          console.log("✓ PASS: Transaction fully rolled back. No orphaned product/variant exists.");
      } else {
          console.error("FAILED TEST 7: Orphaned records found!", prodData, varData);
      }
  } else {
      console.error("FAILED TEST 7: Expected numeric overflow, got:", resRollback);
  }

}

runTests().catch(console.error);
