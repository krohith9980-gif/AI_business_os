import React from 'react'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import POSClient from './POSClient'

export const metadata = {
  title: 'POS | AI Business OS',
  description: 'Point of Sale workspace',
}

export default async function POSPage() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect('/login')
  }

  // 1. Fetch user's authorized stores
  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('profile_id', user.id)
    .eq('is_active', true)
    .limit(1)

  if (!memberships || memberships.length === 0) {
    return <div className="p-8 text-center text-red-500">No active organization found.</div>
  }

  const { organization_id, role } = memberships[0]

  // If Owner/Manager, they can see all stores in org. Otherwise, only assigned stores.
  let storesQuery = supabase
    .from('stores')
    .select('id, name')
    .eq('organization_id', organization_id)
    .eq('is_active', true)

  if (role !== 'OWNER' && role !== 'MANAGER') {
    // For Cashiers, join with user_stores
    const { data: userStores } = await supabase
      .from('user_stores')
      .select('store_id')
      .eq('profile_id', user.id)
    
    const storeIds = userStores?.map(us => us.store_id) || []
    if (storeIds.length > 0) {
      storesQuery = storesQuery.in('id', storeIds)
    } else {
      // no stores assigned
      storesQuery = storesQuery.in('id', ['00000000-0000-0000-0000-000000000000']) 
    }
  }

  const { data: stores } = await storesQuery
  
  if (!stores || stores.length === 0) {
    return <div className="p-8 text-center text-red-500">No stores assigned to your profile.</div>
  }

  // 2. Fetch Customers for this org
  const { data: customers } = await supabase
    .from('customers')
    .select('id, name, phone_number, email')
    .eq('organization_id', organization_id)
    .eq('is_active', true)

  // 3. Fetch Products and Variants for this org
  const { data: variantsRaw } = await supabase
    .from('product_variants')
    .select(`
      id,
      name,
      sku,
      selling_price,
      product_id,
      products (name)
    `)
    .eq('organization_id', organization_id)
    .eq('is_active', true)
    
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const variants = (variantsRaw || []).map((v: any) => ({
    id: v.id,
    productName: Array.isArray(v.products) ? v.products[0]?.name : (v.products?.name || ''),
    variantName: v.name || '',
    sku: v.sku,
    selling_price: v.selling_price
  }))

  return (
    <POSClient 
      stores={stores} 
      customers={customers || []} 
      variants={variants}
    />
  )
}
