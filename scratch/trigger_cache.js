const { Client } = require('pg');
async function run() {
  const client = new Client('postgresql://postgres.wtzyngynxxnncgnniyym:Rohith89012@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres');
  await client.connect();
  await client.query(`COMMENT ON TABLE public.po_items IS 'Trigger PostgREST cache reload';`);
  console.log("Executed DDL to trigger cache reload.");
  await client.end();
}
run().catch(console.error);
