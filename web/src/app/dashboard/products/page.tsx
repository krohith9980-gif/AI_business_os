import React from 'react'
import { createClient } from '@/utils/supabase/server'
import ProductsClient from './ProductsClient'

export const metadata = {
  title: 'Products | AI Business OS',
  description: 'Manage products and variants',
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const supabase = await createClient()
  
  // 1. Get auth user
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    return <div className="p-4 text-red-600">Authentication error</div>
  }

  // Await searchParams as per Next.js 15+ best practices
  const resolvedParams = await searchParams
  const query = resolvedParams.q || ''

  // 2. Determine active org
  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('profile_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)

  const activeOrgId = memberships?.[0]?.organization_id
  const role = memberships?.[0]?.role
  
  // 3. Fetch stores
  let storesQuery = supabase
    .from('stores')
    .select('id, name')
    .eq('organization_id', activeOrgId)
    .eq('is_active', true)

  if (role !== 'OWNER' && role !== 'MANAGER') {
    const { data: userStores } = await supabase
      .from('user_stores')
      .select('store_id')
      .eq('profile_id', user.id)
    const storeIds = userStores?.map(us => us.store_id) || []
    if (storeIds.length > 0) {
      storesQuery = storesQuery.in('id', storeIds)
    } else {
      storesQuery = storesQuery.in('id', ['00000000-0000-0000-0000-000000000000']) 
    }
  }

  const { data: stores } = await storesQuery

  // 3. Fetch categories for modal
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let categories: any[] = []
  if (activeOrgId) {
    const { data: catData } = await supabase
      .from('categories')
      .select('id, name')
      .eq('organization_id', activeOrgId)
      .eq('is_active', true)
      .order('name', { ascending: true })
    if (catData) categories = catData
  }

  // 4. Fetch products and their variants
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let products: any[] = []
  
  if (activeOrgId) {
    // We will query product_variants and join products and categories.
    let supabaseQuery = supabase
      .from('product_variants')
      .select(`
        id,
        sku,
        purchase_cost,
        selling_price,
        tracking_mode,
        is_active,
        unit_of_measure,
        packaging_type,
        units_per_pack,
        product:products!inner (
          id,
          name,
          category:categories (
            id,
            name
          )
        )
      `)
      .eq('organization_id', activeOrgId)
      .order('created_at', { ascending: false })

    if (query) {
      // filtering by SKU
      supabaseQuery = supabaseQuery.ilike('sku', `%${query}%`)
    }

    const { data, error } = await supabaseQuery
    if (error) console.error('Error fetching variants', error)
    
    if (data) {
        // Map it to a flat structure for the client
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        products = data.map((v: any) => ({
            id: v.id,
            product_id: v.product?.id,
            name: v.product?.name || 'Unknown',
            sku: v.sku,
            category_name: v.product?.category?.name || 'Uncategorized',
            purchase_cost: v.purchase_cost,
            selling_price: v.selling_price,
            tracking_mode: v.tracking_mode,
            is_active: v.is_active,
            unit_of_measure: v.unit_of_measure,
            packaging_type: v.packaging_type,
            units_per_pack: v.units_per_pack
        }))
    }
  }

  // Fetch inventory for the stores
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let inventory: any[] = []
  if (stores && stores.length > 0) {
    const storeIds = stores.map(s => s.id)
    const { data: invData } = await supabase
      .from('vw_inventory_available')
      .select('store_id, variant_id, available_stock')
      .in('store_id', storeIds)
      
    if (invData) inventory = invData
  }

  return (
    <ProductsClient 
      initialProducts={products} 
      categories={categories}
      stores={stores || []}
      inventory={inventory}
      searchQuery={query}
      role={role}
    />
  )
}
