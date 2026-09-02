-- Migration 0032: Worker Registration & Mobile Login Architecture

-- 1. Phone Canonicalization
-- Removes all non-numeric characters.
-- Ensures it starts with '+' and country code. If exactly 10 digits, assumes India (+91).
CREATE OR REPLACE FUNCTION public.canonicalize_phone(p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_clean TEXT;
BEGIN
    -- Strip non-numeric and non-plus characters
    v_clean := regexp_replace(p_phone, '[^\d+]', '', 'g');

    -- Ensure single leading plus
    IF v_clean NOT LIKE '+%' THEN
        -- If exactly 10 digits without plus, assume India (defaulting as per specs)
        IF length(v_clean) = 10 THEN
            v_clean := '+91' || v_clean;
        ELSE
            v_clean := '+' || v_clean;
        END IF;
    END IF;

    -- Final basic sanity check (between 10 and 15 digits roughly)
    IF length(v_clean) < 10 OR length(v_clean) > 16 THEN
        RAISE EXCEPTION 'Invalid phone number format. Must be an international E.164 number.';
    END IF;

    RETURN v_clean;
END;
$$;


-- 2. Worker Invitations Table
CREATE TABLE public.worker_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    phone_number TEXT NOT NULL,
    intended_name TEXT NOT NULL,
    role public.user_role NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CLAIMED', 'CANCELLED', 'EXPIRED')),
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
    claimed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ
);

-- Ensure a phone number can only have one PENDING invite per organization at a time
CREATE UNIQUE INDEX unique_pending_org_phone ON public.worker_invitations (organization_id, phone_number) WHERE status = 'PENDING';

CREATE INDEX idx_worker_invitations_phone ON public.worker_invitations(phone_number);
CREATE INDEX idx_worker_invitations_org ON public.worker_invitations(organization_id);

-- RLS for Worker Invitations
ALTER TABLE public.worker_invitations ENABLE ROW LEVEL SECURITY;

-- Owner can read their org's invitations
CREATE POLICY "Owners can view org invitations" ON public.worker_invitations
FOR SELECT USING (
    public.is_org_owner(organization_id)
);

-- Note: Clients cannot INSERT/UPDATE/DELETE directly. Handled via RPC.

