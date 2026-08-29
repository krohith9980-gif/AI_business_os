-- 0019_phase3_intelligence_tables.sql

-- 1. Add purchase packaging fields to product_variants
ALTER TABLE public.product_variants 
ADD COLUMN purchase_packaging_type TEXT DEFAULT 'NONE',
ADD COLUMN purchase_units_per_pack INTEGER DEFAULT 1;

-- Seed them with existing values so we don't break existing data
UPDATE public.product_variants 
SET purchase_packaging_type = packaging_type,
    purchase_units_per_pack = units_per_pack;

-- 2. Create Enums
CREATE TYPE public.trend_status AS ENUM (
    'STABLE',
    'GROWING',
    'DECLINING',
    'SEASONAL',
    'SPIKE',
    'INSUFFICIENT_DATA'
);

CREATE TYPE public.intelligence_classification AS ENUM (
    'BUY_MORE',
    'NORMAL',
    'WATCH',
    'DO_NOT_BUY',
    'DEAD_STOCK',
    'NEW_PRODUCT'
);

-- 3. Create product_intelligence_cache table
CREATE TABLE public.product_intelligence_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    variant_id UUID NOT NULL,
    
    avg_daily_sales NUMERIC(14, 4) NOT NULL DEFAULT 0,
    days_of_stock NUMERIC(14, 2) NOT NULL DEFAULT 0,
    supplier_lead_time_days INTEGER NOT NULL DEFAULT 7,
    
    classification public.intelligence_classification NOT NULL DEFAULT 'NEW_PRODUCT',
    trend_status public.trend_status NOT NULL DEFAULT 'INSUFFICIENT_DATA',
    confidence_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
    
    reorder_point NUMERIC(14, 4) NOT NULL DEFAULT 0,
    safety_stock NUMERIC(14, 4) NOT NULL DEFAULT 0,
    forecast_demand_30d NUMERIC(14, 4) NOT NULL DEFAULT 0,
    recommended_purchase_base_units NUMERIC(14, 4) NOT NULL DEFAULT 0,
    
    last_calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    FOREIGN KEY (organization_id, variant_id) REFERENCES public.product_variants(organization_id, id) ON DELETE CASCADE,
    UNIQUE (variant_id)
);

CREATE INDEX idx_intelligence_org ON public.product_intelligence_cache(organization_id);

-- 4. Create seasonal_demand_profiles table
CREATE TABLE public.seasonal_demand_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    variant_id UUID NOT NULL,
    month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    demand_multiplier NUMERIC(5, 2) NOT NULL DEFAULT 1.0,
    
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    FOREIGN KEY (organization_id, variant_id) REFERENCES public.product_variants(organization_id, id) ON DELETE CASCADE,
    UNIQUE (variant_id, month)
);

CREATE INDEX idx_seasonal_org ON public.seasonal_demand_profiles(organization_id);

-- 5. RLS Policies
ALTER TABLE public.product_intelligence_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasonal_demand_profiles ENABLE ROW LEVEL SECURITY;

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
