import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wtzyngynxxnncgnniyym.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0enluZ3lueHhubmNnbm5peXltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxOTQxOTUsImV4cCI6MjEwMzc3MDE5NX0.vA3CnzohZjpRjoIKZtOF3WSO95RfDCBB6o3Mn3G9sPo';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  console.log('Logging in as STAGING OWNER...');
  const { data: authData, error: loginErr } = await supabase.auth.signInWithPassword({
    email: 'krohith9980@gmail.com',
    password: 'Rohith89@@'
  });
  if (loginErr) throw loginErr;

  const user = authData.user;
  console.log('LOGGED IN USER ID:', user.id);

  const { data: orgMember } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('profile_id', user.id)
    .eq('is_active', true)
    .single();

  console.log('OWNER ORG ID:', orgMember.organization_id);

  const { data: members, error: memError } = await supabase
    .from('organization_members')
    .select(`
      profile_id,
      role,
      is_active,
      profiles ( 
        full_name,
        user_stores ( store_id, is_active, stores ( name ) ) 
      )
    `)
    .eq('organization_id', orgMember.organization_id);

  if (memError) {
     console.error('Query error:', memError);
     return;
  }
  
  console.log('ALL MEMBERS IN ORG:');
  console.log(JSON.stringify(members, null, 2));
}

run().catch(console.error);
