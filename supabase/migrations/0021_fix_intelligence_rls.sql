-- 0021_fix_intelligence_rls.sql

DROP POLICY IF EXISTS "intelligence_cache_org_isolation" ON public.product_intelligence_cache;
DROP POLICY IF EXISTS "seasonal_profiles_org_isolation" ON public.seasonal_demand_profiles;

CREATE POLICY "intelligence_cache_org_isolation"
ON public.product_intelligence_cache FOR ALL
TO authenticated
USING (public.is_org_member(organization_id))
WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "seasonal_profiles_org_isolation"
ON public.seasonal_demand_profiles FOR ALL
TO authenticated
USING (public.is_org_member(organization_id))
WITH CHECK (public.is_org_member(organization_id));
