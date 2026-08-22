-- Migration 0004: Purchasing (Suppliers, POs, Receipts)

CREATE TYPE po_status AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ORDERED', 'PARTIAL_RECEIVED', 'COMPLETED', 'CANCELLED');
CREATE TYPE receipt_status AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- 1. Suppliers
CREATE TABLE public.suppliers (
    id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE (organization_id, id)
);
CREATE TRIGGER set_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_suppliers_org_id ON public.suppliers(organization_id);

-- 2. Supplier Products (Mapping Supplier to Variant)
CREATE TABLE public.supplier_products (
    id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    supplier_id UUID NOT NULL,
    organization_id UUID NOT NULL,
    variant_id UUID NOT NULL,
    supplier_sku TEXT,
    preferred BOOLEAN NOT NULL DEFAULT FALSE,
    minimum_order_quantity INTEGER NOT NULL DEFAULT 1,
    order_multiple INTEGER NOT NULL DEFAULT 1,
    lead_time_override INTEGER, -- Days
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    FOREIGN KEY (organization_id, supplier_id) REFERENCES public.suppliers(organization_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (organization_id, variant_id) REFERENCES public.product_variants(organization_id, id) ON DELETE RESTRICT,
    
    CONSTRAINT uq_supplier_variant UNIQUE(supplier_id, variant_id)
);
CREATE TRIGGER set_supp_prod_updated_at BEFORE UPDATE ON public.supplier_products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_supplier_products_variant_id ON public.supplier_products(variant_id);


-- 3. Supplier Price History
CREATE TABLE public.supplier_price_history (
    id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    supplier_id UUID NOT NULL,
    organization_id UUID NOT NULL,
    variant_id UUID NOT NULL,
    price NUMERIC(12, 2) NOT NULL,
    effective_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    FOREIGN KEY (organization_id, supplier_id) REFERENCES public.suppliers(organization_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (organization_id, variant_id) REFERENCES public.product_variants(organization_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_supp_price_hist_variant_id ON public.supplier_price_history(variant_id);


-- 4. Purchase Orders
CREATE TABLE public.purchase_orders (
    id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
    supplier_id UUID NOT NULL,
    organization_id UUID NOT NULL,
    status po_status NOT NULL DEFAULT 'DRAFT',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    
    FOREIGN KEY (organization_id, supplier_id) REFERENCES public.suppliers(organization_id, id) ON DELETE RESTRICT,
    
    UNIQUE (id, store_id)
);
CREATE TRIGGER set_pos_updated_at BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_pos_store_id ON public.purchase_orders(store_id);

-- Enforce PO Store Org matches Supplier Org
CREATE OR REPLACE FUNCTION public.check_po_store_org_match()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    store_org UUID;
BEGIN
    SELECT organization_id INTO store_org FROM public.stores WHERE id = NEW.store_id;
    IF store_org != NEW.organization_id THEN
        RAISE EXCEPTION 'PO Store organization must match Supplier organization';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_po_store_org
    BEFORE INSERT OR UPDATE ON public.purchase_orders
    FOR EACH ROW EXECUTE FUNCTION public.check_po_store_org_match();


-- 5. PO Items
CREATE TABLE public.po_items (
    id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
    po_store_id UUID NOT NULL, -- For constraint checks
    organization_id UUID NOT NULL,
    variant_id UUID NOT NULL,
    quantity_ordered INTEGER NOT NULL,
    quantity_received INTEGER NOT NULL DEFAULT 0,
    purchase_cost NUMERIC(12, 2) NOT NULL,
    
    FOREIGN KEY (po_id, po_store_id) REFERENCES public.purchase_orders(id, store_id) ON DELETE RESTRICT,
    FOREIGN KEY (organization_id, variant_id) REFERENCES public.product_variants(organization_id, id) ON DELETE RESTRICT,
    
    CONSTRAINT chk_po_quantity_positive CHECK (quantity_ordered > 0),
    CONSTRAINT chk_po_received_limit CHECK (quantity_received <= quantity_ordered),
    
    UNIQUE (id, po_id)
);

CREATE INDEX idx_po_items_po_id ON public.po_items(po_id);

-- Enforce PO Item Org matches PO Org
CREATE OR REPLACE FUNCTION public.check_po_item_org_match()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    po_org UUID;
BEGIN
    SELECT organization_id INTO po_org FROM public.purchase_orders WHERE id = NEW.po_id;
    IF po_org != NEW.organization_id THEN
        RAISE EXCEPTION 'PO Item organization must match PO organization';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_po_item_org
    BEFORE INSERT OR UPDATE ON public.po_items
    FOR EACH ROW EXECUTE FUNCTION public.check_po_item_org_match();


-- 6. Purchase Receipts (Handles Partial Receiving)
CREATE TABLE public.purchase_receipts (
    id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status receipt_status NOT NULL DEFAULT 'PENDING',
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    
    UNIQUE (id, po_id)
);

CREATE INDEX idx_receipts_po_id ON public.purchase_receipts(po_id);


-- 7. Purchase Receipt Items
CREATE TABLE public.purchase_receipt_items (
    id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    receipt_id UUID NOT NULL,
    receipt_po_id UUID NOT NULL,
    po_item_id UUID NOT NULL,
    po_item_po_id UUID NOT NULL,
    quantity_received INTEGER NOT NULL,
    
    -- Ensure receipt and po_item belong to the same PO
    FOREIGN KEY (receipt_id, receipt_po_id) REFERENCES public.purchase_receipts(id, po_id) ON DELETE RESTRICT,
    FOREIGN KEY (po_item_id, po_item_po_id) REFERENCES public.po_items(id, po_id) ON DELETE RESTRICT,
    CONSTRAINT chk_same_po CHECK (receipt_po_id = po_item_po_id),
    
    CONSTRAINT chk_receipt_quantity_positive CHECK (quantity_received > 0)
);

CREATE INDEX idx_receipt_items_receipt_id ON public.purchase_receipt_items(receipt_id);

-- Trigger to safely update po_items.quantity_received
CREATE OR REPLACE FUNCTION public.update_po_item_received_qty()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.po_items 
        SET quantity_received = quantity_received + NEW.quantity_received 
        WHERE id = NEW.po_item_id;
    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE public.po_items 
        SET quantity_received = quantity_received - OLD.quantity_received + NEW.quantity_received 
        WHERE id = NEW.po_item_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.po_items 
        SET quantity_received = quantity_received - OLD.quantity_received 
        WHERE id = OLD.po_item_id;
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_update_po_received_qty
    AFTER INSERT OR UPDATE OR DELETE ON public.purchase_receipt_items
    FOR EACH ROW EXECUTE FUNCTION public.update_po_item_received_qty();
