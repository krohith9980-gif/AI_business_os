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
    .select('id, name, village, outstanding_balance, phone_number, credit_limit')
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

  // Compute Totals
  let totalPurchases = 0
  let totalPayments = 0
  if (ledger) {
    ledger.forEach(tx => {
      if (tx.transaction_type === 'SALE') totalPurchases += Number(tx.amount)
      if (tx.transaction_type === 'PAYMENT') totalPayments += Math.abs(Number(tx.amount))
    })
  }

  // Fetch sales to calculate Aging (FIFO)
  const { data: sales } = await supabase
    .from('sales')
    .select('id, grand_total, due_date, created_at')
    .eq('customer_id', id)
    .order('created_at', { ascending: false })

  const agingBuckets = { '0_30': 0, '31_60': 0, '61_90': 0, '90_plus': 0 }
  let overdueAmount = 0
  let nextDueDate: string | null = null

  if (sales && customer.outstanding_balance > 0) {
    let remainingOutstanding = Number(customer.outstanding_balance)
    const now = new Date()

    // Traverse newest to oldest
    for (const sale of sales) {
      if (remainingOutstanding <= 0) break
      
      const saleAmount = Number(sale.grand_total)
      if (saleAmount <= 0) continue

      const unpaidPortion = Math.min(saleAmount, remainingOutstanding)
      remainingOutstanding -= unpaidPortion

      if (sale.due_date) {
        const dueDate = new Date(sale.due_date)
        const daysDiff = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 3600 * 24))

        if (daysDiff > 0) {
          overdueAmount += unpaidPortion
          if (daysDiff <= 30) agingBuckets['0_30'] += unpaidPortion
          else if (daysDiff <= 60) agingBuckets['31_60'] += unpaidPortion
          else if (daysDiff <= 90) agingBuckets['61_90'] += unpaidPortion
          else agingBuckets['90_plus'] += unpaidPortion
        } else {
          // It's due in the future (or today)
          if (!nextDueDate || new Date(nextDueDate) > dueDate) {
            nextDueDate = sale.due_date
          }
        }
      }
    }
  }

  // Fetch stores for the payment form
  const { data: stores } = await supabase
    .from('stores')
    .select('id, name')
    .eq('organization_id', activeOrgId)
    .eq('is_active', true)
    .order('name')

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      <CustomerLedgerClient 
        customer={customer} 
        ledger={ledger || []} 
        stores={stores || []}
        totalPurchases={totalPurchases}
        totalPayments={totalPayments}
        agingBuckets={agingBuckets}
        overdueAmount={overdueAmount}
        nextDueDate={nextDueDate}
      />
    </div>
  )
}
