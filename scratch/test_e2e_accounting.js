require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Must use Staging credentials!
const STAGING_URL = process.env.NEXT_PUBLIC_SUPABASE_URL_STAGING;
const STAGING_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY_STAGING;

if (!STAGING_URL || !STAGING_KEY) {
  console.error("Missing STAGING credentials");
  process.exit(1);
}

const supabase = createClient(STAGING_URL, STAGING_KEY);

async function getStats(storeId, supplierId, variantId, poId) {
  const { data: storeInv } = await supabase.from('inventory').select('quantity').eq('store_id', storeId).eq('variant_id', variantId).single();
  const { data: supplier } = await supabase.from('suppliers').select('outstanding_balance').eq('id', supplierId).single();
  const { count, data: ledger } = await supabase.from('supplier_ledger').select('amount', { count: 'exact' }).eq('supplier_id', supplierId);
  const ledgerSum = ledger ? ledger.reduce((sum, l) => sum + Number(l.amount || 0), 0) : 0;
  
  let poStatus = 'NONE';
  let paymentStatus = 'NONE';
  if (poId) {
    const { data: po } = await supabase.from('purchase_orders').select('status, payment_status').eq('id', poId).single();
    if (po) {
      poStatus = po.status;
      paymentStatus = po.payment_status;
    }
  }

  return {
    inventory: storeInv ? storeInv.quantity : 0,
    outstanding: supplier ? Number(supplier.outstanding_balance || 0) : 0,
    ledgerCount: count || 0,
    poStatus,
    paymentStatus
  };
}

async function runTests() {
  console.log("Fetching test context...");
  const { data: store } = await supabase.from('stores').select('id, organization_id').limit(1).single();
  const { data: supplier } = await supabase.from('suppliers').select('id').limit(1).single();
  const { data: variant } = await supabase.from('product_variants').select('id').limit(1).single();
  
  const storeId = store.id;
  const orgId = store.organization_id;
  const supplierId = supplier.id;
  const variantId = variant.id;
  const purchaseCost = 1000;
  
  const managerId = '00000000-0000-0000-0000-000000000000'; // We need a real manager ID or we bypass RLS. 
  // Wait, service role bypasses RLS, but the RPCs enforce auth.uid(). We MUST use a real user JWT or bypass the auth check in script.
  // We can't bypass auth check in RPCs if we use service role. We need an anon key + valid JWT, OR we must run a query to get a user and mock JWT.
}
runTests().catch(console.error);
