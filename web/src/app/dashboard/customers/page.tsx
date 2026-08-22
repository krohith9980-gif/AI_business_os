import React from 'react'
import { createClient } from '@/utils/supabase/server'
import CustomersClient from './CustomersClient'

export const metadata = {
  title: 'Customers | AI Business OS',
  description: 'Manage customers',
}

export default async function CustomersPage({
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

  // 3. Fetch customers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let customers: any[] = []
  
  if (activeOrgId) {
    let supabaseQuery = supabase
      .from('customers')
      .select('id, name, email, phone_number, village, outstanding_balance')
      .eq('organization_id', activeOrgId)
      .eq('is_active', true)
      .order('name', { ascending: true })

    if (query) {
      supabaseQuery = supabaseQuery.or(`name.ilike.%${query}%,email.ilike.%${query}%,phone_number.ilike.%${query}%,village.ilike.%${query}%`)
    }

    const { data } = await supabaseQuery
    if (data) customers = data
  }

  return (
    <CustomersClient 
      initialCustomers={customers} 
      searchQuery={query}
    />
  )
}
