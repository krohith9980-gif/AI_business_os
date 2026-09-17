import pg from 'pg';
const DB_URL = 'postgresql://postgres.wtzyngynxxnncgnniyym:Rohith89012@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres';
const pool = new pg.Pool({ connectionString: DB_URL });
async function run() {
  const { rows } = await pool.query("SELECT * FROM user_stores LIMIT 5");
  console.log(rows);
  pool.end();
}
run();
