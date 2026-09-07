import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import * as e2e from './e2e_guard.mjs';

const SUPABASE_URL = e2e.SUPABASE_URL;
const SUPABASE_ANON_KEY = e2e.SUPABASE_KEY;

const OWNER_EMAIL = 'krohith9980@gmail.com'; 
const PASSWORD_OWNER = 'Rohith89@@'; 
const PASSWORD = 'password123'; 

// Test accounts we created earlier
const MANAGER_EMAIL = 'manager@vyaparos.com';
const CASHIER_EMAIL = 'cashier@vyaparos.com';
const TENANT_B_EMAIL = 'tenantb@vyaparos.com';

const OWNER_ORG_ID = 'e7d9b9a8-e1c8-47bc-81d1-6701bb4145eb';
const OWNER_STORE_ID = '331003d7-6dbd-4299-80fb-1df44a9573ad';

const B_ORG_ID = '5920a109-fcc7-4cf0-8800-d8ccb8a3641b';
const B_STORE_ID = 'df2b8266-9ef0-4822-b2d5-534bc7e49221';

async function runTests() {
  const supabaseOwner = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const supabaseManager = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const supabaseCashier = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const supabaseTenantB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const l1 = await supabaseOwner.auth.signInWithPassword({ email: OWNER_EMAIL, password: PASSWORD_OWNER });
  if(l1.error) console.error("OWNER LOGIN FAILED:", l1.error);
  
  const l2 = await supabaseManager.auth.signInWithPassword({ email: MANAGER_EMAIL, password: PASSWORD });
  if(l2.error) console.error("MANAGER LOGIN FAILED:", l2.error);
  
  const l3 = await supabaseCashier.auth.signInWithPassword({ email: CASHIER_EMAIL, password: PASSWORD });
  if(l3.error) console.error("CASHIER LOGIN FAILED:", l3.error);
  
  const l4 = await supabaseTenantB.auth.signInWithPassword({ email: TENANT_B_EMAIL, password: PASSWORD });
  if(l4.error) console.error("TENANT B LOGIN FAILED:", l4.error);

  console.log("=== RUNNING STAGING TESTS ===\n");

  // TEST 1: Basic item-based stock (10 boxes, 1 item/box -> 10)
  console.log("TEST 1: Basic item-based stock (250 mL, 10 boxes, 1 item/box)");
  const res1 = await supabaseOwner.rpc('create_product_with_opening_stock', {
      p_organization_id: OWNER_ORG_ID,
      p_store_id: OWNER_STORE_ID,
      p_name: 'Test Basic',
      p_sku: 'TST-BASIC-' + Date.now(),
      p_purchase_cost: 10,
      p_selling_price: 20,
      p_opening_stock_packages: 10,
      p_unit_of_measure: 'ML',
      p_packaging_type: 'BOX',
      p_units_per_pack: 1,
      p_item_size: 250
  });
  if(res1.error) console.error("T1 Error:", res1.error);
  else {
      const bal1 = await supabaseOwner.from('inventory_balances').select('on_hand_stock').eq('variant_id', res1.data.variant_id).single();
      console.log(`T1 Result: Stock = ${bal1.data?.on_hand_stock} (Expected 10)`);
  }

  // TEST 2: Multiple items (10 boxes, 15 items/box -> 150)
  console.log("\nTEST 2: Multiple items (250 mL, 10 boxes, 15 items/box)");
  const res2 = await supabaseOwner.rpc('create_product_with_opening_stock', {
      p_organization_id: OWNER_ORG_ID,
      p_store_id: OWNER_STORE_ID,
      p_name: 'Test Multiple',
      p_sku: 'TST-MULT-' + Date.now(),
      p_purchase_cost: 10,
      p_selling_price: 20,
      p_opening_stock_packages: 10,
      p_unit_of_measure: 'ML',
      p_packaging_type: 'BOX',
      p_units_per_pack: 15,
      p_item_size: 250
  });
  if(res2.error) console.error("T2 Error:", res2.error);
  else {
      const bal2 = await supabaseOwner.from('inventory_balances').select('on_hand_stock').eq('variant_id', res2.data.variant_id).single();
      console.log(`T2 Result: Stock = ${bal2.data?.on_hand_stock} (Expected 150)`);
  }

  // TEST 3: NONE packaging (10 stock, 100 units -> 10)
  console.log("\nTEST 3: NONE packaging (10 stock, 100 units)");
  const res3 = await supabaseOwner.rpc('create_product_with_opening_stock', {
      p_organization_id: OWNER_ORG_ID,
      p_store_id: OWNER_STORE_ID,
      p_name: 'Test None',
      p_sku: 'TST-NONE-' + Date.now(),
      p_purchase_cost: 10,
      p_selling_price: 20,
      p_opening_stock_packages: 10,
      p_unit_of_measure: 'ML',
      p_packaging_type: 'NONE',
      p_units_per_pack: 100, // This should be ignored!
      p_item_size: 250
  });
  if(res3.error) console.error("T3 Error:", res3.error);
  else {
      const bal3 = await supabaseOwner.from('inventory_balances').select('on_hand_stock').eq('variant_id', res3.data.variant_id).single();
      console.log(`T3 Result: Stock = ${bal3.data?.on_hand_stock} (Expected 10)`);
  }

  // TEST 4: item_size independence
  console.log("\nTEST 4: item_size independence (Same inputs, item_size=500)");
  const res4 = await supabaseOwner.rpc('create_product_with_opening_stock', {
      p_organization_id: OWNER_ORG_ID,
      p_store_id: OWNER_STORE_ID,
      p_name: 'Test Size',
      p_sku: 'TST-SIZE-' + Date.now(),
      p_purchase_cost: 10,
      p_selling_price: 20,
      p_opening_stock_packages: 10,
      p_unit_of_measure: 'ML',
      p_packaging_type: 'BOX',
      p_units_per_pack: 15,
      p_item_size: 500
  });
  if(res4.error) console.error("T4 Error:", res4.error);
  else {
      const bal4 = await supabaseOwner.from('inventory_balances').select('on_hand_stock').eq('variant_id', res4.data.variant_id).single();
      console.log(`T4 Result: Stock = ${bal4.data?.on_hand_stock} (Expected 150)`);
  }

  // TEST 5: Cross-tenant variant attack
  console.log("\nTEST 5: Cross-tenant variant attack (Tenant A store + Tenant B variant)");
  // Tenant A attempts to adjust Tenant B's variant using Tenant A's store
  // First get a variant from Tenant B
  const bProd = await supabaseTenantB.rpc('create_product_with_opening_stock', {
    p_organization_id: B_ORG_ID,
    p_store_id: B_STORE_ID,
    p_name: 'B Product',
    p_sku: 'B-PROD-' + Date.now(),
    p_purchase_cost: 10,
    p_selling_price: 20,
    p_opening_stock_packages: 5
  });
  const bVariantId = bProd.data?.variant_id || '00000000-0000-0000-0000-000000000000';
  
  const res5 = await supabaseOwner.rpc('process_inventory_adjustment', {
      p_store_id: OWNER_STORE_ID,
      p_variant_id: bVariantId,
      p_quantity: 10,
      p_movement_type: 'adjustment',
      p_notes: 'Hacking Tenant B'
  });
  if(res5.error) {
      console.log(`T5 Result: REJECTED successfully. (${res5.error.message})`);
  } else {
      console.error("T5 Failed: The attack succeeded!");
  }

  // TEST 6: Direct low-level access (record_inventory_movement) -> DENIED
  console.log("\nTEST 6: Direct low-level access to record_inventory_movement");
  const res6 = await supabaseOwner.rpc('record_inventory_movement', {
      p_store_id: OWNER_STORE_ID,
      p_variant_id: res1.data?.variant_id,
      p_movement_type: 'adjustment',
      p_quantity: 5
  });
  if(res6.error) {
      console.log(`T6 Result: REJECTED successfully. (${res6.error.message})`);
  } else {
      console.error("T6 Failed: Access granted!");
  }

  // TEST 7: Privilege chain (process_sale) -> SUCCEEDS
  console.log("\nTEST 7: Privilege chain via process_sale");
  if (!res1.data) {
      console.error("T7 skipped: res1.data is null");
  } else {
      const res7 = await supabaseOwner.rpc('process_sale', {
          p_store_id: OWNER_STORE_ID,
          p_customer_id: null,
          p_items: [{
              variant_id: res1.data.variant_id,
              quantity: 2,
              unit_price: 20,
              discount_amount: 0,
              subtotal: 40
          }],
          p_payment_method: 'CASH',
          p_amount_paid: 40,
          p_subtotal: 40,
          p_total_discount: 0,
          p_tax_amount: 0,
          p_grand_total: 40
      });
      if(res7.error) console.error("T7 Error:", res7.error);
      else {
          const bal7 = await supabaseOwner.from('inventory_balances').select('on_hand_stock').eq('variant_id', res1.data.variant_id).single();
          console.log(`T7 Result: Sale succeeded! Remaining stock = ${bal7.data?.on_hand_stock} (Expected 8)`);
      }
  }

  // TEST 8: CASHIER product creation -> REJECTED
  console.log("\nTEST 8: CASHIER product creation");
  const res8 = await supabaseCashier.rpc('create_product_with_opening_stock', {
      p_organization_id: OWNER_ORG_ID,
      p_store_id: OWNER_STORE_ID,
      p_name: 'Cashier Prod',
      p_sku: 'CASH-' + Date.now(),
      p_purchase_cost: 10,
      p_selling_price: 20,
      p_opening_stock_packages: 10
  });
  if(res8.error) {
      console.log(`T8 Result: REJECTED successfully. (${res8.error.message})`);
  } else {
      console.error("T8 Failed: Cashier created product!");
  }

  // TEST 9: MANAGER product creation -> SUCCESS
  console.log("\nTEST 9: MANAGER product creation");
  const res9 = await supabaseManager.rpc('create_product_with_opening_stock', {
      p_organization_id: OWNER_ORG_ID,
      p_store_id: OWNER_STORE_ID,
      p_name: 'Manager Prod',
      p_sku: 'MGR-' + Date.now(),
      p_purchase_cost: 10,
      p_selling_price: 20,
      p_opening_stock_packages: 5
  });
  if(res9.error) console.error("T9 Error:", res9.error);
  else console.log(`T9 Result: SUCCESS! Created variant ${res9.data.variant_id}`);

  // TEST 10: Wrong store/cross-org -> REJECTED
  console.log("\nTEST 10: Wrong store / cross-org creation");
  const res10 = await supabaseOwner.rpc('create_product_with_opening_stock', {
      p_organization_id: OWNER_ORG_ID,
      p_store_id: B_STORE_ID, // Passing Tenant B's store!
      p_name: 'Cross Org Prod',
      p_sku: 'CROSS-' + Date.now(),
      p_purchase_cost: 10,
      p_selling_price: 20,
      p_opening_stock_packages: 5
  });
  if(res10.error) {
      console.log(`T10 Result: REJECTED successfully. (${res10.error.message})`);
  } else {
      console.error("T10 Failed: Succeeded in cross-org creation!");
  }

  // TEST 11: Atomic rollback (Force failure via negative stock)
  console.log("\nTEST 11: Atomic rollback (Force failure by negative stock)");
  const sku11 = 'ATOMIC-' + Date.now();
  const res11 = await supabaseOwner.rpc('create_product_with_opening_stock', {
      p_organization_id: OWNER_ORG_ID,
      p_store_id: OWNER_STORE_ID,
      p_name: 'Atomic Prod',
      p_sku: sku11,
      p_purchase_cost: 10,
      p_selling_price: 20,
      p_opening_stock_packages: -5 // Invalid
  });
  if(res11.error) {
      console.log(`T11 Result: REJECTED (${res11.error.message}). Checking for orphans...`);
      const prodCheck = await supabaseOwner.from('products').select('*').eq('sku', sku11);
      console.log(`Orphaned Products: ${prodCheck.data?.length}`);
  } else {
      console.error("T11 Failed: Creation succeeded?");
  }

  // TEST 12: Zero opening stock
  console.log("\nTEST 12: Zero opening stock");
  const sku12 = 'ZERO-' + Date.now();
  const res12 = await supabaseOwner.rpc('create_product_with_opening_stock', {
      p_organization_id: OWNER_ORG_ID,
      p_store_id: OWNER_STORE_ID,
      p_name: 'Zero Prod',
      p_sku: sku12,
      p_purchase_cost: 10,
      p_selling_price: 20,
      p_opening_stock_packages: 0
  });
  if(res12.error) console.error("T12 Error:", res12.error);
  else {
      const bal12 = await supabaseOwner.from('inventory_balances').select('on_hand_stock').eq('variant_id', res12.data.variant_id);
      const move12 = await supabaseOwner.from('inventory_movements').select('*').eq('variant_id', res12.data.variant_id);
      console.log(`T12 Result: SUCCESS. Balances: ${bal12.data?.length}, Movements: ${move12.data?.length}`);
  }
}
runTests();
