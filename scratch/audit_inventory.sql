SELECT json_agg(row_to_json(t))
FROM (
  SELECT 
    p.id AS product_id,
    p.name AS product_name,
    p.organization_id,
    v.id AS variant_id,
    v.item_size,
    v.packaging_type,
    v.units_per_pack,
    COALESCE(
      (SELECT SUM(quantity) FROM public.inventory_movements WHERE variant_id = v.id AND movement_type IN ('PURCHASE', 'RETURN_IN', 'ADJUSTMENT_UP')), 
      0
    ) AS total_inbound,
    COALESCE(
      (SELECT SUM(quantity) FROM public.inventory_movements WHERE variant_id = v.id AND movement_type IN ('SALE', 'RETURN_OUT', 'ADJUSTMENT_DOWN', 'WASTE')), 
      0
    ) AS total_outbound,
    COALESCE(b.on_hand_stock, 0) AS actual_balance
  FROM public.products p
  JOIN public.product_variants v ON v.product_id = p.id
  LEFT JOIN public.inventory_balances b ON b.variant_id = v.id
  WHERE p.is_active = true AND v.is_active = true
) t;
