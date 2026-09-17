const { Client } = require('pg');
const connectionString = 'postgresql://postgres.wtzyngynxxnncgnniyym:Rohith89012@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres';

async function run() {
  const c = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const query = `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'purchase_orders'`;
  const res = await c.query(query);
  console.table(res.rows);
  await c.end();
}

run().catch(console.error);
