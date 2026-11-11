import React from 'react'
import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { fetchDashboardData } from './dashboard.data'
import { DateRangeFilter } from './dashboard.types'
import OwnerDashboardClient from './OwnerDashboardClient'
import { AlertCircle, RefreshCw } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Owner Dashboard 2.0 | VyaparOS',
  description: 'AI-Powered Business Operating System for Fertilizer & Agricultural Retail',
}

interface PageProps {
  searchParams: Promise<{
    filter?: string
    storeId?: string
    start?: string
    end?: string
  }>
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const supabase = await createClient()

  // 1. Authenticate user
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect('/login')
  }

  // 2. Resolve URL query searchParams
  const resolvedParams = await searchParams
  const filter = (resolvedParams.filter as DateRangeFilter) || 'this_month'
  const storeId = resolvedParams.storeId || undefined
  const start = resolvedParams.start || undefined
  const end = resolvedParams.end || undefined

  // 3. Server-side data aggregation with strict RBAC enforcement
  const dashboardResult = await fetchDashboardData(
    supabase,
    user.id,
    filter,
    start,
    end,
    storeId
  )

  if ('error' in dashboardResult) {
    return (
      <div className="max-w-xl mx-auto my-12 p-6 bg-red-50 border border-red-200 rounded-xl space-y-4">
        <div className="flex items-center gap-3 text-red-800">
          <AlertCircle className="w-6 h-6 text-red-600 shrink-0" />
          <h2 className="text-base font-bold">Unable to Load Dashboard Data</h2>
        </div>
        <p className="text-xs text-red-700 leading-relaxed">
          {dashboardResult.error}
        </p>
        <div className="pt-2">
          <a
            href="/dashboard"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry Loading</span>
          </a>
        </div>
      </div>
    )
  }

  return (
    <OwnerDashboardClient
      initialData={dashboardResult}
      currentFilter={filter}
      currentStoreId={storeId}
      currentStart={start}
      currentEnd={end}
    />
  )
}
