SET session_replication_role = replica;
UPDATE public.organization_members SET role = 'OWNER' WHERE profile_id = (SELECT id FROM auth.users WHERE email = 'krohith9980@gmail.com');
SET session_replication_role = DEFAULT;
