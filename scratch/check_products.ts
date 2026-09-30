import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://lhtibverxjpcvmajzazv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxodGlidmVyeGpwY3ZtYWp6YXp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MjgxMTgsImV4cCI6MjEwMjMwNDExOH0.N_DwZogAi_wqfmZdjlFBeeV59fMkv46n2PoqJNoHOvM'
);

async function checkProducts() {
  const { data, error } = await supabase
    .from('product_variants')
    .select('id, unit_of_measure, packaging_type, units_per_pack, item_size, attributes, product:products!inner(name)')
    .like('product.name', '%JUMP%');
    
  if (error) console.error(error);
  else console.log(JSON.stringify(data, null, 2));

  const { data: d2 } = await supabase
    .from('product_variants')
    .select('id, unit_of_measure, packaging_type, units_per_pack, item_size, attributes, product:products!inner(name)')
    .like('product.name', '%SEMAX%');
  
  console.log(JSON.stringify(d2, null, 2));
}

checkProducts();
