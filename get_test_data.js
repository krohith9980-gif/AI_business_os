const { Client } = require('./scratch/node_modules/pg');

async function run() {
  const client = new Client('postgresql://postgres.wtzyngynxxnncgnniyym:Rohith89012@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres');
  await client.connect();

  const data = {};

  const org = await client.query('SELECT id FROM public.organizations LIMIT 1');
  if(org.rows.length === 0) { console.log('No organizations'); return; }
  data.org_id = org.rows[0].id;

  const user = await client.query('SELECT profile_id FROM public.organization_members WHERE organization_id = $1 AND role IN (\'OWNER\', \'MANAGER\') LIMIT 1', [data.org_id]);
  data.user_id = user.rows[0].profile_id;

  const store = await client.query('SELECT id FROM public.stores WHERE organization_id = $1 LIMIT 1', [data.org_id]);
  data.store_id = store.rows[0].id;

  const supplier = await client.query('SELECT id FROM public.suppliers WHERE organization_id = $1 LIMIT 1', [data.org_id]);
  data.supplier_id = supplier.rows[0].id;

  const variant = await client.query('SELECT id FROM public.product_variants WHERE organization_id = $1 LIMIT 1', [data.org_id]);
  data.variant_id = variant.rows[0].id;

  console.log(JSON.stringify(data, null, 2));
  await client.end();
}

run().catch(console.error);
