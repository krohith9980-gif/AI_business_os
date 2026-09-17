import { createClient } from '@supabase/supabase-js'
import * as e2e from './e2e_guard.mjs'

const supabase = createClient(e2e.SUPABASE_URL, e2e.SUPABASE_KEY)

async function runTests() {
  console.log("Starting Phase 2A Backend Verification...")

  // 1. Auth (using the test credentials from earlier or creating a new test user)
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'krohith9980@gmail.com',
    password: 'Rohith89@@'
  })

  if (authErr) {
    console.error("Auth failed. Ensure test@vyaparos.com exists.", authErr.message)
    return
  }

  const userId = authData.user.id
  console.log("✓ Authenticated")

  // Get active org
  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('profile_id', userId)
    .limit(1)
  
  const orgId = memberships[0].organization_id

  // Get a store
  const { data: stores } = await supabase
    .from('stores')
    .select('id')
    .eq('organization_id', orgId)
    .limit(1)
  const storeId = stores[0].id

  // Create a product and variant for testing
  const { data: product } = await supabase
    .from('products')
    .insert({ organization_id: orgId, name: 'Phase 2A Test Product', category_id: null })
    .select().single()

  const { data: variant } = await supabase
    .from('product_variants')
    .insert({
      organization_id: orgId,
      product_id: product.id,
      sku: 'P2A-' + Date.now(),
      unit_of_measure: 'PIECE',
      item_size: 1,
      packaging_type: 'BOX',
      units_per_pack: 10,
      purchase_packaging_type: 'BOX',
      purchase_units_per_pack: 10,
      purchase_cost: 50,
      selling_price: 100 // 100 per piece = 1000 per box
    }).select().single()

  // Add inventory
  const { error: invErr } = await supabase.rpc('process_inventory_adjustment', {
    p_store_id: storeId,
    p_variant_id: variant.id,
    p_movement_type: 'opening_stock',
    p_quantity: 100 // 100 base units = 10 boxes
  })

  if (invErr) {
    console.error("Failed to inject opening stock:", invErr)
    return
  }

  // Create a test customer with 10k credit limit
  const { data: customer } = await supabase
    .from('customers')
    .insert({
      organization_id: orgId,
      name: 'Credit Test User ' + Date.now(),
      phone_number: '99999' + Math.floor(Math.random() * 100000),
      village: 'Test Village',
      credit_limit: 10000,
      outstanding_balance: 0
    }).select().single()

  console.log(`✓ Test Customer created with 10k credit limit. ID: ${customer.id}`)

  // ----------------------------------------------------------------
  // C. CREDIT SALE RESULT & M. PACKAGING REGRESSION
  // ----------------------------------------------------------------
  console.log("\n--- Executing Credit Sale (₹2,500) ---")
  const due_date = new Date()
  due_date.setDate(due_date.getDate() + 7)

  // Sell 2 Boxes + 5 Pieces = 25 pieces = ₹2500
  const items = [
    { variant_id: variant.id, display_quantity: 2, sale_unit: 'BOX', discount_amount: 0 },
    { variant_id: variant.id, display_quantity: 5, sale_unit: 'PIECE', discount_amount: 0 }
  ]
  const payments = []

  const { data: saleRes, error: saleErr } = await supabase.rpc('process_sale', {
    p_store_id: storeId,
    p_customer_id: customer.id,
    p_items: items,
    p_payments: payments,
    p_due_date: due_date.toISOString()
  })

  if (saleErr) {
    console.error("Sale failed:", saleErr)
    return
  }
  console.log("✓ Sale completed. Sale ID:", saleRes)

  // Verify DB state
  const { data: updatedCustomer } = await supabase.from('customers').select('outstanding_balance').eq('id', customer.id).single()
  console.log(`✓ Customer Outstanding is now: ₹${updatedCustomer.outstanding_balance} (Expected 2500)`)

  const { data: ledger } = await supabase.from('customer_ledger').select('*').eq('customer_id', customer.id)
  console.log(`✓ Ledger contains ${ledger.length} entries. Latest balance: ₹${ledger[0].balance_after}`)

  const { data: inv } = await supabase.from('inventory_balances').select('on_hand_stock').eq('store_id', storeId).eq('variant_id', variant.id).single()
  console.log(`✓ Inventory remaining: ${inv.on_hand_stock} (Expected 75, since 100 - 25)`)

  // ----------------------------------------------------------------
  // D. PARTIAL PAYMENT RESULT
  // ----------------------------------------------------------------
  console.log("\n--- Executing Partial Payment (₹500) ---")
  const { error: payErr } = await supabase.rpc('record_customer_payment', {
    p_store_id: storeId,
    p_customer_id: customer.id,
    p_amount: 500,
    p_method: 'CASH'
  })

  if (payErr) {
    console.error("Payment insert failed:", payErr)
    return
  }

  const { data: custAfterPay } = await supabase.from('customers').select('outstanding_balance').eq('id', customer.id).single()
  console.log(`✓ Outstanding after payment: ₹${custAfterPay.outstanding_balance} (Expected 2000)`)

  // ----------------------------------------------------------------
  // E. CREDIT LIMIT REJECTION TEST
  // ----------------------------------------------------------------
  console.log("\n--- Executing Credit Limit Test (Attempting 10k sale) ---")
  const failItems = [{ variant_id: variant.id, display_quantity: 10, sale_unit: 'BOX', discount_amount: 0 }] // 10 boxes = 100 pieces = 10,000
  const failPayments = []
  
  const { error: limitErr } = await supabase.rpc('process_sale', {
    p_store_id: storeId,
    p_customer_id: customer.id,
    p_items: failItems,
    p_payments: failPayments,
    p_due_date: new Date().toISOString()
  })

  if (limitErr && limitErr.message.includes('customer credit limit')) {
    console.log("✓ SUCCESS: Transaction correctly blocked by RPC with message:", limitErr.message)
  } else {
    console.log("❌ FAILED: Transaction was not blocked or failed with wrong error:", limitErr)
  }

  const { data: custFinal } = await supabase.from('customers').select('outstanding_balance').eq('id', customer.id).single()
  console.log(`✓ Final Outstanding remains: ₹${custFinal.outstanding_balance} (Expected 2000)`)

  console.log("\nAll Backend RPC/DB verifications completed.")
}

runTests()
