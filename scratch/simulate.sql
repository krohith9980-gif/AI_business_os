WITH observation_inputs AS (
    SELECT 
        i.input_category AS obs_input_category,
        i.reasoning,
        i.urgency
    FROM public.agri_observation_inputs i
    WHERE i.observation_id = '98004ac8-a1f7-406e-ba33-69bc62e4802a'
)
SELECT 
    oi.obs_input_category,
    p.name
FROM observation_inputs oi
LEFT JOIN public.products p 
    ON p.organization_id = '332f3e09-1c4d-4c15-960a-1ab211177235'
    AND p.is_active = TRUE
    AND jsonb_typeof(p.agricultural_use) = 'array'
    AND (
        EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(p.agricultural_use) AS tag
            WHERE tag ILIKE '%' || oi.obs_input_category || '%'
               OR oi.obs_input_category ILIKE '%' || tag || '%'
        )
    );