-- 3. invite_worker RPC
CREATE OR REPLACE FUNCTION public.invite_worker(
    p_phone TEXT,
    p_intended_name TEXT,
    p_role public.user_role,
    p_store_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_org_id UUID;
    v_canonical_phone TEXT;
    v_existing_auth_id UUID;
    v_existing_active BOOLEAN;
    v_invite_id UUID;
BEGIN
    -- Validate caller is authenticated
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Validate role
    IF p_role NOT IN ('MANAGER', 'CASHIER') THEN
        RAISE EXCEPTION 'Can only invite MANAGER or CASHIER';
    END IF;

    -- Resolve and validate organization from store
    SELECT organization_id INTO v_org_id FROM public.stores WHERE id = p_store_id;
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Store not found';
    END IF;

    -- Validate caller is OWNER
    IF NOT public.is_org_owner(v_org_id) THEN
        RAISE EXCEPTION 'Only an OWNER can invite workers';
    END IF;

    -- Canonicalize phone
    v_canonical_phone := public.canonicalize_phone(p_phone);

    -- Check if user already exists in auth.users
    SELECT id INTO v_existing_auth_id FROM auth.users WHERE phone = v_canonical_phone;

    IF v_existing_auth_id IS NOT NULL THEN
        -- User exists in Auth. Check if they already belong to this org.
        SELECT is_active INTO v_existing_active
        FROM public.organization_members
        WHERE organization_id = v_org_id AND profile_id = v_existing_auth_id;

        IF FOUND THEN
            IF v_existing_active THEN
                RAISE EXCEPTION 'User is already an active member of this organization';
            ELSE
                -- Reactivate and update role
                UPDATE public.organization_members
                SET is_active = true, role = p_role
                WHERE organization_id = v_org_id AND profile_id = v_existing_auth_id;

                -- Ensure store membership exists and is active
                INSERT INTO public.user_stores (profile_id, store_id, is_active)
                VALUES (v_existing_auth_id, p_store_id, true)
                ON CONFLICT (profile_id, store_id) DO UPDATE SET is_active = true;

                RETURN NULL; -- Re-activated existing user
            END IF;
        ELSE
            -- User exists in auth but not in this org. Directly insert them!
            INSERT INTO public.organization_members (organization_id, profile_id, role, is_active)
            VALUES (v_org_id, v_existing_auth_id, p_role, true);

            INSERT INTO public.user_stores (profile_id, store_id, is_active)
            VALUES (v_existing_auth_id, p_store_id, true);

            RETURN NULL; -- Created membership directly
        END IF;
    END IF;

    -- User does NOT exist in auth.users. Create or update PENDING invitation.
    -- If a pending invite already exists, cancel it first to avoid unique constraint violations
    UPDATE public.worker_invitations
    SET status = 'CANCELLED', cancelled_at = NOW()
    WHERE organization_id = v_org_id AND phone_number = v_canonical_phone AND status = 'PENDING';

    -- Insert new invitation
    INSERT INTO public.worker_invitations (organization_id, store_id, phone_number, intended_name, role, status, created_by)
    VALUES (v_org_id, p_store_id, v_canonical_phone, p_intended_name, p_role, 'PENDING', auth.uid())
    RETURNING id INTO v_invite_id;

    RETURN v_invite_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.invite_worker(TEXT, TEXT, public.user_role, UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.invite_worker(TEXT, TEXT, public.user_role, UUID) TO authenticated;


-- 4. claim_worker_invitations RPC
CREATE OR REPLACE FUNCTION public.claim_worker_invitations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_phone TEXT;
    v_inv RECORD;
    v_claims_processed INTEGER := 0;
BEGIN
    -- Validate caller
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Get verified phone directly from Supabase Auth
    SELECT phone INTO v_phone FROM auth.users WHERE id = auth.uid();
    IF v_phone IS NULL THEN
        RAISE EXCEPTION 'No verified phone number associated with this account';
    END IF;

    v_phone := public.canonicalize_phone(v_phone);

    -- Find and claim all PENDING invitations for this phone across all organizations
    -- Use FOR UPDATE to prevent concurrent claiming race conditions
    FOR v_inv IN
        SELECT * FROM public.worker_invitations
        WHERE phone_number = v_phone
          AND status = 'PENDING'
          AND expires_at > NOW()
        FOR UPDATE SKIP LOCKED
    LOOP
        -- 1. Insert/Update Organization Membership
        -- Using ON CONFLICT to handle edge cases where they were added manually
        INSERT INTO public.organization_members (organization_id, profile_id, role, is_active)
        VALUES (v_inv.organization_id, auth.uid(), v_inv.role, true)
        ON CONFLICT (organization_id, profile_id)
        DO UPDATE SET is_active = true, role = EXCLUDED.role;

        -- 2. Insert/Update Store Membership
        INSERT INTO public.user_stores (profile_id, store_id, is_active)
        VALUES (auth.uid(), v_inv.store_id, true)
        ON CONFLICT (profile_id, store_id)
        DO UPDATE SET is_active = true;

        -- 3. Mark Invitation Claimed
        UPDATE public.worker_invitations
        SET status = 'CLAIMED', claimed_at = NOW()
        WHERE id = v_inv.id;

        -- If user's profile name is still default 'New User' or they are fresh, update their name
        -- Note: profiles row should exist via on_auth_user_created trigger
        UPDATE public.profiles
        SET full_name = v_inv.intended_name
        WHERE id = auth.uid() AND full_name IN ('New User', '', NULL);

        v_claims_processed := v_claims_processed + 1;
    END LOOP;

    RETURN v_claims_processed;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_worker_invitations() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.claim_worker_invitations() TO authenticated;


-- 5. revoke_worker RPC
CREATE OR REPLACE FUNCTION public.revoke_worker(
    p_profile_id UUID,
    p_org_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Validate caller
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Prevent self-revocation
    IF auth.uid() = p_profile_id THEN
        RAISE EXCEPTION 'Cannot revoke yourself';
    END IF;

    -- Validate caller is OWNER of the target organization
    IF NOT public.is_org_owner(p_org_id) THEN
        RAISE EXCEPTION 'Only an OWNER can revoke workers from this organization';
    END IF;

    -- Ensure target is actually in this org (prevent cross-tenant mutation attacks)
    IF NOT EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = p_org_id AND profile_id = p_profile_id) THEN
        RAISE EXCEPTION 'User is not a member of this organization';
    END IF;

    -- Deactivate org membership
    UPDATE public.organization_members
    SET is_active = false
    WHERE organization_id = p_org_id AND profile_id = p_profile_id;

    -- Deactivate all store memberships for this org
    UPDATE public.user_stores us
    SET is_active = false
    FROM public.stores s
    WHERE us.store_id = s.id
      AND s.organization_id = p_org_id
      AND us.profile_id = p_profile_id;

    -- Also cancel any PENDING invitations they might have had for this org just in case
    UPDATE public.worker_invitations
    SET status = 'CANCELLED', cancelled_at = NOW()
    WHERE organization_id = p_org_id
      AND status = 'PENDING'
      AND phone_number = (SELECT phone FROM auth.users WHERE id = p_profile_id);

END;
$$;

REVOKE EXECUTE ON FUNCTION public.revoke_worker(UUID, UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.revoke_worker(UUID, UUID) TO authenticated;
