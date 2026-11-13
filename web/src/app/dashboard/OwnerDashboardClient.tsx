'use client'

import React, { useState, useEffect, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DashboardData, DateRangeFilter } from './dashboard.types'
import BusinessHeader from './components/BusinessHeader'
import TodaySnapshotBar from './components/TodaySnapshotBar'
import FinancialOverviewCards from './components/FinancialOverviewCards'
import SalesPerformanceSection from './components/SalesPerformanceSection'
import CustomersToContactToday from './components/CustomersToContactToday'
import InventoryHealthSection from './components/InventoryHealthSection'
import SupplierOverviewSection from './components/SupplierOverviewSection'
import AgriSeasonOverview from './components/AgriSeasonOverview'
import BusinessAssistantInsights from './components/BusinessAssistantInsights'
import { Loader2 } from 'lucide-react'

interface OwnerDashboardClientProps {
  initialData: DashboardData
  currentFilter: DateRangeFilter
  currentStoreId?: string
  currentStart?: string
  currentEnd?: string
}

export default function OwnerDashboardClient({
  initialData,
  currentFilter,
  currentStoreId,
  currentStart,
  currentEnd
}: OwnerDashboardClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [showLoading, setShowLoading] = useState(false)

  // Safety timer: ensures loading overlay never gets stuck permanently
  useEffect(() => {
    if (isPending) {
      setShowLoading(true)
      const timer = setTimeout(() => {
        setShowLoading(false)
      }, 4000)
      return () => clearTimeout(timer)
    } else {
      setShowLoading(false)
    }
  }, [isPending])

  const handleFilterChange = (filter: DateRangeFilter, start?: string, end?: string) => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('filter', filter)
      if (filter === 'custom' && start && end) {
        params.set('start', start)
        params.set('end', end)
      } else {
        params.delete('start')
        params.delete('end')
      }
      router.push(`/dashboard?${params.toString()}`)
    })
  }

  const handleStoreChange = (storeId: string) => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('storeId', storeId)
      router.push(`/dashboard?${params.toString()}`)
    })
  }

  const handleRefresh = () => {
    startTransition(() => {
      router.refresh()
    })
  }

  return (
    <div className="relative space-y-6 max-w-7xl mx-auto pb-12">
      {/* Pending Loading Overlay */}
      {showLoading && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900/80 text-white px-3.5 py-2 rounded-full text-xs font-semibold flex items-center gap-2 shadow-lg backdrop-blur-xs">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
          <span>Refreshing financial metrics...</span>
        </div>
      )}

      {/* 1. Business Header & Date Filters */}
      <BusinessHeader
        profile={initialData.profile}
        activeFilter={currentFilter}
        onFilterChange={handleFilterChange}
        availableStores={initialData.availableStores}
        selectedStoreId={currentStoreId}
        onStoreChange={handleStoreChange}
        customStart={currentStart}
        customEnd={currentEnd}
        periodDisplayLabel={initialData.performance.periodDisplayLabel}
      />

      {/* 2. Business Pulse */}
      <TodaySnapshotBar today={initialData.today} />

      {/* 3. Deterministic AI Assistant Insights */}
      <BusinessAssistantInsights insights={initialData.insights} />

      {/* 4. Financial Overview Cards (8 KPI Cards - Owner & Manager Only) */}
      {initialData.metrics && (
        <FinancialOverviewCards
          metrics={initialData.metrics}
          comparisonLabel={initialData.performance.comparisonLabel}
          periodDisplayLabel={initialData.performance.periodDisplayLabel}
        />
      )}

      {/* 5. Sales Performance & Fair Comparison */}
      <SalesPerformanceSection performance={initialData.performance} />

      {/* 6. Customers to Contact Today (Owner & Manager Only) */}
      {initialData.profile.userRole !== 'CASHIER' && (
        <CustomersToContactToday
          customers={initialData.overdue.customers}
          summary={initialData.overdue.summary}
          shopName={initialData.profile.orgName}
          availableStores={initialData.availableStores}
          defaultStoreId={currentStoreId}
          onPaymentSuccess={handleRefresh}
        />
      )}

      {/* 7. Inventory Health & Batch Expiry Tracking */}
      <InventoryHealthSection inventory={initialData.inventory} />

      {/* 8. Supplier Overview & Payables (Owner Only) */}
      {initialData.profile.userRole === 'OWNER' && initialData.suppliers && (
        <SupplierOverviewSection suppliers={initialData.suppliers} />
      )}

      {/* 9. Agricultural Season Overview & Regional Crops */}
      <AgriSeasonOverview agri={initialData.agri} />
    </div>
  )
}

