const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres:Rohith89012@db.wtzyngynxxnncgnniyym.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    
    console.log("=== TABLES ===");
    const tablesRes = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
    console.log(tablesRes.rows.map(r => r.tablename));

    console.log("\n=== MIGRATIONS ===");
    // Usually migrations are in supabase_migrations.schema_migrations if managed by supabase cli
    const migRes = await client.query("SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5");
    console.log(migRes.rows);

    console.log("\n=== BUSINESS DATA ===");
    const orgs = await client.query("SELECT id, name FROM public.organizations LIMIT 1");
    console.log("Organizations:", orgs.rows);
    
    const stores = await client.query("SELECT id, name FROM public.stores LIMIT 1");
    console.log("Stores:", stores.rows);

    const products = await client.query("SELECT count(*) FROM public.products");
    console.log("Products Count:", products.rows[0].count);

    const suppliers = await client.query("SELECT count(*) FROM public.suppliers");
    console.log("Suppliers Count:", suppliers.rows[0].count);

    const purchases = await client.query("SELECT count(*) FROM public.purchase_orders");
    console.log("Purchases Count:", purchases.rows[0].count);

    const inventory = await client.query("SELECT count(*) FROM public.inventory");
    console.log("Inventory Count:", inventory.rows[0].count);

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
