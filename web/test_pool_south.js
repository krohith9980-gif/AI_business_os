const { Client } = require('pg');
async function run() {
    const poolerUrl = 'postgresql://postgres:Rohith89012@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?options=reference%3Dlhtibverxjpcvmajzazv';
    const client = new Client({ connectionString: poolerUrl, ssl: { rejectUnauthorized: false } });
    try {
        await client.connect();
        const res = await client.query("SELECT count(*) FROM public.product_variants");
        console.log("Connected to PROD via ap-south-1 pooler! Count:", res.rows[0].count);
        await client.end();
    } catch (e) {
        console.error("Failed:", e.message);
    }
}
run();
