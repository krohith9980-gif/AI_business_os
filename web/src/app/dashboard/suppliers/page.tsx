import React from 'react'
import { createClient } from '@/utils/supabase/server'
import SuppliersClient from './SuppliersClient'

export const metadata = {
  title: 'Suppliers | AI Business OS',
  description: 'Manage suppliers',
}

export default async function SuppliersPage({
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

  // 3. Fetch suppliers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let suppliers: any[] = []
  
  if (activeOrgId) {
    let supabaseQuery = supabase
      .from('suppliers')
      .select('id, name, is_active, created_at, updated_at')
      .eq('organization_id', activeOrgId)
      .eq('is_active', true)
      .order('name', { ascending: true })

    if (query) {
      supabaseQuery = supabaseQuery.or(`name.ilike.%${query}%`)
    }

    const { data } = await supabaseQuery
    if (data) suppliers = data
  }

  return (
    <SuppliersClient 
      initialSuppliers={suppliers} 
      searchQuery={query}
    />
  )
}
