import React from 'react'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import CollectionsClient from './CollectionsClient'

export const metadata = {
  title: 'Collections | AI Business OS',
  description: 'Collection intelligence and outstanding tracking',
}

export default async function CollectionsPage() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect('/login')
  }

  // 1. Fetch user's authorized organization
  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('profile_id', user.id)
    .eq('is_active', true)
    .limit(1)

  if (!memberships || memberships.length === 0) {
    return <div className="p-8 text-center text-red-500">No active organization found.</div>
  }

  const { organization_id } = memberships[0]

  // 2. Fetch all customers with an outstanding balance
  const { data: customers } = await supabase
    .from('customers')
    .select('id, name, phone_number, village, outstanding_balance, credit_limit')
    .eq('organization_id', organization_id)
    .gt('outstanding_balance', 0)

  const debtors = customers || []

  // 3. Fetch all sales for these customers to compute aging
  let allSales: { id: string, customer_id: string, grand_total: number, due_date: string | null, created_at: string }[] = []
  if (debtors.length > 0) {
    const debtorIds = debtors.map(d => d.id)
    
    // We only need sales that might be unpaid (i.e. we just pull all sales for debtors)
    // In production with huge datasets, we'd use a postgres materialized view or a more bounded query.
    const { data: sales } = await supabase
      .from('sales')
      .select('id, customer_id, grand_total, due_date, created_at')
      .in('customer_id', debtorIds)
      .order('created_at', { ascending: false })
      
    allSales = sales || []
  }

  // 4. Compute Intelligence
  let totalOutstanding = 0
  let totalOverdue = 0
  let totalDueThisWeek = 0
  
  // Aggregate by Village
  const villageStats: Record<string, { customers: number, outstanding: number, overdue: number }> = {}
  
  // Top Overdue customers array
  const overdueCustomersMap: Record<string, number> = {}

  const now = new Date()
  const oneWeekFromNow = new Date(now)
  oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7)

  debtors.forEach(customer => {
    totalOutstanding += Number(customer.outstanding_balance)
    
    const village = customer.village || 'Unknown'
    if (!villageStats[village]) {
      villageStats[village] = { customers: 0, outstanding: 0, overdue: 0 }
    }
    villageStats[village].customers += 1
    villageStats[village].outstanding += Number(customer.outstanding_balance)
    
    let remainingOutstanding = Number(customer.outstanding_balance)
    let customerOverdue = 0
    
    // Find this customer's sales
    const custSales = allSales.filter(s => s.customer_id === customer.id)
    
    // Traverse newest to oldest
    for (const sale of custSales) {
      if (remainingOutstanding <= 0) break
      
      const saleAmount = Number(sale.grand_total)
      if (saleAmount <= 0) continue

      const unpaidPortion = Math.min(saleAmount, remainingOutstanding)
      remainingOutstanding -= unpaidPortion
      
      if (sale.due_date) {
        const dueDate = new Date(sale.due_date)
        if (now > dueDate) {
          customerOverdue += unpaidPortion
          totalOverdue += unpaidPortion
          villageStats[village].overdue += unpaidPortion
        } else if (dueDate <= oneWeekFromNow) {
          totalDueThisWeek += unpaidPortion
        }
      }
    }
    
    if (customerOverdue > 0) {
      overdueCustomersMap[customer.id] = customerOverdue
    }
  })

  // 5. Fetch Collected This Month (from Ledger where type = PAYMENT)
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const { data: paymentsThisMonth } = await supabase
    .from('customer_ledger')
    .select('amount')
    .eq('organization_id', organization_id)
    .eq('transaction_type', 'PAYMENT')
    .gte('created_at', firstDayOfMonth)

  const totalCollectedThisMonth = (paymentsThisMonth || []).reduce((acc, row) => acc + Math.abs(Number(row.amount)), 0)

  // Map Top Overdue Customers
  const topOverdueCustomers = debtors
    .filter(c => overdueCustomersMap[c.id])
    .map(c => ({
      ...c,
      overdue_amount: overdueCustomersMap[c.id]
    }))
    .sort((a, b) => b.overdue_amount - a.overdue_amount)
    .slice(0, 10)

  const villageIntelligence = Object.entries(villageStats)
    .map(([village, stats]) => ({ village, ...stats }))
    .sort((a, b) => b.outstanding - a.outstanding)

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      <CollectionsClient 
        totalOutstanding={totalOutstanding}
        totalOverdue={totalOverdue}
        totalDueThisWeek={totalDueThisWeek}
        totalCollectedThisMonth={totalCollectedThisMonth}
        villageIntelligence={villageIntelligence}
        topOverdueCustomers={topOverdueCustomers}
      />
    </div>
  )
}
