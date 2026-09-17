const { Client } = require('pg');
const connectionString = 'postgresql://postgres.wtzyngynxxnncgnniyym:Rohith89012@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres';

async function run() {
  const c = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await c.connect();

  console.log('1. FINDING AUTH USER...');
  const { rows: users } = await c.query("SELECT id FROM auth.users WHERE email = 'krohith56789@gmail.com'");
  if (users.length === 0) {
    console.error('User not found!');
    await c.end();
    return;
  }
  const authUserId = users[0].id;
  console.log('Auth User ID:', authUserId);

  console.log('\n2. FINDING AUTH USER STORE & ORG...');
  const { rows: userStores } = await c.query(`
    SELECT us.store_id, s.organization_id 
    FROM public.user_stores us
    JOIN public.stores s ON s.id = us.store_id
    WHERE us.profile_id = $1 AND us.is_active = true
  `, [authUserId]);
  
  const orgId = userStores[0].organization_id;

  console.log('\n3. TESTING EXACT PAGE.TSX QUERY (via Supabase JS REST syntax)...');
  
  // page.tsx queries:
  // .from('purchase_orders')
  // .select('id, status, created_at, grand_total, payment_status, amount_paid, po_items(id, quantity_ordered, purchase_cost), suppliers(id, name)')
  
  // If the JS client fails, we can catch the error by actually using fetch to hit PostgREST!
  // We need the Staging Anon key and URL to properly reproduce the page.tsx fetch!
  // Let's get them from .env.production or .env.local!
}

run().catch(console.error);
