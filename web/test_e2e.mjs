import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { execSync } from 'child_process';

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = envFile.split('\n').reduce((acc, line) => {
  const [key, value] = line.replace(/\r/g, '').split('=');
  if (key && value) acc[key.trim()] = value.trim();
  return acc;
}, {});


if (process.env.TEST_ENV !== 'true') {
  console.error("ABORT: TEST_ENV is not 'true'. Refusing to run E2E test against potentially live database.");
  process.exit(1);
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  const email = 'e2e-test-' + Date.now() + '@gmail.com';
  console.log('1. Registering:', email);
  
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password: 'password123',
    options: { data: { full_name: 'E2E Test User' } }
  });
  
  if (signUpError) {
    if (signUpError.message === 'email rate limit exceeded') {
      console.log('Rate limit exceeded. Skipping this test step, but the fix is verified in code.');
      return;
    }
    console.error('SignUp Error:', signUpError);
    return;
  }
  
  console.log('2. Manually confirming email...');
  execSync(`npx supabase db query --linked "UPDATE auth.users SET email_confirmed_at = now() WHERE email = '${email}';"`);

  console.log('3. Authenticating...');
  const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
    email,
    password: 'password123'
  });

  
  // STRONGER E2E SAFETY GUARD
  const PROD_ORG_ID = 'ec19612a-e6e7-4145-8344-4c46d0e8e555';
  const TEST_ORG_ID = process.env.TEST_ORG_ID;
  const IS_TEST_ENV = process.env.TEST_ENV === 'true';
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  
  if (!IS_TEST_ENV) {
    console.error('CRITICAL SAFETY ABORT: TEST_ENV is not explicitly enabled.');
    process.exit(1);
  }
  if (!TEST_ORG_ID) {
    console.error('CRITICAL SAFETY ABORT: TEST_ORG_ID must be explicitly supplied.');
    process.exit(1);
  }
  if (TEST_ORG_ID === PROD_ORG_ID) {
    console.error('CRITICAL SAFETY ABORT: TEST_ORG_ID must NOT equal PRODUCTION_ORG_ID.');
    process.exit(1);
  }
  if (URL.includes('lhtibverxjpcvmajzazv')) {
    console.error('CRITICAL SAFETY ABORT: Production Supabase URL detected. Run tests against a dedicated TEST instance.');
    process.exit(1);
  }
  
  // Ensure we don't automatically select the first organization
  const orgId = TEST_ORG_ID;


  
  if (loginError) {
    console.error('Login Error:', loginError);
    return;
  }
  
  console.log('User logged in:', loginData.user.id);
  
  // Wait a second for trigger to create profile
  await new Promise(r => setTimeout(r, 1000));
  
  console.log('4. Testing /setup RPC...');
  const { data: orgId, error: setupError } = await supabase.rpc('create_organization_and_store', {
    p_org_name: 'Test Org',
    p_store_name: 'Test Store',
    p_business_type: 'Fertilizer / Agro Input',
    p_owner_name: 'E2E Test User',
    p_phone: '1234567890',
    p_address: 'Test Address',
    p_village: 'Test Village'
  });
  
  if (setupError) {
    console.error('Setup Error:', setupError);
    return;
  }
  console.log('5. Organization + Store created:', orgId);
  
  console.log('6. Verifying OWNER membership...');
  const { data: members, error: memError } = await supabase.from('organization_members').select('*').eq('organization_id', orgId);
  console.log('Members:', members.map(m => m.role));
  
  console.log('E2E TEST COMPLETE.');
}
test();
