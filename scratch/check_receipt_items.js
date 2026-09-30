const { Client } = require('pg');
async function run() {
  const client = new Client('postgresql://postgres.wtzyngynxxnncgnniyym:Rohith89012@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres');
  await client.connect();

  const res = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'purchase_receipt_items';
  `);
  console.log(res.rows);
  await client.end();
}
run().catch(console.error);
