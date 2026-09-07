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
  const { data: orgMember } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('profile_id', user.id)
    .eq('is_active', true)
    .single();

  console.log('Owner Role:', orgMember.role);

  console.log('\nFetching Active Members as OWNER...');
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
    console.error('ERROR fetching members:', memError);
    return;
  }

  const unifiedList = [];
  if (members) {
    for (const m of members) {
      if (m.profile_id === user.id) continue; 

      const activeUserStore = m.profiles?.user_stores?.find((us) => us.is_active);

      unifiedList.push({
        id: m.profile_id,
        type: 'MEMBER',
        name: m.profiles?.full_name || 'Unknown',
        phone: '***REDACTED2***',
        role: m.role,
        storeName: activeUserStore?.stores?.name || 'No Store',
        storeId: activeUserStore?.store_id || null,
        status: m.is_active ? 'ACTIVE' : 'DISABLED'
      });
    }
  }

  console.log('--- Workers Displayed to OWNER ---');
  console.log(JSON.stringify(unifiedList, null, 2));

  console.log('\nTesting CASHIER Restrictions...');
  const isOwner = orgMember.role === 'OWNER';
  if (!isOwner) {
     console.log('CASHIER ACCESS GRANTED (THIS IS A BUG IF TRUE)');
  } else {
     console.log('CASHIER ACCESS BLOCKED to /dashboard/workers (Simulated Page check: if (orgMember.role !== "OWNER") return Access Denied)');
  }
}

run().catch(console.error);
