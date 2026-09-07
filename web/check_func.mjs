import { createClient } from '@supabase/supabase-js';
import * as e2e from './e2e_guard.mjs';

const adminSupabase = createClient(e2e.SUPABASE_URL, e2e.SUPABASE_KEY);

async function check() {
  const { data, error } = await adminSupabase.rpc('get_function_def', { func_name: 'create_product_with_opening_stock' });
  if (error) {
     // fallback to raw query
     const res = await adminSupabase.from('pg_proc').select('*').eq('proname', 'create_product_with_opening_stock');
     console.log(res);
  }
}
check();
