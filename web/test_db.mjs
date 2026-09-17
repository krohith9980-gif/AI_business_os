import pg from 'pg';
const DB_URL = 'postgresql://postgres.wtzyngynxxnncgnniyym:Rohith89012@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres';
const pool = new pg.Pool({ connectionString: DB_URL });
async function run() {
  const { rows } = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
  console.log(rows.map(r => r.table_name).join(', '));
  pool.end();
}
run();
