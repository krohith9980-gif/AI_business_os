import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://lhtibverxjpcvmajzazv.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_ANON_KEY) {
  console.error("Missing ANON_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function runTest() {
  console.log("=== STARTING BACKEND E2E TEST ===");

  // 1. Register fake user
  const email = `test-user-${Date.now()}@example.com`;
  const password = 'password123';
  console.log(`Registering ${email}...`);
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: 'Fake Owner' }
    }
  });

  if (authError) {
    console.error("Registration failed:", authError);
    return;
  }
  
  // Wait a second for trigger to create profile
  await new Promise(r => setTimeout(r, 1000));
  
  // Login
  await supabase.auth.signInWithPassword({ email, password });

  // 2. Setup Organization via RPC
  console.log("Setting up Organization...");
  const { data: orgId, error: setupError } = await supabase.rpc('create_organization_and_store', {
    p_org_name: 'Fake Business',
    p_store_name: 'Fake Store',
    p_business_type: 'Fertilizer / Agro Input',
    p_owner_name: 'Fake Owner',
    p_phone: '555-1234',
    p_address: '123 Fake St',
    p_village: 'Fake Village'
  });

  if (setupError) {
    console.error("Setup failed:", setupError);
    return;
  }
  console.log("Organization created:", orgId);

  // 3. Verify membership
  const { data: members, error: memError } = await supabase.from('organization_members').select('*').eq('organization_id', orgId);
  console.log("Members:", members);

  // 4. Create Product (verify 0010 RPC is working)
  console.log("Creating Product...");
  const { data: prodData, error: prodError } = await supabase.rpc('create_product_with_variant', {
    p_organization_id: orgId,
    p_name: 'Test Fertilizer',
    p_sku: 'TF-100',
    p_purchase_cost: 100,
    p_selling_price: 150,
    p_tracking_mode: 'NONE'
  });

  if (prodError) {
    console.error("Product creation failed:", prodError);
    return;
  }
  console.log("Product created:", prodData);

  console.log("=== TEST COMPLETED SUCCESSFULLY ===");
}

runTest();
