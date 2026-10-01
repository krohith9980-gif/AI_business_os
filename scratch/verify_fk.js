const { Client } = require('pg');
async function run() {
  const client = new Client('postgresql://postgres.wtzyngynxxnncgnniyym:Rohith89012@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres');
  await client.connect();
  const res = await client.query(`
    SELECT DISTINCT tc.constraint_name 
    FROM information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY' 
      AND tc.table_name='purchase_receipt_items'
      AND tc.constraint_name LIKE '%po_item%';
  `);
  console.log(res.rows);
  await client.end();
}
run().catch(console.error);
