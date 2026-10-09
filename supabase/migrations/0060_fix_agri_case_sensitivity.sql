-- Migration 0060: Fix case-sensitivity in resolve_agri_input_needs

CREATE OR REPLACE FUNCTION public.resolve_agri_input_needs(p_organization_id uuid, p_region text, p_crop_name text)
 RETURNS TABLE(observation_id uuid, geographic_level text, resolved_region text, crop_stage text, progress_status text, input_category text, mapping_reasoning text, urgency text, confidence_score numeric, freshness_status text, source_name text, matched_products jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_best_observation RECORD;
BEGIN
    -- 1. Security Check
    IF NOT public.is_org_member(p_organization_id) THEN
        RAISE EXCEPTION 'Unauthorized: User is not an active member of this organization.';
    END IF;

    -- 2. Locate Best Observation
    SELECT 
        o.id,
        o.geographic_level,
        o.region,
        o.crop_stage,
        o.progress_status,
        o.confidence_score,
        o.freshness_status,
        s.name AS source_name,
        o.crop_name
    INTO v_best_observation
    FROM public.agri_observations o
    JOIN public.agri_intelligence_sources s ON o.source_id = s.id
    WHERE 
        o.organization_id = p_organization_id
        AND o.crop_name ILIKE p_crop_name
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

    IF v_best_observation.id IS NULL THEN
        RETURN;
    END IF;

    -- 3. Resolve Inputs and match against shop catalog using new agricultural_use field
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
            'Matched via Product Agricultural Use'::TEXT AS mapping_reasoning,
            jsonb_agg(
                jsonb_build_object(
                    'product_id', p.id,
                    'product_name', p.name,
                    'mapping_type', 'PRODUCT_LEVEL_USE',
                    'mapping_confidence', 1.0
                )
            ) FILTER (WHERE p.id IS NOT NULL) AS products
        FROM observation_inputs oi
        LEFT JOIN public.products p 
            ON p.organization_id = p_organization_id
            AND p.is_active = TRUE
            AND jsonb_typeof(p.agricultural_use) = 'array'
            AND (
                -- Search the JSONB array for tags that ILIKE match the observed input category
                EXISTS (
                    SELECT 1 FROM jsonb_array_elements_text(p.agricultural_use) AS tag
                    WHERE tag ILIKE '%' || oi.obs_input_category || '%'
                       OR oi.obs_input_category ILIKE '%' || tag || '%'
                )
            )
        GROUP BY oi.obs_input_category
    )
    SELECT 
        v_best_observation.id AS observation_id,
        v_best_observation.geographic_level::TEXT,
        v_best_observation.region AS resolved_region,
        v_best_observation.crop_stage,
        v_best_observation.progress_status,
        cte.obs_input_category AS input_category,
        cte.mapping_reasoning,
        oi.urgency,
        v_best_observation.confidence_score,
        v_best_observation.freshness_status::TEXT,
        v_best_observation.source_name,
        COALESCE(cte.products, '[]'::jsonb) AS matched_products
    FROM observation_inputs oi
    JOIN matched_products_cte cte ON cte.obs_input_category = oi.obs_input_category;
END;
$function$;
