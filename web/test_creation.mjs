import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://lhtibverxjpcvmajzazv.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxodGlidmVyeGpwY3ZtYWp6YXp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MjgxMTgsImV4cCI6MjEwMjMwNDExOH0.N_DwZogAi_wqfmZdjlFBeeV59fMkv46n2PoqJNoHOvM');

async function checkRows() {
  console.log("Checking products...");
  const { data: pData, error: pErr } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(3);
  console.log('Products:', pData, pErr);

  console.log("Checking variants...");
  const { data: vData, error: vErr } = await supabase
    .from('product_variants')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(3);
  console.log('Variants:', vData, vErr);
}

checkRows();
