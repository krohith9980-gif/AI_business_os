import React from 'react'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import SalesClient from './SalesClient'

export const metadata = {
  title: 'Sales | AI Business OS',
  description: 'View and manage sales',
}

export default async function SalesPage({
  searchParams
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect('/login')
  }

  // Await search params
  const sp = await searchParams
  
  const page = typeof sp.page === 'string' ? parseInt(sp.page, 10) : 1
  const limit = 20
  const offset = (Math.max(1, page) - 1) * limit
  
  const search = typeof sp.q === 'string' ? sp.q : ''
  const storeFilter = typeof sp.store === 'string' ? sp.store : ''
  const statusFilter = typeof sp.status === 'string' ? sp.status : ''
  const fromDate = typeof sp.from === 'string' ? sp.from : ''
  const toDate = typeof sp.to === 'string' ? sp.to : ''

  // 1. Fetch authorized stores for filter dropdown
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

  let storesQuery = supabase
    .from('stores')
    .select('id, name')
    .eq('organization_id', organization_id)
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
  const storeOptions = stores || []

  // 2. Fetch Sales with filtering
  let selectString = `
    id,
    created_at,
    status,
    grand_total,
    store_id,
    stores ( name ),
    profiles ( full_name ),
    payments ( status, method )
  `
  
  if (search && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(search)) {
    // If searching by customer name, force inner join to filter sales
    selectString += `, customers!inner ( name, phone_number )`
  } else {
    // Left join for walk-ins
    selectString += `, customers ( name, phone_number )`
  }

  let salesQuery = supabase
    .from('sales')
    .select(selectString, { count: 'exact' })
    .eq('organization_id', organization_id)

  if (storeFilter) {
    salesQuery = salesQuery.eq('store_id', storeFilter)
  }
  
  if (statusFilter) {
    salesQuery = salesQuery.eq('status', statusFilter)
  }
  
  if (fromDate) {
    salesQuery = salesQuery.gte('created_at', `${fromDate}T00:00:00.000Z`)
  }
  
  if (toDate) {
    salesQuery = salesQuery.lte('created_at', `${toDate}T23:59:59.999Z`)
  }

  if (search) {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(search)
    if (isUUID) {
      salesQuery = salesQuery.eq('id', search)
    } else {
      salesQuery = salesQuery.ilike('customers.name', `%${search}%`)
    }
  }

  salesQuery = salesQuery
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  const { data: sales, count } = await salesQuery

  // Process data for the client
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formattedSales = ((sales as any[]) || []).map((s: any) => {
    // Determine overall payment status and method from the payments array
    let paymentStatus = 'PENDING'
    let paymentMethod = 'UNKNOWN'
    
    const sPayments = s.payments
    
    if (sPayments && sPayments.length > 0) {
      if (sPayments.length > 1) {
        paymentMethod = 'SPLIT'
      } else {
        paymentMethod = sPayments[0].method
      }
      
      const allPaid = sPayments.every((p: { status: string }) => p.status === 'PAID')
      const anyRefunded = sPayments.some((p: { status: string }) => p.status === 'REFUNDED')
      
      if (anyRefunded) paymentStatus = 'REFUNDED'
      else if (allPaid) paymentStatus = 'PAID'
      else paymentStatus = 'PARTIALLY_PAID' // simplification
    }

    const sStores = s.stores as { name: string } | null
    const sCustomers = s.customers as { name: string } | null
    const sProfiles = s.profiles as { full_name: string } | null

    return {
      id: s.id,
      created_at: s.created_at,
      status: s.status,
      grand_total: s.grand_total,
      store_name: sStores?.name || 'Unknown Store',
      customer_name: sCustomers?.name || 'Walk-in',
      cashier_name: sProfiles?.full_name || 'Unknown Cashier',
      payment_status: paymentStatus,
      payment_method: paymentMethod
    }
  })

  return (
    <SalesClient 
      sales={formattedSales}
      storeOptions={storeOptions}
      totalCount={count || 0}
      currentPage={page}
      limit={limit}
      initialSearch={search}
      initialStore={storeFilter}
      initialStatus={statusFilter}
      initialFrom={fromDate}
      initialTo={toDate}
    />
  )
}
