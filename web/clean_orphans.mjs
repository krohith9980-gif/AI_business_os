import { createClient } from '@supabase/supabase-js';
import * as e2e from './e2e_guard.mjs';

const supabase = createClient(e2e.SUPABASE_URL, e2e.SUPABASE_KEY);

async function cleanOrphans() {
  console.log('Finding orphaned products (no inventory balance records)...');
  // In Supabase we can find products without balance
  // Since we don't have direct SQL, we fetch products and balances
  
  const { data: products, error: pErr } = await supabase.from('products').select('id, name');
  if (pErr) throw pErr;
  
  const { data: variants, error: vErr } = await supabase.from('product_variants').select('id, product_id, sku');
  if (vErr) throw vErr;
  
  const { data: balances, error: bErr } = await supabase.from('inventory_balances').select('variant_id');
  if (bErr) throw bErr;
  
  const variantIdsWithBalance = new Set(balances.map(b => b.variant_id));
  
  const orphanedVariants = variants.filter(v => !variantIdsWithBalance.has(v.id));
  const orphanedProductIds = new Set(orphanedVariants.map(v => v.product_id));
  
  console.log(`Found ${orphanedProductIds.size} orphaned products.`);
  
  for (const pid of orphanedProductIds) {
      console.log(`Deleting product: ${pid}`);
      // Variants delete cascade, movements and balances don't exist
      await supabase.from('products').delete().eq('id', pid);
  }
  
  // also delete test products
  await supabase.from('products').delete().like('name', '%Test%');
  await supabase.from('products').delete().like('name', 'ATOMIC%');
  
  console.log('Cleanup complete.');
}

cleanOrphans().catch(console.error);
