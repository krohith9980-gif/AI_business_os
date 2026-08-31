import { createClient } from '@supabase/supabase-js';


  // STRONGER E2E SAFETY GUARD
  const PROD_ORG_ID_G = 'ec19612a-e6e7-4145-8344-4c46d0e8e555';
  const TEST_ORG_ID_G = process.env.TEST_ORG_ID;
  const IS_TEST_ENV_G = process.env.TEST_ENV === 'true';
  const URL_G = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  if (!IS_TEST_ENV_G) { console.error('CRITICAL SAFETY ABORT: TEST_ENV is not explicitly enabled.'); process.exit(1); }
  if (!TEST_ORG_ID_G) { console.error('CRITICAL SAFETY ABORT: TEST_ORG_ID must be explicitly supplied.'); process.exit(1); }
  if (TEST_ORG_ID_G === PROD_ORG_ID_G) { console.error('CRITICAL SAFETY ABORT: TEST_ORG_ID must NOT equal PRODUCTION_ORG_ID.'); process.exit(1); }
  if (URL_G.includes('lhtibverxjpcvmajzazv')) { console.error('CRITICAL SAFETY ABORT: Production Supabase URL detected.'); process.exit(1); }

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
