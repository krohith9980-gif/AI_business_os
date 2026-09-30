const { Client } = require('pg');
async function run() {
  const client = new Client('postgresql://postgres.wtzyngynxxnncgnniyym:Rohith89012@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres');
  await client.connect();
  await client.query(`NOTIFY pgrst, 'reload schema'`);
  console.log("Reloaded PostgREST schema cache.");
  await client.end();
}
run().catch(console.error);
