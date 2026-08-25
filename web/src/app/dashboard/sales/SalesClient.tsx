'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import ReceiptModal from './ReceiptModal'
import { formatCurrency } from '@/utils/currency'

type Sale = {
  id: string
  created_at: string
  status: string
  grand_total: number
  store_name: string
  customer_name: string
  cashier_name: string
  payment_status: string
  payment_method: string
}

type StoreOption = {
  id: string
  name: string
}

export default function SalesClient({
  sales,
  storeOptions,
  totalCount,
  currentPage,
  limit,
  initialSearch,
  initialStore,
  initialStatus,
  initialFrom,
  initialTo
}: {
  sales: Sale[]
  storeOptions: StoreOption[]
  totalCount: number
  currentPage: number
  limit: number
  initialSearch: string
  initialStore: string
  initialStatus: string
  initialFrom: string
  initialTo: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  
  // Local state for immediate input
  const [search, setSearch] = useState(initialSearch)
  const [storeFilter, setStoreFilter] = useState(initialStore)
  const [statusFilter, setStatusFilter] = useState(initialStatus)
  const [fromDate, setFromDate] = useState(initialFrom)
  const [toDate, setToDate] = useState(initialTo)
  
  // Modal state
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null)

  const updateFilters = (key: string, value: string) => {
    startTransition(() => {
      const url = new URL(window.location.href)
      if (value) {
        url.searchParams.set(key, value)
      } else {
        url.searchParams.delete(key)
      }
      if (key !== 'page') {
        url.searchParams.delete('page') // reset page on filter change
      }
      router.push(url.pathname + url.search)
    })
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    updateFilters('q', search)
  }

  const clearFilters = () => {
    setSearch('')
    setStoreFilter('')
    setStatusFilter('')
    setFromDate('')
    setToDate('')
    startTransition(() => {
      router.push('/dashboard/sales')
    })
  }

  const totalPages = Math.ceil(totalCount / limit)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Sales</h1>
        <p className="text-sm text-gray-500">{totalCount} total sales</p>
      </div>

      <div className="bg-white shadow-sm rounded-lg border border-gray-200">
        <div className="p-4 border-b border-gray-200 space-y-4">
          
          <div className="flex flex-wrap gap-4 items-end">
            <form onSubmit={handleSearch} className="flex-1 min-w-[200px]">
              <label className="block text-xs text-gray-500 mb-1">Search ID or Customer</label>
              <div className="flex">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="UUID or customer name..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-l-md focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                />
                <button type="submit" className="px-4 py-2 bg-gray-100 border border-l-0 border-gray-300 rounded-r-md text-gray-600 hover:bg-gray-200">
                  Search
                </button>
              </div>
            </form>

            <div className="w-40">
              <label className="block text-xs text-gray-500 mb-1">Store</label>
              <select
                value={storeFilter}
                onChange={(e) => {
                  setStoreFilter(e.target.value)
                  updateFilters('store', e.target.value)
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
              >
                <option value="">All Authorized Stores</option>
                {storeOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div className="w-32">
              <label className="block text-xs text-gray-500 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value)
                  updateFilters('status', e.target.value)
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
              >
                <option value="">All Statuses</option>
                <option value="COMPLETED">COMPLETED</option>
                <option value="PENDING">PENDING</option>
                <option value="REFUNDED">REFUNDED</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">From Date</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value)
                    updateFilters('from', e.target.value)
                  }}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                />
              </div>
              <span className="text-gray-500 mt-5">to</span>
              <div>
                <label className="block text-xs text-gray-500 mb-1">To Date</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value)
                    updateFilters('to', e.target.value)
                  }}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                />
              </div>
            </div>

            {(search || storeFilter || statusFilter || fromDate || toDate) && (
              <button onClick={clearFilters} className="px-3 py-2 text-sm text-indigo-600 hover:text-indigo-800">
                Clear Filters
              </button>
            )}
          </div>
          
          {isPending && <div className="text-sm text-gray-500">Updating results...</div>}
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Receipt Ref
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Store
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Payment
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sales.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-sm text-gray-500">
                    No sales found matching your criteria.
                  </td>
                </tr>
              ) : (
                sales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 font-mono" title={sale.id}>
                      {sale.id.split('-')[0]}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(sale.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {sale.store_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {sale.customer_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        sale.payment_status === 'PAID' ? 'bg-green-100 text-green-800' :
                        sale.payment_status === 'REFUNDED' ? 'bg-purple-100 text-purple-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {sale.payment_status}
                      </span>
                      <span className="text-xs text-gray-400 ml-2">{sale.payment_method}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        sale.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                        sale.status === 'REFUNDED' ? 'bg-purple-100 text-purple-800' :
                        sale.status === 'CANCELLED' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {sale.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {formatCurrency(sale.grand_total)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button 
                        onClick={() => setSelectedSaleId(sale.id)}
                        className="text-indigo-600 hover:text-indigo-900 focus:outline-none"
                      >
                        Receipt
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => updateFilters('page', String(currentPage - 1))}
                disabled={currentPage <= 1 || isPending}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400"
              >
                Previous
              </button>
              <button
                onClick={() => updateFilters('page', String(currentPage + 1))}
                disabled={currentPage >= totalPages || isPending}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Showing <span className="font-medium">{Math.min((currentPage - 1) * limit + 1, totalCount)}</span> to <span className="font-medium">{Math.min(currentPage * limit, totalCount)}</span> of <span className="font-medium">{totalCount}</span> results
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                  <button
                    onClick={() => updateFilters('page', String(currentPage - 1))}
                    disabled={currentPage <= 1 || isPending}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:bg-gray-100"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => updateFilters('page', String(currentPage + 1))}
                    disabled={currentPage >= totalPages || isPending}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:bg-gray-100"
                  >
                    Next
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>

      {selectedSaleId && (
        <ReceiptModal saleId={selectedSaleId} onClose={() => setSelectedSaleId(null)} />
      )}
    </div>
  )
}
