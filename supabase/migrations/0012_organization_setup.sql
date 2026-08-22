-- Migration 0012: Production Organization Setup

-- Add new columns to organizations table to support onboarding fields
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS business_type TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS village TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT;

-- Create atomic RPC for Organization + Owner Membership + First Store creation
CREATE OR REPLACE FUNCTION public.create_organization_and_store(
    p_org_name TEXT,
    p_store_name TEXT,
    p_business_type TEXT,
    p_owner_name TEXT,
    p_phone TEXT,
    p_address TEXT,
    p_village TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_org_id UUID;
    v_store_id UUID;
BEGIN
    -- 1. Validate Authentication
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- 2. Verify Profile exists
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id) THEN
        RAISE EXCEPTION 'User profile not found';
    END IF;

    -- 3. Verify User doesn't already have an active membership
    -- This enforces a single organization per user in the MVP phase
    IF EXISTS (
        SELECT 1 
        FROM public.organization_members 
        WHERE profile_id = v_user_id AND is_active = true
    ) THEN
        RAISE EXCEPTION 'User already belongs to an active organization';
    END IF;

    -- 4. Create Organization
    INSERT INTO public.organizations (name, business_type, phone, address, village)
    VALUES (trim(p_org_name), trim(p_business_type), trim(p_phone), trim(p_address), trim(p_village))
    RETURNING id INTO v_org_id;

    -- 5. Create Owner Membership
    -- Using session_replication_role bypasses prevent_unauthorized_role_escalation trigger during initial setup
    -- because the user is not YET an owner.
    -- Wait, we can't SET session_replication_role from a SECURITY DEFINER function safely without SUPERUSER.
    -- Alternatively, the trigger prevent_unauthorized_role_escalation should allow OWNER assignment if the 
    -- organization is brand new (i.e., has no members yet).
    -- Let's update the trigger to allow the FIRST owner to be added without checking for existing ownership.
    
    INSERT INTO public.organization_members (organization_id, profile_id, role, is_active)
    VALUES (v_org_id, v_user_id, 'OWNER', true);

    -- 6. Create First Store
    INSERT INTO public.stores (organization_id, name, location, is_active)
    VALUES (v_org_id, trim(p_store_name), trim(p_address), true)
    RETURNING id INTO v_store_id;
    
    -- 7. Add user to user_stores for POS access
    INSERT INTO public.user_stores (profile_id, store_id, is_active)
    VALUES (v_user_id, v_store_id, true);

    RETURN v_org_id;
END;
$$;

-- Update the role escalation trigger to allow the FIRST owner
CREATE OR REPLACE FUNCTION public.prevent_unauthorized_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_member_count INT;
BEGIN
    -- Only check if assigning OWNER or MANAGER
    IF NEW.role IN ('OWNER', 'MANAGER') THEN
        -- Check if this is the very first member of the organization
        SELECT COUNT(*) INTO v_member_count 
        FROM public.organization_members 
        WHERE organization_id = NEW.organization_id;

        -- If it's NOT the first member, the caller must be an OWNER
        IF v_member_count > 0 THEN
            IF NOT public.is_org_owner(NEW.organization_id) THEN
                RAISE EXCEPTION 'Unauthorized: Only an OWNER can assign OWNER or MANAGER roles';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_organization_and_store(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_organization_and_store(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
