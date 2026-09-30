-- Migration 0053: Agri Input Mapping and Resolution RPC

CREATE TYPE mapping_target_type AS ENUM ('CATEGORY', 'PRODUCT');

CREATE TABLE public.agri_input_category_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    input_category TEXT NOT NULL, -- e.g., 'Urea'
    mapping_type mapping_target_type NOT NULL,
    category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    reasoning TEXT,
    confidence_score NUMERIC CHECK (confidence_score >= 0 AND confidence_score <= 1.0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    
    -- Ensure appropriate fields are filled based on type
    CONSTRAINT check_mapping_target CHECK (
        (mapping_type = 'CATEGORY' AND category_id IS NOT NULL AND product_id IS NULL) OR
        (mapping_type = 'PRODUCT' AND product_id IS NOT NULL AND category_id IS NULL)
    ),
    -- Prevent duplicate mappings for the same input_category and target
    UNIQUE NULLS NOT DISTINCT (organization_id, input_category, category_id, product_id)
);

CREATE TRIGGER set_agri_input_mappings_updated_at BEFORE UPDATE ON public.agri_input_category_mappings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_agri_input_mappings_org_id ON public.agri_input_category_mappings(organization_id);
CREATE INDEX idx_agri_input_mappings_input_cat ON public.agri_input_category_mappings(input_category);

-- RLS
ALTER TABLE public.agri_input_category_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view agri input mappings" ON public.agri_input_category_mappings
    FOR SELECT USING (public.is_org_member(organization_id));

CREATE POLICY "Org admins can insert agri input mappings" ON public.agri_input_category_mappings
    FOR INSERT WITH CHECK (public.is_org_manager_or_owner(organization_id));

CREATE POLICY "Org admins can update agri input mappings" ON public.agri_input_category_mappings
    FOR UPDATE USING (public.is_org_manager_or_owner(organization_id));

CREATE POLICY "Org admins can delete agri input mappings" ON public.agri_input_category_mappings
    FOR DELETE USING (public.is_org_manager_or_owner(organization_id));

-- The RPC for resolving inputs
CREATE OR REPLACE FUNCTION public.resolve_agri_input_needs(
    p_organization_id UUID,
    p_region TEXT,
    p_crop_name TEXT
) 
RETURNS TABLE (
    observation_id UUID,
    geographic_level TEXT,
    resolved_region TEXT,
    crop_stage TEXT,
    progress_status TEXT,
    input_category TEXT,
    mapping_reasoning TEXT,
    urgency TEXT,
    confidence_score NUMERIC,
    freshness_status TEXT,
    source_name TEXT,
    matched_products JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_best_observation RECORD;
BEGIN
    -- 1. Security Check: Enforce tenant isolation securely via auth.uid()
    IF NOT public.is_org_member(p_organization_id) THEN
        RAISE EXCEPTION 'Unauthorized: User is not an active member of this organization.';
    END IF;

    -- 2. Locate Best Observation
    -- Priority: DISTRICT+FRESH > DISTRICT+AGING > STATE+FRESH > STATE+AGING
    SELECT 
        o.id,
        o.geographic_level,
        o.region,
        o.crop_stage,
        o.progress_status,
        o.confidence_score,
        o.freshness_status,
        s.name AS source_name
    INTO v_best_observation
    FROM public.agri_observations o
    JOIN public.agri_intelligence_sources s ON o.source_id = s.id
    WHERE 
        o.organization_id = p_organization_id
        AND o.crop_name = p_crop_name
        AND o.freshness_status IN ('FRESH', 'AGING')
        AND (
            (o.geographic_level = 'DISTRICT' AND o.region = p_region)
            OR 
            (o.geographic_level = 'STATE')
        )
    ORDER BY 
        CASE WHEN o.geographic_level = 'DISTRICT' THEN 1 ELSE 2 END ASC,
        CASE WHEN o.freshness_status = 'FRESH' THEN 1 ELSE 2 END ASC,
        o.observation_date DESC
    LIMIT 1;

    -- If no valid observation found, return empty set
    IF v_best_observation.id IS NULL THEN
        RETURN;
    END IF;

    -- 3. Resolve Inputs and match against shop catalog
    RETURN QUERY
    WITH observation_inputs AS (
        SELECT 
            i.input_category AS obs_input_category,
            i.reasoning,
            i.urgency
        FROM public.agri_observation_inputs i
        WHERE i.observation_id = v_best_observation.id
    ),
    matched_products_cte AS (
        SELECT 
            oi.obs_input_category,
            m.reasoning AS mapping_reasoning,
            jsonb_agg(
                jsonb_build_object(
                    'product_id', p.id,
                    'product_name', p.name,
                    'mapping_type', m.mapping_type,
                    'mapping_confidence', m.confidence_score
                )
            ) FILTER (WHERE p.id IS NOT NULL AND p.is_active = TRUE) AS products
        FROM observation_inputs oi
        JOIN public.agri_input_category_mappings m 
            ON m.input_category = oi.obs_input_category
            AND m.organization_id = p_organization_id
            AND m.is_active = TRUE
        -- Left join to match products. If mapping is CATEGORY, join all products in that category. 
        -- If mapping is PRODUCT, join that exact product.
        LEFT JOIN public.products p 
            ON p.organization_id = p_organization_id
            AND (
                (m.mapping_type = 'CATEGORY' AND p.category_id = m.category_id)
                OR
                (m.mapping_type = 'PRODUCT' AND p.id = m.product_id)
            )
        GROUP BY oi.obs_input_category, m.reasoning
    )
    SELECT 
        v_best_observation.id AS observation_id,
        v_best_observation.geographic_level::TEXT AS geographic_level,
        v_best_observation.region AS resolved_region,
        v_best_observation.crop_stage AS crop_stage,
        v_best_observation.progress_status AS progress_status,
        mp.obs_input_category AS input_category,
        COALESCE(mp.mapping_reasoning, oi.reasoning) AS mapping_reasoning,
        oi.urgency AS urgency,
        v_best_observation.confidence_score AS confidence_score,
        v_best_observation.freshness_status::TEXT AS freshness_status,
        v_best_observation.source_name AS source_name,
        COALESCE(mp.products, '[]'::jsonb) AS matched_products
    FROM observation_inputs oi
    LEFT JOIN matched_products_cte mp ON mp.obs_input_category = oi.obs_input_category
    -- Only return categories that successfully mapped to the shop's domain
    WHERE mp.obs_input_category IS NOT NULL;
    
END;
$$;
