-- Migration 0001: Core Setup (Auth, Orgs, Stores, Roles)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE user_role AS ENUM ('OWNER', 'MANAGER', 'CASHIER');

-- 1. Profiles (Automatically created from auth.users)
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL DEFAULT 'New User',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reusable updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.on_auth_user_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'));
    RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.on_auth_user_created();


-- 2. Organizations
CREATE TABLE public.organizations (
    id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Organization Members
CREATE TABLE public.organization_members (
    id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    role user_role NOT NULL DEFAULT 'CASHIER',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, profile_id)
);
CREATE TRIGGER set_org_members_updated_at BEFORE UPDATE ON public.organization_members FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_organization_members_profile_id ON public.organization_members(profile_id);
CREATE INDEX idx_organization_members_org_id ON public.organization_members(organization_id);

-- Prevent changing organization_id or profile_id on existing members to avoid role escalation bypasses
CREATE OR REPLACE FUNCTION public.prevent_org_member_identity_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.organization_id != NEW.organization_id OR OLD.profile_id != NEW.profile_id THEN
        RAISE EXCEPTION 'Cannot change organization_id or profile_id of an existing membership';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_org_member_identity BEFORE UPDATE ON public.organization_members FOR EACH ROW EXECUTE FUNCTION public.prevent_org_member_identity_change();

-- 4. Stores
CREATE TABLE public.stores (
    id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    location TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_stores_updated_at BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_stores_org_id ON public.stores(organization_id);

-- 5. User Stores (Mapping for Cashier scope)
CREATE TABLE public.user_stores (
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (profile_id, store_id)
);
CREATE INDEX idx_user_stores_profile_id ON public.user_stores(profile_id);


-- Secure Helper Functions for RLS (Authoritative lookup)
CREATE OR REPLACE FUNCTION public.is_org_member(org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.organization_members
        WHERE organization_id = org_id
          AND profile_id = auth.uid()
          AND is_active = true
    );
$$;

CREATE OR REPLACE FUNCTION public.is_org_owner(org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.organization_members
        WHERE organization_id = org_id
          AND profile_id = auth.uid()
          AND role = 'OWNER'
          AND is_active = true
    );
$$;

CREATE OR REPLACE FUNCTION public.is_org_manager_or_owner(org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.organization_members
        WHERE organization_id = org_id
          AND profile_id = auth.uid()
          AND role IN ('OWNER', 'MANAGER')
          AND is_active = true
    );
$$;

CREATE OR REPLACE FUNCTION public.is_store_member(target_store_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_stores
        WHERE store_id = target_store_id
          AND profile_id = auth.uid()
          AND is_active = true
    );
$$;

-- Revoke default execute and grant only to authenticated users
REVOKE EXECUTE ON FUNCTION public.is_org_member(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_org_member(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_org_owner(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_org_owner(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_org_manager_or_owner(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_org_manager_or_owner(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_store_member(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_store_member(UUID) TO authenticated;
