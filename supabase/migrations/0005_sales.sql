-- Migration 0005: Sales (Customers, Sales, Payments, Returns)

CREATE TYPE sale_status AS ENUM ('PENDING', 'COMPLETED', 'REFUNDED', 'CANCELLED');
CREATE TYPE payment_method AS ENUM ('CASH', 'UPI', 'CARD', 'SPLIT');
CREATE TYPE payment_status AS ENUM ('PENDING', 'PAID', 'FAILED', 'PARTIALLY_PAID', 'REFUNDED');
CREATE TYPE return_status AS ENUM ('REQUESTED', 'INSPECTED', 'REFUNDED', 'REJECTED');
CREATE TYPE return_disposition AS ENUM ('RESELLABLE', 'DAMAGED', 'WARRANTY', 'SUPPLIER_RETURN');

-- 1. Customers
CREATE TABLE public.customers (
    id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    phone_number TEXT,
    email TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_customers_org_id ON public.customers(organization_id);

-- Optional: Unique customer by phone per organization
CREATE UNIQUE INDEX uq_org_customer_phone ON public.customers(organization_id, phone_number) WHERE phone_number IS NOT NULL;


-- 2. Sales (Store Level)
-- Direct inserts to this table will be blocked. Must use complete_sale RPC.
CREATE TABLE public.sales (
    id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
    organization_id UUID NOT NULL, -- For composite FK logic
    customer_id UUID REFERENCES public.customers(id) ON DELETE RESTRICT,
    cashier_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    status sale_status NOT NULL DEFAULT 'PENDING',
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
    discount_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
    tax_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
    grand_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    FOREIGN KEY (organization_id, store_id) REFERENCES public.stores(organization_id, id) ON DELETE RESTRICT,
    
    CONSTRAINT chk_sale_positive_totals CHECK (subtotal >= 0 AND discount_total >= 0 AND tax_total >= 0 AND grand_total >= 0)
);
CREATE TRIGGER set_sales_updated_at BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_sales_store_id ON public.sales(store_id);

-- Enforce Sale Store Org matches Customer Org
CREATE OR REPLACE FUNCTION public.check_sale_customer_org_match()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    cust_org UUID;
BEGIN
    IF NEW.customer_id IS NOT NULL THEN
        SELECT organization_id INTO cust_org FROM public.customers WHERE id = NEW.customer_id;
        IF NEW.organization_id != cust_org THEN
            RAISE EXCEPTION 'Sale store organization must match Customer organization';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_sale_customer_org_match
    BEFORE INSERT OR UPDATE ON public.sales
    FOR EACH ROW EXECUTE FUNCTION public.check_sale_customer_org_match();


-- 3. Sale Items
CREATE TABLE public.sale_items (
    id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE RESTRICT,
    organization_id UUID NOT NULL,
    variant_id UUID NOT NULL,
    quantity INTEGER NOT NULL,
    
    unit_purchase_cost NUMERIC(12, 2) NOT NULL,
    unit_selling_price NUMERIC(12, 2) NOT NULL,
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
    cgst NUMERIC(12, 2) NOT NULL DEFAULT 0,
    sgst NUMERIC(12, 2) NOT NULL DEFAULT 0,
    igst NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total_price NUMERIC(12, 2) NOT NULL,
    
    FOREIGN KEY (organization_id, variant_id) REFERENCES public.product_variants(organization_id, id) ON DELETE RESTRICT,
    
    CONSTRAINT chk_sale_item_quantity_positive CHECK (quantity > 0),
    CONSTRAINT chk_sale_item_tax_rate CHECK (tax_rate >= 0 AND tax_rate <= 100),
    CONSTRAINT chk_sale_item_positive_amounts CHECK (unit_purchase_cost >= 0 AND unit_selling_price >= 0 AND discount_amount >= 0)
);

CREATE INDEX idx_sale_items_sale_id ON public.sale_items(sale_id);

-- Enforce Sale Item variant org matches Sale org
CREATE OR REPLACE FUNCTION public.check_sale_item_org_match()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    sale_org UUID;
BEGIN
    SELECT organization_id INTO sale_org FROM public.sales WHERE id = NEW.sale_id;
    IF sale_org != NEW.organization_id THEN
        RAISE EXCEPTION 'Sale Item organization must match Sale organization';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_sale_item_org_match
    BEFORE INSERT OR UPDATE ON public.sale_items
    FOR EACH ROW EXECUTE FUNCTION public.check_sale_item_org_match();


-- 4. Payments
CREATE TABLE public.payments (
    id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE RESTRICT,
    method payment_method NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    status payment_status NOT NULL DEFAULT 'PENDING',
    provider TEXT,
    provider_reference TEXT,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT chk_payment_amount_positive CHECK (amount > 0)
);
CREATE TRIGGER set_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_payments_sale_id ON public.payments(sale_id);


-- 5. Returns
CREATE TABLE public.returns (
    id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE RESTRICT,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
    customer_id UUID REFERENCES public.customers(id) ON DELETE RESTRICT,
    status return_status NOT NULL DEFAULT 'REQUESTED',
    total_refund_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT chk_return_amount_positive CHECK (total_refund_amount >= 0)
);
CREATE TRIGGER set_returns_updated_at BEFORE UPDATE ON public.returns FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_returns_sale_id ON public.returns(sale_id);


-- 6. Return Items
CREATE TABLE public.return_items (
    id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    return_id UUID NOT NULL REFERENCES public.returns(id) ON DELETE RESTRICT,
    sale_item_id UUID NOT NULL REFERENCES public.sale_items(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL,
    disposition return_disposition NOT NULL DEFAULT 'RESELLABLE',
    
    CONSTRAINT chk_return_item_quantity_positive CHECK (quantity > 0)
);

CREATE INDEX idx_return_items_return_id ON public.return_items(return_id);
