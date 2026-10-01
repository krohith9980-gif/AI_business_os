const { Client } = require('pg');
async function run() {
    const directUrl = 'postgresql://postgres:Rohith89012@db.lhtibverxjpcvmajzazv.supabase.co:5432/postgres';
    const client = new Client({ connectionString: directUrl, ssl: { rejectUnauthorized: false } });
    try {
        await client.connect();
        const res = await client.query("SELECT count(*) FROM public.product_variants");
        console.log("Connected to PROD via direct URL! Count:", res.rows[0].count);
        await client.end();
    } catch (e) {
        console.error("Failed direct:", e.message);
    }
}
run();
