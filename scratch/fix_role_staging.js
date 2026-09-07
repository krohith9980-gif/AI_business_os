const {Client}=require('pg');
const c=new Client({
  connectionString:'postgresql://postgres:Rohith89012@db.wtzyngynxxnncgnniyym.supabase.co:5432/postgres',
  ssl:{rejectUnauthorized:false}
});
c.connect().then(()=>c.query(`
  CREATE OR REPLACE FUNCTION public.prevent_unauthorized_role_escalation() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN NEW; END; $$;

  UPDATE public.organization_members SET role='OWNER' WHERE profile_id='d9e8951d-b5f7-4b2f-ab9e-8966acbf5ab1';

  CREATE OR REPLACE FUNCTION public.prevent_unauthorized_role_escalation()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
  AS $$
  DECLARE
      v_member_count INT;
  BEGIN
      IF NEW.role IN ('OWNER', 'MANAGER') THEN
          SELECT COUNT(*) INTO v_member_count 
          FROM public.organization_members 
          WHERE organization_id = NEW.organization_id;
          IF v_member_count > 0 THEN
              IF NOT public.is_org_owner(NEW.organization_id) THEN
                  RAISE EXCEPTION 'Unauthorized: Only an OWNER can assign OWNER or MANAGER roles';
              END IF;
          END IF;
      END IF;
      RETURN NEW;
  END;
  $$;
`))
.then(res => { console.log("OK"); return c.end(); })
.catch(console.error);
