const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres:Rohith89012@db.wtzyngynxxnncgnniyym.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("=== LATEST PRODUCTS ===");
    const productsRes = await client.query(`
      SELECT id, name, created_at 
      FROM public.products 
      ORDER BY created_at DESC LIMIT 5
    `);
    console.table(productsRes.rows);

    console.log("\n=== LATEST VARIANTS ===");
    const variantsRes = await client.query(`
      SELECT id, product_id, sku, purchase_cost, selling_price, created_at 
      FROM public.product_variants 
      ORDER BY created_at DESC LIMIT 5
    `);
    console.table(variantsRes.rows);

    console.log("\n=== LATEST PURCHASE ORDERS ===");
    const poRes = await client.query(`
      SELECT id, store_id, supplier_id, organization_id, status, created_at, idempotency_key 
      FROM public.purchase_orders 
      ORDER BY created_at DESC LIMIT 5
    `);
    console.table(poRes.rows);

    if (poRes.rows.length > 0) {
      console.log("\n=== PO ITEMS FOR LATEST PO ===");
      const poId = poRes.rows[0].id;
      const poItemsRes = await client.query(`
        SELECT id, variant_id, quantity_ordered, quantity_received, purchase_cost 
        FROM public.po_items 
        WHERE po_id = $1
      `, [poId]);
      console.table(poItemsRes.rows);

      console.log("\n=== LATEST PURCHASE RECEIPTS ===");
      const prRes = await client.query(`
        SELECT id, po_id, status, received_at 
        FROM public.purchase_receipts 
        WHERE po_id = $1
      `, [poId]);
      console.table(prRes.rows);

      if (prRes.rows.length > 0) {
        console.log("\n=== RECEIPT ITEMS ===");
        const priRes = await client.query(`
          SELECT id, receipt_id, po_item_id, quantity_received 
          FROM public.purchase_receipt_items 
          WHERE receipt_id = $1
        `, [prRes.rows[0].id]);
        console.table(priRes.rows);
      }
    }

    console.log("\n=== LATEST INVENTORY MOVEMENTS ===");
    const invRes = await client.query(`
      SELECT id, variant_id, store_id, movement_type, quantity, reference_id, created_at 
      FROM public.inventory_movements 
      ORDER BY created_at DESC LIMIT 5
    `);
    console.table(invRes.rows);

    console.log("\n=== LATEST VARIANT PRICE HISTORY ===");
    const historyRes = await client.query(`
      SELECT id, variant_id, purchase_cost, selling_price, effective_date 
      FROM public.variant_price_history 
      ORDER BY effective_date DESC LIMIT 5
    `);
    console.table(historyRes.rows);

  } catch (e) {
    console.error("ERROR:", e.message);
  } finally {
    await client.end();
  }
}

run();
