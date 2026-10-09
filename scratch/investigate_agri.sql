-- Investigation Script for Agri Recommendations

-- 1. Check Agricultural Observations
SELECT '1. OBSERVATIONS' as section;
SELECT id, crop_name, region, geographic_level, freshness_status, observation_date, created_at
FROM public.agri_observations;

-- 2. Check Agricultural Observation Inputs
SELECT '2. OBSERVATION INPUTS' as section;
SELECT i.id, i.observation_id, i.input_category, i.reasoning, o.crop_name, o.region
FROM public.agri_observation_inputs i
JOIN public.agri_observations o ON o.id = i.observation_id;

-- 3. Check Product Agricultural Use
SELECT '3. PRODUCT AGRI USE' as section;
SELECT id, name, is_active, agricultural_use
FROM public.products
WHERE agricultural_use IS NOT NULL AND agricultural_use != '[]'::jsonb;

-- 4. Check Organization & Store
SELECT '4. ORG & STORE' as section;
SELECT id, name, organization_id FROM public.stores LIMIT 1;
