-- Migration 0006: Audit Logging

-- 1. Audit Logs Table
CREATE TABLE public.audit_logs (
    id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL, 
    entity_type TEXT NOT NULL, 
    entity_id UUID NOT NULL,
    old_value JSONB,
    new_value JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_org_id ON public.audit_logs(organization_id);
CREATE INDEX idx_audit_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_actor_id ON public.audit_logs(actor_id);

-- 2. Strict Insert-Only Enforcement
CREATE OR REPLACE FUNCTION public.prevent_audit_log_modification()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'Audit logs are immutable. UPDATE and DELETE operations are forbidden.';
END;
$$;

CREATE TRIGGER enforce_audit_log_insert_only
    BEFORE UPDATE OR DELETE ON public.audit_logs
    FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_modification();


-- 3. Automatic Audit Trigger Strategy
CREATE OR REPLACE FUNCTION public.audit_event()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    org_id UUID;
    org_col_name TEXT;
BEGIN
    -- Extract the organization_id column name from trigger arguments, default to 'organization_id'
    IF TG_NARGS > 0 AND TG_ARGV[0] IS NOT NULL THEN
        org_col_name := TG_ARGV[0];
    ELSE
        org_col_name := 'organization_id';
    END IF;

    -- Safely extract the organization_id using row_to_json
    IF TG_OP = 'DELETE' THEN
        org_id := (row_to_json(OLD)->>org_col_name)::UUID;
    ELSE
        org_id := (row_to_json(NEW)->>org_col_name)::UUID;
    END IF;

    -- If org_id is somehow still null and it's the organizations table itself, use its id
    IF org_id IS NULL AND TG_TABLE_NAME = 'organizations' THEN
        IF TG_OP = 'DELETE' THEN
            org_id := OLD.id;
        ELSE
            org_id := NEW.id;
        END IF;
    END IF;

    INSERT INTO public.audit_logs (
        organization_id, actor_id, action_type, entity_type, entity_id, old_value, new_value, ip_address
    ) VALUES (
        org_id, 
        auth.uid(), 
        TG_OP, 
        TG_TABLE_NAME, 
        COALESCE(NEW.id, OLD.id), 
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END, 
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END, 
        current_setting('request.headers', true)::json->>'x-forwarded-for'
    );
    
    RETURN NULL; -- AFTER triggers should return NULL
END;
$$;
REVOKE EXECUTE ON FUNCTION public.audit_event() FROM public, anon, authenticated;

-- 4. Attach Audit Triggers to Business Tables
CREATE TRIGGER audit_organizations AFTER INSERT OR UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.audit_event('id');
CREATE TRIGGER audit_organization_members AFTER INSERT OR UPDATE OR DELETE ON public.organization_members FOR EACH ROW EXECUTE FUNCTION public.audit_event('organization_id');
CREATE TRIGGER audit_stores AFTER INSERT OR UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION public.audit_event('organization_id');
CREATE TRIGGER audit_categories AFTER INSERT OR UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.audit_event('organization_id');
CREATE TRIGGER audit_products AFTER INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.audit_event('organization_id');
CREATE TRIGGER audit_product_variants AFTER INSERT OR UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.audit_event('organization_id');
CREATE TRIGGER audit_variant_price_history AFTER INSERT OR UPDATE ON public.variant_price_history FOR EACH ROW EXECUTE FUNCTION public.audit_event('organization_id');
CREATE TRIGGER audit_inventory_balances AFTER INSERT OR UPDATE ON public.inventory_balances FOR EACH ROW EXECUTE FUNCTION public.audit_event('organization_id');
CREATE TRIGGER audit_inventory_serials AFTER INSERT OR UPDATE ON public.inventory_serials FOR EACH ROW EXECUTE FUNCTION public.audit_event('organization_id');
CREATE TRIGGER audit_suppliers AFTER INSERT OR UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.audit_event('organization_id');
CREATE TRIGGER audit_supplier_products AFTER INSERT OR UPDATE ON public.supplier_products FOR EACH ROW EXECUTE FUNCTION public.audit_event('organization_id');
CREATE TRIGGER audit_supplier_price_history AFTER INSERT OR UPDATE ON public.supplier_price_history FOR EACH ROW EXECUTE FUNCTION public.audit_event('organization_id');
CREATE TRIGGER audit_purchase_orders AFTER INSERT OR UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.audit_event('organization_id');
CREATE TRIGGER audit_sales AFTER INSERT OR UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.audit_event('organization_id');

