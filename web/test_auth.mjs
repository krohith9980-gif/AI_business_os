import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = envFile.split('\n').reduce((acc, line) => {
  const [key, value] = line.replace(/\r/g, '').split('=');
  if (key && value) acc[key.trim()] = value.trim();
  return acc;
}, {});


  // STRONGER E2E SAFETY GUARD
  const PROD_ORG_ID_G = 'ec19612a-e6e7-4145-8344-4c46d0e8e555';
  const TEST_ORG_ID_G = process.env.TEST_ORG_ID;
  const IS_TEST_ENV_G = process.env.TEST_ENV === 'true';
  const URL_G = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  if (!IS_TEST_ENV_G) { console.error('CRITICAL SAFETY ABORT: TEST_ENV is not explicitly enabled.'); process.exit(1); }
  if (!TEST_ORG_ID_G) { console.error('CRITICAL SAFETY ABORT: TEST_ORG_ID must be explicitly supplied.'); process.exit(1); }
  if (TEST_ORG_ID_G === PROD_ORG_ID_G) { console.error('CRITICAL SAFETY ABORT: TEST_ORG_ID must NOT equal PRODUCTION_ORG_ID.'); process.exit(1); }
  if (URL_G.includes('lhtibverxjpcvmajzazv')) { console.error('CRITICAL SAFETY ABORT: Production Supabase URL detected.'); process.exit(1); }

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  const email = 'fake-valid-' + Date.now() + '@gmail.com';
  console.log('Signing up:', email);
  const { data, error } = await supabase.auth.signUp({ email, password: 'password123' });
  console.log('SignUp Data:', JSON.stringify(data, null, 2));
  console.log('SignUp Error:', error?.message);
}
test();
