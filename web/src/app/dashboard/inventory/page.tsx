import React from 'react'
import { createClient } from '@/utils/supabase/server'
import InventoryClient, { InventoryItem } from './InventoryClient'

export const metadata = {
  title: 'Inventory | AI Business OS',
  description: 'Manage inventory and stock movements',
}

export default async function InventoryPage() {
  const supabase = await createClient()
  
  // 1. Get auth user
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return <div className="p-4 text-red-600">Authentication error</div>
  }

  // 2. Determine active org
  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('profile_id', user.id)
    .eq('is_active', true)
    .limit(1)

  const activeOrgId = memberships?.[0]?.organization_id

  if (!activeOrgId) {
    return <div className="p-4">No active organization found.</div>
  }

  // 3. Fetch stores for the org (that the user has access to, but RLS handles this mostly)
  // For UI dropdowns, we want to show all stores they can see in this org
  const { data: storesData } = await supabase
    .from('stores')
    .select('id, name')
    .eq('organization_id', activeOrgId)
    .eq('is_active', true)
    .order('name', { ascending: true })

  const stores = storesData || []
  const storeIds = stores.map(s => s.id)

  // 4. Fetch variants for the org
  const { data: variantsData } = await supabase
    .from('product_variants')
    .select(`
      id, sku, tracking_mode,
      product:products (name)
    `)
    .eq('organization_id', activeOrgId)
    .eq('is_active', true)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const variants = (variantsData || []).map((v: any) => ({
    id: v.id,
    sku: v.sku,
    name: v.product?.name || 'Unknown',
    tracking_mode: v.tracking_mode
  }))

  // 5. Fetch Inventory Available View and Balances
  let items: InventoryItem[] = []
  
  if (storeIds.length > 0) {
    // RLS will ensure they only see what they are allowed to see
    const { data: availableData } = await supabase
      .from('vw_inventory_available')
      .select('*')
      .in('store_id', storeIds)

    const { data: balancesData } = await supabase
      .from('inventory_balances')
      .select('store_id, variant_id, incoming_stock')
      .in('store_id', storeIds)

    const balancesMap = new Map((balancesData || []).map(r => [`${r.store_id}_${r.variant_id}`, r]))

    items = (availableData || []).map(row => {
      const key = `${row.store_id}_${row.variant_id}`
      const variant = variants.find(v => v.id === row.variant_id)
      const store = stores.find(s => s.id === row.store_id)
      const balance = balancesMap.get(key)

      return {
        store_id: row.store_id,
        store_name: store?.name || 'Unknown Store',
        variant_id: row.variant_id,
        product_name: variant?.name || 'Unknown Product',
        sku: variant?.sku || 'N/A',
        tracking_mode: variant?.tracking_mode || 'NONE',
        on_hand: row.on_hand_stock || 0,
        incoming: balance?.incoming_stock || 0,
        reserved: row.active_reserved_stock || 0,
        available: row.available_stock || 0
      }
    })
  }

  return (
    <InventoryClient 
      items={items} 
      stores={stores} 
      variants={variants} 
    />
  )
}
