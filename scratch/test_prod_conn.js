const { Client } = require('pg');
async function run() {
    const safeUrl = 'postgresql://postgres.lhtibverxjpcvmajzazv:Rohith89012@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres';
    const client = new Client({ connectionString: safeUrl, ssl: { rejectUnauthorized: false } });
    try {
        await client.connect();
        const res = await client.query("SELECT id, final_payable, amount_paid, payment_status, created_at FROM public.purchase_orders ORDER BY created_at DESC LIMIT 5");
        console.log("Connected to PROD! Recent POs:", res.rows);
        await client.end();
    } catch (e) {
        console.error("Failed:", e.message);
    }
}
run();
