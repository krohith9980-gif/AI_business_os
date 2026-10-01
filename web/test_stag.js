const { Client } = require('pg');
async function run() {
    const url = 'postgresql://postgres.wtzyngynxxnncgnniyym:Rohith89012@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres';
    const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
    try {
        await client.connect();
        const res = await client.query("SELECT p.proname, pg_get_function_arguments(p.oid) as args FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'process_sale'");
        console.log("Staging sign:", JSON.stringify(res.rows));
        await client.end();
    } catch (e) {
        console.error("Failed:", e.message);
    }
}
run();
