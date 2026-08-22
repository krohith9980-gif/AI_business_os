-- Migration 0009: Purchasing Mutations (Supplier management)

CREATE POLICY "Managers and owners insert suppliers"
ON public.suppliers
FOR INSERT
WITH CHECK (
  public.is_org_manager_or_owner(organization_id)
);

CREATE POLICY "Managers and owners update suppliers"
ON public.suppliers
FOR UPDATE
USING (
  public.is_org_manager_or_owner(organization_id)
)
WITH CHECK (
  public.is_org_manager_or_owner(organization_id)
);
