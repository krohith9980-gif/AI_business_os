-- Simulate resolve_agri_input_needs for lowercase cotton
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
FROM public.agri_observations o
JOIN public.agri_intelligence_sources s ON o.source_id = s.id
WHERE 
    o.organization_id = '332f3e09-1c4d-4c15-960a-1ab211177235'
    AND o.crop_name ILIKE 'cotton'
    AND o.freshness_status IN ('FRESH', 'AGING')
    AND (
        (o.geographic_level = 'DISTRICT' AND o.region = 'suryapet')
        OR 
        (o.geographic_level = 'STATE')
    )
ORDER BY 
    CASE WHEN o.geographic_level = 'DISTRICT' THEN 1 ELSE 2 END ASC,
    CASE WHEN o.freshness_status = 'FRESH' THEN 1 ELSE 2 END ASC,
    o.observation_date DESC
LIMIT 1;

-- Simulate resolve_agri_input_needs for uppercase Cotton
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
FROM public.agri_observations o
JOIN public.agri_intelligence_sources s ON o.source_id = s.id
WHERE 
    o.organization_id = '332f3e09-1c4d-4c15-960a-1ab211177235'
    AND o.crop_name ILIKE 'Cotton'
    AND o.freshness_status IN ('FRESH', 'AGING')
    AND (
        (o.geographic_level = 'DISTRICT' AND o.region = 'suryapet')
        OR 
        (o.geographic_level = 'STATE')
    )
ORDER BY 
    CASE WHEN o.geographic_level = 'DISTRICT' THEN 1 ELSE 2 END ASC,
    CASE WHEN o.freshness_status = 'FRESH' THEN 1 ELSE 2 END ASC,
    o.observation_date DESC
LIMIT 1;
