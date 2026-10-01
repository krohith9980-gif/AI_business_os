const { Client } = require('pg'); 
async function run() { 
  const client = new Client({ 
    connectionString: 'postgresql://postgres:Rohith89%40%40@db.lhtibverxjpcvmajzazv.supabase.co:5432/postgres', 
    ssl: { rejectUnauthorized: false } 
  }); 
  try { 
    await client.connect(); 
    const res = await client.query("SELECT id, email, email_confirmed_at, banned_until, last_sign_in_at FROM auth.users WHERE email = 'krohith56789@gmail.com'"); 
    console.log('USER:', res.rows[0]); 
    if(res.rows.length > 0) { 
      const profileRes = await client.query("SELECT p.id, p.full_name, p.role, om.is_active, o.name as org_name FROM profiles p LEFT JOIN organization_members om ON p.id = om.profile_id LEFT JOIN organizations o ON om.organization_id = o.id WHERE p.id = $1", [res.rows[0].id]); 
      console.log('PROFILE & ORG:', profileRes.rows); 
    } 
  } catch (e) { 
    console.error(e.message); 
  } finally { 
    await client.end(); 
  } 
} 
run();
