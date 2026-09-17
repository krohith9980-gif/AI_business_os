import { Client } from 'pg';

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

  console.log('\n2. CHECKING DATABASE FACT...');
  const { rows: purchase } = await c.query("SELECT id, organization_id, store_id, supplier_id, status, payment_status, grand_total, created_at FROM public.purchase_orders WHERE id = '31cbc3f3-ca4f-4df3-b840-7306354108dc'");
  console.log('Purchase exists:', purchase.length > 0);
  if (purchase.length > 0) {
    console.log(purchase[0]);
  }
  
  if (purchase.length > 0) {
      const orgId = purchase[0].organization_id;
      const { rows: countRes } = await c.query("SELECT COUNT(*) FROM public.purchase_orders WHERE organization_id = $1", [orgId]);
      console.log('Total purchase_orders for this org (Service Role):', countRes[0].count);
  }

  console.log('\n3. FINDING AUTH USER STORE & ORG...');
  const { rows: userStores } = await c.query(`
    SELECT us.store_id, s.organization_id 
    FROM public.user_stores us
    JOIN public.stores s ON s.id = us.store_id
    WHERE us.profile_id = $1 AND us.is_active = true
  `, [authUserId]);
  
  if (userStores.length === 0) {
    console.log('No active store for this user!');
  } else {
    console.log('Auth Organization ID:', userStores[0].organization_id);
    console.log('Auth Store ID:', userStores[0].store_id);
    console.log('Purchase Organization ID:', purchase[0]?.organization_id);
    console.log('Purchase Store ID:', purchase[0]?.store_id);
  }

  console.log('\n4. TESTING RLS & QUERY (Impersonating User)...');
  await c.query(`
    set local role authenticated;
    set local request.jwt.claims = '${JSON.stringify({
      sub: authUserId,
      role: 'authenticated',
      email: 'krohith56789@gmail.com'
    })}';
  `);

  try {
    const orgId = userStores[0].organization_id;
    // Exactly replicating the Supabase query:
    // .select('id, status, created_at, grand_total, payment_status, amount_paid, po_items(id, quantity_ordered, purchase_cost), suppliers(id, name)')
    // .eq('organization_id', orgId)
    // .order('created_at', false)
    // .limit(50)
    // In SQL, doing the exact joins PostgREST does:
    const { rows: rlsRes } = await c.query(`
        SELECT po.id, po.status, po.created_at, po.grand_total, po.payment_status, po.amount_paid,
               (SELECT json_agg(json_build_object('id', poi.id, 'quantity_ordered', poi.quantity_ordered, 'purchase_cost', poi.purchase_cost)) FROM public.po_items poi WHERE poi.po_id = po.id) as po_items,
               (SELECT row_to_json(s) FROM (SELECT sup.id, sup.name FROM public.suppliers sup WHERE sup.id = po.supplier_id) s) as suppliers
        FROM public.purchase_orders po
        WHERE po.organization_id = $1
        ORDER BY po.created_at DESC
        LIMIT 50
    `, [orgId]);
    
    console.log(`RLS Query Result Count: ${rlsRes.length}`);
    const found = rlsRes.find(r => r.id === '31cbc3f3-ca4f-4df3-b840-7306354108dc');
    console.log('Purchase 31cbc3f3... returned under RLS:', found ? 'YES' : 'NO');
    
    // If it's empty, let's test a simple select
    const { rows: simpleRlsRes } = await c.query(`SELECT id FROM public.purchase_orders WHERE id = '31cbc3f3-ca4f-4df3-b840-7306354108dc'`);
    console.log('Simple SELECT under RLS returned:', simpleRlsRes.length > 0 ? 'YES' : 'NO');
    
  } catch (err) {
    console.log('Query Error:', err);
  }

  await c.end();
}

run().catch(console.error);
