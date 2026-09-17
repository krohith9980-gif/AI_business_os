import { createClient } from '@supabase/supabase-js';
import * as e2e from './e2e_guard.mjs';

  const supabase = createClient(e2e.SUPABASE_URL, e2e.SUPABASE_KEY);

async function test() {
  const email = 'fake-valid-' + Date.now() + '@gmail.com';
  console.log('Signing up:', email);
  const { data, error } = await supabase.auth.signUp({ email, password: 'password123' });
  console.log('SignUp Data:', JSON.stringify(data, null, 2));
  console.log('SignUp Error:', error?.message);
}
test();
