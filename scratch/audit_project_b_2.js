const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres:Rohith89012@db.wtzyngynxxnncgnniyym.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    
    const inventory = await client.query("SELECT count(*) FROM public.inventory_balances");
    console.log("Inventory Balances Count:", inventory.rows[0].count);

    console.log("\n=== OWNER ACCOUNT ===");
    const owner = await client.query("SELECT id, email, email_confirmed_at FROM auth.users WHERE email = 'krohith56789@gmail.com'");
    console.log("Owner Account:", owner.rows);

    console.log("\n=== WORKER ACCOUNT ===");
    const worker = await client.query("SELECT id, email, phone FROM auth.users WHERE phone IS NOT NULL LIMIT 1");
    console.log("Worker Account Example:", worker.rows);

  } catch (e) {
    console.error("ERROR:", e.message);
  } finally {
    await client.end();
  }
}

run();
