import pg from 'pg';
const DB_URL = 'postgresql://postgres.wtzyngynxxnncgnniyym:Rohith89012@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres';
const pool = new pg.Pool({ connectionString: DB_URL });
async function run() {
  const { rows: stores } = await pool.query("SELECT s.id, s.organization_id FROM stores s JOIN user_stores us ON us.store_id = s.id WHERE s.is_active = true LIMIT 1");
  const storeId = stores[0].id;
  const orgId = stores[0].organization_id;
  
  const { rows: variants } = await pool.query("SELECT id FROM product_variants LIMIT 5");
  for (let v of variants) {
    try {
      await pool.query("INSERT INTO inventory_balances (store_id, organization_id, variant_id, on_hand_stock) VALUES (, , , 100)", [storeId, orgId, v.id]);
    } catch(e) {
      await pool.query("UPDATE inventory_balances SET on_hand_stock = 100 WHERE store_id =  AND variant_id = ", [storeId, v.id]);
    }
  }
  pool.end();
}
run();
