'use client'

import React, { useState, useEffect } from 'react'
import { BusinessProfile, DateRangeFilter } from '../dashboard.types'
import { Store, Calendar, ShieldCheck, ChevronDown, Filter } from 'lucide-react'

interface BusinessHeaderProps {
  profile: BusinessProfile
  activeFilter: DateRangeFilter
  onFilterChange: (filter: DateRangeFilter, start?: string, end?: string) => void
  availableStores: Array<{ id: string; name: string }>
  selectedStoreId?: string
  onStoreChange: (storeId: string) => void
  customStart?: string
  customEnd?: string
  periodDisplayLabel?: string
}

export default function BusinessHeader({
  profile,
  activeFilter,
  onFilterChange,
  availableStores,
  selectedStoreId,
  onStoreChange,
  customStart,
  customEnd,
  periodDisplayLabel
}: BusinessHeaderProps) {
  const [showCustomModal, setShowCustomModal] = useState(false)
  const [localStart, setLocalStart] = useState(customStart || '')
  const [localEnd, setLocalEnd] = useState(customEnd || '')

  useEffect(() => {
    if (customStart) setLocalStart(customStart)
    if (customEnd) setLocalEnd(customEnd)
  }, [customStart, customEnd])

  const filterOptions: Array<{ key: DateRangeFilter; label: string; teLabel: string }> = [
    { key: 'today', label: 'Today', teLabel: 'ఈరోజు' },
    { key: 'yesterday', label: 'Yesterday', teLabel: 'నిన్న' },
    { key: 'this_week', label: 'This Week', teLabel: 'ఈ వారం' },
    { key: 'this_month', label: 'This Month (MTD)', teLabel: 'ఈ నెల' },
    { key: 'last_month', label: 'Last Month', teLabel: 'గత నెల' },
    { key: 'custom', label: 'Custom', teLabel: 'కస్టమ్' }
  ]

  const handleCustomApply = () => {
    if (localStart && localEnd) {
      onFilterChange('custom', localStart, localEnd)
      setShowCustomModal(false)
    }
  }

  const roleBadgeColor = {
    OWNER: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    MANAGER: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    CASHIER: 'bg-amber-100 text-amber-800 border-amber-300'
  }[profile.userRole] || 'bg-gray-100 text-gray-800 border-gray-300'

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 space-y-4">
      {/* Top Row: Business Identity, Role Badge, Store Selector */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
              {profile.orgName}
            </h1>
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${roleBadgeColor}`}>
              <ShieldCheck className="w-3.5 h-3.5" />
              {profile.userRole}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 mt-1 flex flex-wrap items-center gap-2">
            <span>{profile.businessType || 'Fertilizer & Agro Retail'}</span>
            <span>•</span>
            <span>{profile.ownerName}</span>
            <span>•</span>
            <span className="font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
              {profile.currentFinancialPeriod}
            </span>
          </p>
        </div>

        {/* Store Selector */}
        <div className="flex items-center gap-3">
          {availableStores.length > 1 ? (
            <div className="relative inline-block text-left">
              <label htmlFor="store-select" className="sr-only">Select Store</label>
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">
                <Store className="w-4 h-4 text-gray-500" />
                <select
                  id="store-select"
                  value={selectedStoreId || availableStores[0]?.id || ''}
                  onChange={(e) => onStoreChange(e.target.value)}
                  className="bg-transparent border-none text-gray-800 focus:outline-none focus:ring-0 cursor-pointer pr-4"
                >
                  {availableStores.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-gray-400 pointer-events-none -ml-2" />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs sm:text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 font-medium">
              <Store className="w-4 h-4 text-emerald-600" />
              <span>{profile.storeName} ({profile.storeLocation})</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Row: Time Filter Pills */}
      <div className="pt-2 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 w-full sm:w-auto">
          <span className="text-xs font-medium text-gray-500 flex items-center gap-1 mr-1 shrink-0">
            <Filter className="w-3.5 h-3.5 text-gray-400" />
            కాలపరిమితి (Period):
          </span>
          {filterOptions.map((opt) => {
            const isActive = activeFilter === opt.key
            return (
              <button
                key={opt.key}
                onClick={() => {
                  if (opt.key === 'custom') {
                    setShowCustomModal(true)
                  } else {
                    onFilterChange(opt.key)
                  }
                }}
                className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-emerald-700 text-white shadow-sm ring-1 ring-emerald-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:text-gray-900'
                }`}
              >
                <span>{opt.label}</span>
                <span className="text-[10px] ml-1 opacity-80">({opt.teLabel})</span>
              </button>
            )
          })}
        </div>

        {periodDisplayLabel && (
          <div className="text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-2xs">
            <Calendar className="w-3.5 h-3.5 text-emerald-600" />
            <span className="font-semibold">{periodDisplayLabel}</span>
          </div>
        )}
      </div>

      {/* Custom Date Modal */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 max-w-sm w-full p-5 space-y-4">
            <h3 className="text-base font-semibold text-gray-900">Custom Date Range</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Start Date</label>
                <input
                  type="date"
                  value={localStart}
                  onChange={(e) => setLocalStart(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">End Date</label>
                <input
                  type="date"
                  value={localEnd}
                  onChange={(e) => setLocalEnd(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCustomModal(false)}
                className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCustomApply}
                disabled={!localStart || !localEnd}
                className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-lg transition-colors"
              >
                Apply Range
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

