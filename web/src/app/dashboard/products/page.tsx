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
    .select('organization_id')
    .eq('profile_id', user.id)
    .eq('is_active', true)
    .limit(1)

  const activeOrgId = memberships?.[0]?.organization_id

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
        product:product_id!inner (
          id,
          name,
          category:category_id (
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
            is_active: v.is_active
        }))
    }
  }

  return (
    <ProductsClient 
      initialProducts={products} 
      categories={categories}
      searchQuery={query}
    />
  )
}
