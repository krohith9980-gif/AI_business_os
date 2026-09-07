const { Client } = require('pg');
async function run() {
    const client = new Client('postgresql://postgres:postgres@localhost:54322/postgres');
    await client.connect();
    const res = await client.query("SELECT pg_get_functiondef(p.oid) as def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE p.proname = 'process_sale' AND n.nspname = 'public';");
    console.log(res.rows.map(r => r.def).join('\n\n====================\n\n'));
    await client.end();
}
run().catch(console.error);
