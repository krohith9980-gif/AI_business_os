import pg from 'pg';
const DB_URL = 'postgresql://postgres.wtzyngynxxnncgnniyym:Rohith89012@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres';
const pool = new pg.Pool({ connectionString: DB_URL });
async function run() {
  const { rows: stores } = await pool.query("SELECT s.id, s.organization_id FROM stores s JOIN user_stores us ON us.store_id = s.id WHERE s.is_active = true LIMIT 1");
  const storeId = stores[0].id;
  const orgId = stores[0].organization_id;
  console.log('Store:', storeId, 'Org:', orgId);
  const { rows: p } = await pool.query("INSERT INTO products (organization_id, name, description) VALUES (, 'Test Product', 'Test') RETURNING id", [orgId]);
  const pId = p[0].id;
  const { rows: v1 } = await pool.query("INSERT INTO product_variants (product_id, sku, selling_price) VALUES (, 'TEST-SKU-1', 100) RETURNING id", [pId]);
  const { rows: v2 } = await pool.query("INSERT INTO product_variants (product_id, sku, selling_price, packaging_type, units_per_pack) VALUES (, 'TEST-SKU-2', 500, 'BOX', 10) RETURNING id", [pId]);
  await pool.query("INSERT INTO inventory_balances (store_id, organization_id, variant_id, on_hand_stock) VALUES (, , , 100)", [storeId, orgId, v1[0].id]);
  await pool.query("INSERT INTO inventory_balances (store_id, organization_id, variant_id, on_hand_stock) VALUES (, , , 100)", [storeId, orgId, v2[0].id]);
  console.log('Inserted test data');
  pool.end();
}
run();
