'use client'

import React from 'react'
import { formatCurrency } from '@/utils/currency'
import Link from 'next/link'

type TopCustomer = {
  id: string
  name: string
  phone_number: string | null
  village: string | null
  outstanding_balance: number
  overdue_amount: number
}

type VillageStat = {
  village: string
  customers: number
  outstanding: number
  overdue: number
}

export default function CollectionsClient({
  totalOutstanding,
  totalOverdue,
  totalDueThisWeek,
  totalCollectedThisMonth,
  villageIntelligence,
  topOverdueCustomers
}: {
  totalOutstanding: number
  totalOverdue: number
  totalDueThisWeek: number
  totalCollectedThisMonth: number
  villageIntelligence: VillageStat[]
  topOverdueCustomers: TopCustomer[]
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Collection Dashboard</h1>
          <p className="text-sm text-gray-500">Track and manage outstanding receivables.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">Total Outstanding</dt>
            <dd className="mt-1 text-3xl font-bold text-gray-900">
              {formatCurrency(totalOutstanding)}
            </dd>
          </div>
        </div>
        
        <div className="bg-red-50 overflow-hidden shadow-sm rounded-lg border border-red-200">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-red-800 truncate">Total Overdue</dt>
            <dd className="mt-1 text-3xl font-bold text-red-700">
              {formatCurrency(totalOverdue)}
            </dd>
          </div>
        </div>

        <div className="bg-yellow-50 overflow-hidden shadow-sm rounded-lg border border-yellow-200">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-yellow-800 truncate">Due This Week</dt>
            <dd className="mt-1 text-3xl font-bold text-yellow-700">
              {formatCurrency(totalDueThisWeek)}
            </dd>
          </div>
        </div>

        <div className="bg-green-50 overflow-hidden shadow-sm rounded-lg border border-green-200">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-green-800 truncate">Collected This Month</dt>
            <dd className="mt-1 text-3xl font-bold text-green-700">
              {formatCurrency(totalCollectedThisMonth)}
            </dd>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Overdue Customers */}
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden flex flex-col">
          <div className="px-4 py-5 sm:px-6 border-b border-gray-200 bg-gray-50">
            <h3 className="text-lg leading-6 font-medium text-gray-900">Top Overdue Customers</h3>
          </div>
          <div className="flex-1 overflow-auto">
            <ul className="divide-y divide-gray-200">
              {topOverdueCustomers.length === 0 ? (
                <li className="px-6 py-12 text-center text-sm text-gray-500">
                  No overdue customers found.
                </li>
              ) : (
                topOverdueCustomers.map((c) => (
                  <li key={c.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                    <Link href={`/dashboard/customers/${c.id}`} className="block">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-indigo-600 truncate">{c.name}</p>
                          <p className="text-xs text-gray-500">{c.village || 'Unknown village'} • {c.phone_number}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-red-600">{formatCurrency(c.overdue_amount)}</p>
                          <p className="text-xs text-gray-500 truncate">of {formatCurrency(c.outstanding_balance)} total</p>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>

        {/* Village Intelligence */}
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden flex flex-col">
          <div className="px-4 py-5 sm:px-6 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
            <h3 className="text-lg leading-6 font-medium text-gray-900">Village Intelligence</h3>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
              {villageIntelligence.length} Villages
            </span>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-white">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Village</th>
                  <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Debtors</th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Outstanding</th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-red-500 uppercase tracking-wider">Overdue</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {villageIntelligence.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-sm text-gray-500">
                      No village data found.
                    </td>
                  </tr>
                ) : (
                  villageIntelligence.map((v, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {v.village}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                        {v.customers}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                        {formatCurrency(v.outstanding)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-red-600">
                        {v.overdue > 0 ? formatCurrency(v.overdue) : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
