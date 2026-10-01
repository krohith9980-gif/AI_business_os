-- Migration 0052: Dynamic Agricultural Intelligence Schema

CREATE TYPE geographic_level AS ENUM ('STATE', 'DISTRICT', 'MANDAL', 'LOCAL_CLUSTER');
CREATE TYPE freshness_status AS ENUM ('FRESH', 'AGING', 'STALE', 'CRITICAL', 'UNAVAILABLE');

CREATE TABLE public.agri_intelligence_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    source_type TEXT NOT NULL, -- e.g., 'GOVERNMENT', 'UNIVERSITY', 'IMD'
    base_url TEXT,
    reliability_score NUMERIC CHECK (reliability_score >= 0 AND reliability_score <= 1.0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE TRIGGER set_agri_sources_updated_at BEFORE UPDATE ON public.agri_intelligence_sources FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_agri_sources_org_id ON public.agri_intelligence_sources(organization_id);

CREATE TABLE public.agri_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    source_id UUID NOT NULL REFERENCES public.agri_intelligence_sources(id) ON DELETE RESTRICT,
    observation_date DATE NOT NULL,
    publication_date DATE NOT NULL,
    season TEXT NOT NULL, -- e.g., 'Kharif', 'Rabi', 'Zaid'
    geographic_level geographic_level NOT NULL DEFAULT 'STATE',
    region TEXT NOT NULL, -- e.g., 'Telangana State', 'Khammam District'
    crop_name TEXT NOT NULL,
    crop_stage TEXT NOT NULL, -- e.g., 'Sowing', 'Vegetative', 'Flowering'
    progress_status TEXT NOT NULL, -- e.g., 'EARLY', 'NORMAL', 'DELAYED'
    advisory_notes TEXT,
    observed_text TEXT, -- Traceability excerpt
    source_reference_url TEXT, -- Traceability link
    confidence_score NUMERIC CHECK (confidence_score >= 0 AND confidence_score <= 1.0),
    freshness_status freshness_status NOT NULL DEFAULT 'FRESH',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE TRIGGER set_agri_observations_updated_at BEFORE UPDATE ON public.agri_observations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_agri_observations_org_id ON public.agri_observations(organization_id);
CREATE INDEX idx_agri_observations_region_crop ON public.agri_observations(region, crop_name);

CREATE TABLE public.agri_observation_inputs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    observation_id UUID NOT NULL REFERENCES public.agri_observations(id) ON DELETE CASCADE,
    input_category TEXT NOT NULL, -- e.g., 'Urea', 'DAP', 'Pesticide'
    reasoning TEXT,
    urgency TEXT, -- 'HIGH', 'MEDIUM', 'LOW'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_agri_obs_inputs_obs_id ON public.agri_observation_inputs(observation_id);

-- Row Level Security (RLS)

ALTER TABLE public.agri_intelligence_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agri_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agri_observation_inputs ENABLE ROW LEVEL SECURITY;

-- Read Access: Organization members can read
CREATE POLICY "Org members can view agri sources" ON public.agri_intelligence_sources
    FOR SELECT USING (public.is_org_member(organization_id));

CREATE POLICY "Org members can view agri observations" ON public.agri_observations
    FOR SELECT USING (public.is_org_member(organization_id));

CREATE POLICY "Org members can view agri inputs" ON public.agri_observation_inputs
    FOR SELECT USING (
        observation_id IN (
            SELECT id FROM public.agri_observations 
            WHERE public.is_org_member(organization_id)
        )
    );

-- Write Access: Organization OWNER or MANAGER can write
CREATE POLICY "Org admins can insert agri sources" ON public.agri_intelligence_sources
    FOR INSERT WITH CHECK (public.is_org_manager_or_owner(organization_id));

CREATE POLICY "Org admins can update agri sources" ON public.agri_intelligence_sources
    FOR UPDATE USING (public.is_org_manager_or_owner(organization_id));

CREATE POLICY "Org admins can insert agri observations" ON public.agri_observations
    FOR INSERT WITH CHECK (public.is_org_manager_or_owner(organization_id));

CREATE POLICY "Org admins can update agri observations" ON public.agri_observations
    FOR UPDATE USING (public.is_org_manager_or_owner(organization_id));

CREATE POLICY "Org admins can insert agri inputs" ON public.agri_observation_inputs
    FOR INSERT WITH CHECK (
        observation_id IN (
            SELECT id FROM public.agri_observations 
            WHERE public.is_org_manager_or_owner(organization_id)
        )
    );

CREATE POLICY "Org admins can update agri inputs" ON public.agri_observation_inputs
    FOR UPDATE USING (
        observation_id IN (
            SELECT id FROM public.agri_observations 
            WHERE public.is_org_manager_or_owner(organization_id)
        )
    );

CREATE POLICY "Org admins can delete agri inputs" ON public.agri_observation_inputs
    FOR DELETE USING (
        observation_id IN (
            SELECT id FROM public.agri_observations 
            WHERE public.is_org_manager_or_owner(organization_id)
        )
    );
