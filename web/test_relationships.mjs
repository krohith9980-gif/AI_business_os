import { createClient } from '@supabase/supabase-js';
import * as e2e from './e2e_guard.mjs';

  const supabase = createClient(e2e.SUPABASE_URL, e2e.SUPABASE_KEY);

async function test1() {
  console.log("--- TEST 1: product:products!inner ---");
  const { data, error } = await supabase
    .from('product_variants')
    .select(`
      id,
      sku,
      product:products!inner (id, name)
    `)
    .limit(1);
  console.log('Error:', error);
}

async function test2() {
  console.log("--- TEST 2: product:products!inner ---");
  const { data, error } = await supabase
    .from('product_variants')
    .select(`
      id,
      sku,
      product:products!inner (id, name)
    `)
    .limit(1);
  console.log('Error:', error);
}

async function run() {
    await test1();
    await test2();
}

run();
