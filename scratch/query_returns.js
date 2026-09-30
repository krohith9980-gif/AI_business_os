const { Client } = require('pg');
async function run() {
    const url = 'postgresql://postgres.lhtibverxjpcvmajzazv:Rohith89012@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres';
    const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
    try {
        await client.connect();
        const res = await client.query("SELECT * FROM public.inventory_movements WHERE movement_type = 'customer_return'");
        console.log('Customer Returns count:', res.rows.length);
        if (res.rows.length > 0) {
            console.log(res.rows);
        }
        await client.end();
    } catch (e) {
        console.error(e.message);
    }
}
run();
