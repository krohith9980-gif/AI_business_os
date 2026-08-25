import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://lhtibverxjpcvmajzazv.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxodGlidmVyeGpwY3ZtYWp6YXp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MjgxMTgsImV4cCI6MjEwMjMwNDExOH0.N_DwZogAi_wqfmZdjlFBeeV59fMkv46n2PoqJNoHOvM');

async function test1() {
  console.log("--- TEST 1: product:product_id!inner ---");
  const { data, error } = await supabase
    .from('product_variants')
    .select(`
      id,
      sku,
      product:product_id!inner (id, name)
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
