const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://lhtibverxjpcvmajzazv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxodGlidmVyeGpwY3ZtYWp6YXp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MjgxMTgsImV4cCI6MjEwMjMwNDExOH0.N_DwZogAi_wqfmZdjlFBeeV59fMkv46n2PoqJNoHOvM'
);

async function test() {
  console.log("Fetching stores...");
  const { data: stores, error: storeError } = await supabase.from('stores').select('id, name');
  if (storeError) {
      console.error(storeError);
      return;
  }
  
  const storeIds = stores.map(s => s.id);
  console.log("Store IDs:", storeIds);

  console.log("Fetching inventory...");
  const { data: invData, error } = await supabase
    .from('vw_batch_inventory')
    .select('store_id, variant_id, batch_number, mfg_date, expiry_date, available_stock')
    .in('store_id', storeIds);

  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Inventory Rows:", invData.length);
    console.log("First inventory example:", invData[0]);
    console.log("Type of available_stock:", typeof invData[0]?.available_stock);
  }
  
  console.log("Fetching products...");
  const { data: prodData } = await supabase
      .from('product_variants')
      .select('id, product_id, sku, product:products!inner (id, name, description)')
      .limit(2);
      
  console.log("First product example:", prodData[0]);
}

test();
