import { createClient } from '@supabase/supabase-js';
import * as e2e from './e2e_guard.mjs';

  const supabase = createClient(e2e.SUPABASE_URL, e2e.SUPABASE_KEY);

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
