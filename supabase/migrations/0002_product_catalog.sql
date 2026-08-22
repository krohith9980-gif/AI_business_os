-- Migration 0002: Product Catalog (Categories, Products, Variants)

CREATE TYPE tracking_mode AS ENUM ('NONE', 'SERIALIZED', 'BATCH');

-- 1. Categories
CREATE TABLE public.categories (
    id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    parent_id UUID,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE (organization_id, id),
    FOREIGN KEY (organization_id, parent_id) REFERENCES public.categories(organization_id, id) ON DELETE RESTRICT
);
CREATE TRIGGER set_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_categories_org_id ON public.categories(organization_id);

-- Trigger function to prevent circular references in categories
CREATE OR REPLACE FUNCTION public.check_category_circular_reference()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    current_parent UUID;
BEGIN
    IF NEW.parent_id IS NULL THEN
        RETURN NEW;
    END IF;

    current_parent := NEW.parent_id;
    WHILE current_parent IS NOT NULL LOOP
        IF current_parent = NEW.id THEN
            RAISE EXCEPTION 'Circular reference detected in category hierarchy';
        END IF;
        SELECT parent_id INTO current_parent FROM public.categories WHERE id = current_parent;
    END LOOP;
    
    RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_circular_category
    BEFORE INSERT OR UPDATE ON public.categories
    FOR EACH ROW EXECUTE FUNCTION public.check_category_circular_reference();

-- 2. Products
CREATE TABLE public.products (
    id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    category_id UUID REFERENCES public.categories(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Composite unique key to ensure category belongs to the same org when referenced
    UNIQUE (organization_id, id)
);
CREATE TRIGGER set_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_products_org_id ON public.products(organization_id);
CREATE INDEX idx_products_category_id ON public.products(category_id);

-- Enforce Product Org matches Category Org
CREATE OR REPLACE FUNCTION public.check_product_category_org_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    cat_org UUID;
BEGIN
    IF NEW.category_id IS NOT NULL THEN
        SELECT organization_id INTO cat_org FROM public.categories WHERE id = NEW.category_id;
        IF cat_org != NEW.organization_id THEN
            RAISE EXCEPTION 'Product organization_id must match Category organization_id';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_product_category_org
    BEFORE INSERT OR UPDATE ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.check_product_category_org_match();


-- 3. Product Variants
CREATE TABLE public.product_variants (
    id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    product_id UUID NOT NULL,
    organization_id UUID NOT NULL, -- Denormalized for composite FK constraints
    sku TEXT NOT NULL,
    barcode TEXT,
    attributes JSONB,
    purchase_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
    selling_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
    tracking_mode tracking_mode NOT NULL DEFAULT 'NONE',
    image_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Foreign key to product enforcing org consistency via composite key
    FOREIGN KEY (organization_id, product_id) REFERENCES public.products(organization_id, id) ON DELETE RESTRICT,
    
    -- Unique SKU per organization
    CONSTRAINT uq_org_sku UNIQUE(organization_id, sku),
    
    -- Unique Variant ID with Org for child tables to reference securely
    UNIQUE (organization_id, id)
);
CREATE TRIGGER set_variants_updated_at BEFORE UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Unique Barcode per organization (ignoring NULLs)
CREATE UNIQUE INDEX uq_org_barcode ON public.product_variants (organization_id, barcode) WHERE barcode IS NOT NULL;

CREATE INDEX idx_variants_product_id ON public.product_variants(product_id);
CREATE INDEX idx_variants_org_id ON public.product_variants(organization_id);

-- 4. Variant Price History
CREATE TABLE public.variant_price_history (
    id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    organization_id UUID NOT NULL,
    variant_id UUID NOT NULL,
    purchase_cost NUMERIC(12, 2) NOT NULL,
    selling_price NUMERIC(12, 2) NOT NULL,
    effective_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    FOREIGN KEY (organization_id, variant_id) REFERENCES public.product_variants(organization_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_price_history_variant_id ON public.variant_price_history(variant_id);
