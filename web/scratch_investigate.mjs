import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' }); // Use .env.local for staging

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function investigate() {
  console.log("=== RECENT PRODUCTS ===");
  const { data: products } = await supabase
    .from('products')
    .select('id, name, created_at, is_active')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log(products);

  console.log("\n=== RECENT VARIANTS ===");
  const { data: variants } = await supabase
    .from('product_variants')
    .select('id, product_id, sku, purchase_cost, selling_price, created_at')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log(variants);

  console.log("\n=== RECENT PURCHASES ===");
  const { data: purchases } = await supabase
    .from('purchase_orders')
    .select('id, status, store_id, organization_id, created_at, idempotency_key')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log(purchases);

  if (purchases && purchases.length > 0) {
    console.log("\n=== PO ITEMS FOR LATEST PURCHASE ===");
    const { data: poItems } = await supabase
      .from('po_items')
      .select('id, po_id, variant_id, quantity_ordered, quantity_received, purchase_cost')
      .eq('po_id', purchases[0].id);
    console.log(poItems);
  }
}

investigate().catch(console.error);
