-- Migration 0008: RLS Policies (Authoritative Security)

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_stores ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.variant_price_history ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.inventory_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_serials ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_receipt_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper for Profile Visibility
CREATE OR REPLACE FUNCTION public.can_view_profile(target_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.organization_members om1
        JOIN public.organization_members om2 ON om1.organization_id = om2.organization_id
        WHERE om1.profile_id = auth.uid() AND om2.profile_id = target_profile_id
    ) OR target_profile_id = auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION public.can_view_profile(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_view_profile(UUID) TO authenticated;

-- 1. Profiles
CREATE POLICY "Profiles are visible to self and org members" ON public.profiles FOR SELECT USING (public.can_view_profile(id));
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (id = auth.uid());


-- 2. Organizations
CREATE POLICY "Organizations are visible to members" ON public.organizations FOR SELECT USING (public.is_org_member(id));


-- 3. Organization Members
CREATE POLICY "Members visible to other members" ON public.organization_members FOR SELECT USING (public.is_org_member(organization_id));
-- Note: INSERT/UPDATE handled securely via RPCs


-- 4. Stores & User Stores
CREATE POLICY "Stores visible to org members" ON public.stores FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY "User stores visible to org members" ON public.user_stores FOR SELECT USING (
    public.is_org_member((SELECT organization_id FROM public.stores WHERE id = store_id))
);


-- 5. Product Catalog (Org Level)
CREATE POLICY "Categories visible to org members" ON public.categories FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY "Products visible to org members" ON public.products FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY "Variants visible to org members" ON public.product_variants FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY "Variant history visible to org members" ON public.variant_price_history FOR SELECT USING (
    public.is_org_member((SELECT organization_id FROM public.product_variants WHERE id = variant_id))
);

-- Catalog Mutations (Only Managers/Owners)
CREATE POLICY "Manage categories" ON public.categories FOR INSERT WITH CHECK (public.is_org_manager_or_owner(organization_id));
CREATE POLICY "Manage categories" ON public.categories FOR UPDATE USING (public.is_org_manager_or_owner(organization_id));
CREATE POLICY "Manage products" ON public.products FOR INSERT WITH CHECK (public.is_org_manager_or_owner(organization_id));
CREATE POLICY "Manage products" ON public.products FOR UPDATE USING (public.is_org_manager_or_owner(organization_id));
CREATE POLICY "Manage variants" ON public.product_variants FOR INSERT WITH CHECK (public.is_org_manager_or_owner(organization_id));
CREATE POLICY "Manage variants" ON public.product_variants FOR UPDATE USING (public.is_org_manager_or_owner(organization_id));
-- Deletions are forbidden by soft-delete architecture (is_active)


-- 6. Inventory (Store Level)
CREATE POLICY "Balances visible to store members" ON public.inventory_balances FOR SELECT USING (
    public.is_store_member(store_id) OR public.is_org_owner(organization_id)
);
CREATE POLICY "Movements visible to store members" ON public.inventory_movements FOR SELECT USING (
    public.is_store_member(store_id) OR public.is_org_owner((SELECT organization_id FROM public.stores WHERE id = store_id))
);
CREATE POLICY "Reservations visible to store members" ON public.inventory_reservations FOR SELECT USING (
    public.is_store_member(store_id) OR public.is_org_owner((SELECT organization_id FROM public.stores WHERE id = store_id))
);
CREATE POLICY "Serials visible to store members" ON public.inventory_serials FOR SELECT USING (
    public.is_store_member(store_id) OR public.is_org_owner(organization_id)
);
-- All Inventory mutations occur strictly via SECURITY DEFINER RPCs (record_inventory_movement)


-- 7. Purchasing
CREATE POLICY "Suppliers visible to org members" ON public.suppliers FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY "Supplier products visible to org members" ON public.supplier_products FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY "Supplier price history visible to org members" ON public.supplier_price_history FOR SELECT USING (public.is_org_member(organization_id));

CREATE POLICY "POs visible to store members" ON public.purchase_orders FOR SELECT USING (
    public.is_store_member(store_id) OR public.is_org_manager_or_owner(organization_id)
);
CREATE POLICY "PO items visible to store members" ON public.po_items FOR SELECT USING (
    public.is_store_member((SELECT store_id FROM public.purchase_orders WHERE id = po_id)) OR public.is_org_manager_or_owner(organization_id)
);
CREATE POLICY "Receipts visible to store members" ON public.purchase_receipts FOR SELECT USING (
    public.is_store_member((SELECT store_id FROM public.purchase_orders WHERE id = po_id)) OR public.is_org_manager_or_owner((SELECT organization_id FROM public.purchase_orders WHERE id = po_id))
);
CREATE POLICY "Receipt items visible to store members" ON public.purchase_receipt_items FOR SELECT USING (
    public.is_store_member((SELECT store_id FROM public.purchase_orders WHERE id = receipt_po_id)) OR public.is_org_manager_or_owner((SELECT organization_id FROM public.purchase_orders WHERE id = receipt_po_id))
);

-- Manage Purchasing (Managers/Owners)
CREATE POLICY "Manage POs" ON public.purchase_orders FOR INSERT WITH CHECK (public.is_org_manager_or_owner(organization_id));
CREATE POLICY "Manage POs" ON public.purchase_orders FOR UPDATE USING (public.is_org_manager_or_owner(organization_id));
-- Remaining inserts/updates handled by receiving RPCs


-- 8. Sales (Store Level)
CREATE POLICY "Customers visible to org members" ON public.customers FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY "Cashiers insert customers" ON public.customers FOR INSERT WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "Cashiers update customers" ON public.customers FOR UPDATE USING (public.is_org_member(organization_id));

CREATE POLICY "Sales visible to store members" ON public.sales FOR SELECT USING (
    public.is_store_member(store_id) OR public.is_org_manager_or_owner(organization_id)
);
CREATE POLICY "Sale items visible to store members" ON public.sale_items FOR SELECT USING (
    public.is_store_member((SELECT store_id FROM public.sales WHERE id = sale_id)) OR public.is_org_manager_or_owner(organization_id)
);
CREATE POLICY "Payments visible to store members" ON public.payments FOR SELECT USING (
    public.is_store_member((SELECT store_id FROM public.sales WHERE id = sale_id)) OR public.is_org_manager_or_owner((SELECT organization_id FROM public.sales WHERE id = sale_id))
);
CREATE POLICY "Returns visible to store members" ON public.returns FOR SELECT USING (
    public.is_store_member(store_id) OR public.is_org_manager_or_owner((SELECT organization_id FROM public.stores WHERE id = store_id))
);
CREATE POLICY "Return items visible to store members" ON public.return_items FOR SELECT USING (
    public.is_store_member((SELECT store_id FROM public.returns WHERE id = return_id)) OR public.is_org_manager_or_owner((SELECT organization_id FROM public.stores JOIN public.returns ON returns.store_id = stores.id WHERE returns.id = return_id))
);
-- NOTE: ALL SALES/PAYMENTS/RETURNS INSERTS ARE NOW BLOCKED FOR CLIENTS directly via RLS.
-- They must strictly be created via the `process_sale` SECURITY DEFINER RPC.


-- 9. Audit Logs (Read Only by Owners)
CREATE POLICY "Owners can view audit logs" ON public.audit_logs FOR SELECT USING (
    public.is_org_owner(organization_id)
);
-- Inserts happen entirely via the trigger.
