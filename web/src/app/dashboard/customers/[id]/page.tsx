import React from 'react'
import { createClient } from '@/utils/supabase/server'
import { notFound, redirect } from 'next/navigation'
import CustomerLedgerClient from './CustomerLedgerClient'

export const metadata = {
  title: 'Customer Ledger | AI Business OS',
  description: 'View customer ledger and record payments',
}

export default async function CustomerLedgerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createClient()
  const { id } = await params

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect('/login')
  }

  // Fetch active org
  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('profile_id', user.id)
    .eq('is_active', true)
    .limit(1)

  const activeOrgId = memberships?.[0]?.organization_id
  if (!activeOrgId) return notFound()

  // Fetch customer
  const { data: customer } = await supabase
    .from('customers')
    .select('id, name, village, outstanding_balance, phone_number')
    .eq('id', id)
    .eq('organization_id', activeOrgId)
    .single()

  if (!customer) return notFound()

  // Fetch ledger
  const { data: ledger } = await supabase
    .from('customer_ledger')
    .select('*')
    .eq('customer_id', id)
    .order('created_at', { ascending: false })

  // Fetch stores for the payment form
  const { data: stores } = await supabase
    .from('stores')
    .select('id, name')
    .eq('organization_id', activeOrgId)
    .eq('is_active', true)
    .order('name')

  return (
    <CustomerLedgerClient 
      customer={customer} 
      ledger={ledger || []} 
      stores={stores || []}
    />
  )
}
