const { Client } = require('pg');
async function run() {
    const urls = [
        'postgresql://postgres.lhtibverxjpcvmajzazv:Rohith89@@@aws-0-ap-south-1.pooler.supabase.com:5432/postgres',
        'postgresql://postgres.lhtibverxjpcvmajzazv:Rohith89@@@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres',
        'postgresql://postgres:Rohith89@@@db.lhtibverxjpcvmajzazv.supabase.co:5432/postgres'
    ];
    for (const url of urls) {
        console.log("Trying", url);
        const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
        try {
            await client.connect();
            const res = await client.query("SELECT p.proname, pg_get_function_arguments(p.oid) as args, pg_get_functiondef(p.oid) as def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'process_sale'");
            console.log("SUCCESS!", JSON.stringify(res.rows));
            await client.end();
            return;
        } catch (e) {
            console.error("Failed:", e.message);
        }
    }
}
run();
