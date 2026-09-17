import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function investigate() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  // Sign in as owner
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'krohith56789@gmail.com',
    password: 'Password123!' // Using standard test password, change if different
  });
  
  if (authErr) {
    console.log("Auth Error:", authErr.message);
    // Let's try without auth using service key if anon key fails
    return;
  }

  const user = authData.user;
  
  const { data: userStore } = await supabase
    .from('user_stores')
    .select('store_id, stores(organization_id)')
    .eq('profile_id', user.id)
    .eq('is_active', true)
    .single();
    
  const orgId = Array.isArray(userStore?.stores) 
    ? userStore.stores[0]?.organization_id 
    : userStore?.stores?.organization_id;

  console.log("Org ID:", orgId);

  const { data: purchases, error } = await supabase
    .from('purchase_orders')
    .select(`
      id,
      status,
      created_at,
      po_items (
        id,
        quantity_ordered,
        purchase_cost
      ),
      suppliers (
        id,
        name
      )
    `)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(5);
    
  console.log("Purchases returned:", purchases ? purchases.length : 0);
  console.log(JSON.stringify(purchases, null, 2));
}

investigate().catch(console.error);
