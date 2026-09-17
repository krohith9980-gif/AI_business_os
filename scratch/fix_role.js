const {Client}=require('pg');
const c=new Client({
  connectionString:'postgresql://postgres:Rohith89012@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?options=reference%3Dwtzyngynxxnncgnniyym',
  ssl:{rejectUnauthorized:false}
});
c.connect().then(()=>c.query("UPDATE public.organization_members SET role='OWNER' WHERE profile_id='d9e8951d-b5f7-4b2f-ab9e-8966acbf5ab1'"))
.then(res => { console.log(res.rowCount); return c.end(); })
.catch(console.error);
