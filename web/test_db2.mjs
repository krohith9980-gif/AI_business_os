import pg from 'pg';
const DB_URL = 'postgresql://postgres.wtzyngynxxnncgnniyym:Rohith89012@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres';
const pool = new pg.Pool({ connectionString: DB_URL });
async function run() {
  const { rows } = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'inventory_balances'");
  console.log(rows);
  pool.end();
}
run();
