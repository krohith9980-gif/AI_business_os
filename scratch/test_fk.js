const { Client } = require('pg');
async function run() {
    const safeUrl = 'postgresql://postgres.lhtibverxjpcvmajzazv:Rohith89012@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres';
    const client = new Client({ connectionString: safeUrl, ssl: { rejectUnauthorized: false } });
    try {
        await client.connect();
        const res = await client.query(`
SELECT
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name='sale_items';
        `);
        console.table(res.rows);
        await client.end();
    } catch (e) {
        console.error("Failed:", e.message);
    }
}
run();
