const { Client } = require('pg');

async function run() {
    const url = 'postgresql://postgres:Rohith89012@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?options=reference%3Dwtzyngynxxnncgnniyym';
    const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
    
    try {
        await client.connect();
        const res = await client.query(`
            SELECT version 
            FROM supabase_migrations.schema_migrations 
            WHERE version IN ('0033', '0034', '0035', '0036') 
               OR version IN ('20260903003300', '20260903003400') -- just in case
               OR version LIKE '003%'
            ORDER BY version DESC
        `);
        console.table(res.rows);
    } catch (e) {
        console.error(e.message);
    } finally {
        await client.end();
    }
}
run();
