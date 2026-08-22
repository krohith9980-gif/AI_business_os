-- Migration 0003: Inventory (Balances, Movements, Reservations, Serials)

CREATE TYPE movement_type AS ENUM (
    'opening_stock', 
    'sale', 
    'purchase_received', 
    'customer_return', 
    'supplier_return', 
    'damage', 
    'adjustment', 
    'correction', 
    'transfer_out', 
    'transfer_in'
);

CREATE TYPE reservation_status AS ENUM ('ACTIVE', 'EXPIRED', 'COMPLETED', 'CANCELLED');
CREATE TYPE serial_status AS ENUM ('AVAILABLE', 'RESERVED', 'SOLD', 'DAMAGED', 'RETURNED');

-- 1. Inventory Balances
CREATE TABLE public.inventory_balances (
    id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    store_id UUID NOT NULL,
    organization_id UUID NOT NULL, -- Denormalized for composite FK constraints
    variant_id UUID NOT NULL,
    on_hand_stock INTEGER NOT NULL DEFAULT 0,
    incoming_stock INTEGER NOT NULL DEFAULT 0,
    damaged_stock INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Foreign keys enforcing org consistency
    FOREIGN KEY (organization_id, variant_id) REFERENCES public.product_variants(organization_id, id) ON DELETE RESTRICT,
    
    CONSTRAINT chk_positive_on_hand CHECK (on_hand_stock >= 0),
    CONSTRAINT chk_positive_incoming CHECK (incoming_stock >= 0),
    CONSTRAINT chk_positive_damaged CHECK (damaged_stock >= 0),
    
    -- Unique balance record per store per variant
    CONSTRAINT uq_store_variant UNIQUE(store_id, variant_id),
    UNIQUE (organization_id, store_id, variant_id)
);
CREATE TRIGGER set_balances_updated_at BEFORE UPDATE ON public.inventory_balances FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_balances_store_id ON public.inventory_balances(store_id);
CREATE INDEX idx_balances_variant_id ON public.inventory_balances(variant_id);

-- Enforce store org matches variant org
CREATE OR REPLACE FUNCTION public.check_balance_org_match()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    store_org UUID;
BEGIN
    SELECT organization_id INTO store_org FROM public.stores WHERE id = NEW.store_id;
    IF store_org != NEW.organization_id THEN
        RAISE EXCEPTION 'Inventory store organization must match product variant organization';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_balance_org_match
    BEFORE INSERT OR UPDATE ON public.inventory_balances
    FOR EACH ROW EXECUTE FUNCTION public.check_balance_org_match();


-- 2. Inventory Movements (Authoritative Ledger)
CREATE TABLE public.inventory_movements (
    id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
    variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
    movement_type movement_type NOT NULL,
    quantity INTEGER NOT NULL, -- Absolute value. Sign handled by RPC based on movement type.
    reference_id UUID, 
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    
    CONSTRAINT chk_movement_quantity_positive CHECK (quantity > 0)
);

CREATE INDEX idx_movements_store_id ON public.inventory_movements(store_id);
CREATE INDEX idx_movements_variant_id ON public.inventory_movements(variant_id);
CREATE INDEX idx_movements_reference_id ON public.inventory_movements(reference_id);


-- 3. Inventory Reservations (Active Carts / Pending Transfers)
CREATE TABLE public.inventory_reservations (
    id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
    variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    status reservation_status NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT chk_res_quantity_positive CHECK (quantity > 0)
);
CREATE TRIGGER set_reservations_updated_at BEFORE UPDATE ON public.inventory_reservations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_reservations_store_id ON public.inventory_reservations(store_id);
CREATE INDEX idx_reservations_expires_at ON public.inventory_reservations(expires_at);


-- 4. Inventory Serials
CREATE TABLE public.inventory_serials (
    id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
    store_id UUID NOT NULL,
    organization_id UUID NOT NULL,
    variant_id UUID NOT NULL,
    serial_number TEXT NOT NULL,
    status serial_status NOT NULL DEFAULT 'AVAILABLE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Composite FK for org consistency
    FOREIGN KEY (organization_id, variant_id) REFERENCES public.product_variants(organization_id, id) ON DELETE RESTRICT
);
CREATE TRIGGER set_serials_updated_at BEFORE UPDATE ON public.inventory_serials FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enforce serial store org matches variant org
CREATE OR REPLACE FUNCTION public.check_serial_org_match()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    store_org UUID;
BEGIN
    SELECT organization_id INTO store_org FROM public.stores WHERE id = NEW.store_id;
    IF store_org != NEW.organization_id THEN
        RAISE EXCEPTION 'Inventory serial store organization must match product variant organization';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_serial_org_match
    BEFORE INSERT OR UPDATE ON public.inventory_serials
    FOR EACH ROW EXECUTE FUNCTION public.check_serial_org_match();

-- Serial number must be unique per variant across the entire organization.
CREATE UNIQUE INDEX uq_variant_serial ON public.inventory_serials (organization_id, variant_id, serial_number);

CREATE INDEX idx_serials_store_id ON public.inventory_serials(store_id);


-- View for Available Stock calculation
CREATE OR REPLACE VIEW public.vw_inventory_available AS
SELECT 
    b.store_id, 
    b.variant_id, 
    b.on_hand_stock,
    COALESCE(SUM(r.quantity) FILTER (WHERE r.status = 'ACTIVE' AND r.expires_at > NOW()), 0) AS active_reserved_stock,
    b.on_hand_stock - COALESCE(SUM(r.quantity) FILTER (WHERE r.status = 'ACTIVE' AND r.expires_at > NOW()), 0) AS available_stock
FROM public.inventory_balances b
LEFT JOIN public.inventory_reservations r 
    ON b.store_id = r.store_id AND b.variant_id = r.variant_id
GROUP BY b.store_id, b.variant_id, b.on_hand_stock;
