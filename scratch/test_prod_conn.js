const { Client } = require('pg');
async function run() {
    const safeUrl = 'postgresql://postgres.lhtibverxjpcvmajzazv:Rohith89012@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres';
    const client = new Client({ connectionString: safeUrl, ssl: { rejectUnauthorized: false } });
    try {
        await client.connect();
        const res = await client.query("SELECT count(*) FROM public.product_variants");
        console.log("Connected to PROD! Count:", res.rows[0].count);
        await client.end();
    } catch (e) {
        console.error("Failed:", e.message);
    }
}
run();
