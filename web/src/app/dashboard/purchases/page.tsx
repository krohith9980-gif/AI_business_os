import React from 'react'
import { createClient } from '@/utils/supabase/server'
import PurchasesClient from './PurchasesClient'
import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Purchases | AI Business OS',
  description: 'Manage purchase orders',
}

export default async function PurchasesPage() {
  const supabase = await createClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect('/login')
  }

  // 1. Get user's active store and organization
  const { data: userStore } = await supabase
    .from('user_stores')
    .select('store_id, stores(organization_id)')
    .eq('profile_id', user.id)
    .eq('is_active', true)
    .single()

  if (!userStore) {
    return <div className="p-4 text-red-600">No active store assigned to your profile. Please contact an administrator.</div>
  }

  const storeId = userStore.store_id
  // Need to safely extract organization_id
  const organizationId = Array.isArray(userStore.stores) ? userStore.stores[0]?.organization_id : (userStore.stores as any)?.organization_id

  // 2. Fetch recent purchases
  const { data: purchases } = await supabase
    .from('purchase_orders')
    .select(`
      id,
      status,
      created_at,
      grand_total,
      payment_status,
      amount_paid,
      po_items (
        id,
        quantity_ordered,
        purchase_cost
      ),
      suppliers (
        id,
        name
      )
    `)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(50)

  // 3. Fetch active suppliers
  const { data: suppliers } = await supabase
    .from('suppliers')
    .select('id, name')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('name')

  // 4. Fetch active product variants
  const { data: variants } = await supabase
    .from('product_variants')
    .select(`
      id,
      sku,
      selling_price,
      product:products (
        name
      )
    `)
    .eq('organization_id', organizationId)
    .eq('is_active', true)

  const formattedPurchases = purchases?.map((po: any) => {
    // Fallback for older purchases where grand_total might be 0
    let total = po.grand_total
    if (!total || total === 0) {
      total = po.po_items?.reduce((sum: number, item: any) => sum + (item.quantity_ordered * item.purchase_cost), 0) || 0
    }

    return {
      id: po.id,
      status: po.status,
      payment_status: po.payment_status || 'PENDING',
      created_at: po.created_at,
      supplier_name: po.suppliers?.name || 'Unknown Supplier',
      total
    }
  }) || []

  return (
    <PurchasesClient 
      initialPurchases={formattedPurchases} 
      suppliers={suppliers || []} 
      variants={variants || []}
      storeId={storeId}
    />
  )
}
