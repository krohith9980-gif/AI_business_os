import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = envFile.split('\n').reduce((acc, line) => {
  const [key, value] = line.replace(/\r/g, '').split('=');
  if (key && value) acc[key.trim()] = value.trim();
  return acc;
}, {});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  const email = 'fake-valid-' + Date.now() + '@gmail.com';
  console.log('Signing up:', email);
  const { data, error } = await supabase.auth.signUp({ email, password: 'password123' });
  console.log('SignUp Data:', JSON.stringify(data, null, 2));
  console.log('SignUp Error:', error?.message);
}
test();
