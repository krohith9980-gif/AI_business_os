'use client'

import React from 'react'
import { SupplierOverview } from '../dashboard.types'
import { Truck, Phone, Lock, ExternalLink } from 'lucide-react'
import Link from 'next/link'

interface SupplierOverviewSectionProps {
  suppliers: SupplierOverview
}

export default function SupplierOverviewSection({
  suppliers
}: SupplierOverviewSectionProps) {
  if (suppliers.totalSupplierPayables === null) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-gray-100 text-gray-500">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">
              Supplier Payables (సరఫరాదారుల బాకీలు)
            </h3>
            <p className="text-xs text-gray-500">
              Financial payables to manufacturers are restricted to Business Owners.
            </p>
          </div>
        </div>
        <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
          Owner Confidential
        </span>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-gray-100 gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-rose-700" />
            <h2 className="text-base sm:text-lg font-bold text-gray-900">
              Supplier Payables & Accounts (సరఫరాదారుల బాకీలు)
            </h2>
            <span className="bg-rose-100 text-rose-800 text-xs font-bold px-2 py-0.5 rounded-full">
              {suppliers.activeSupplierCount} Active Suppliers
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Verified supplier sub-ledger balances for fertilizer companies and distributors.
          </p>
        </div>

        <Link
          href="/dashboard/purchases"
          className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-800 hover:underline"
        >
          <span>Manage Purchase Invoices</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Highlights Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-rose-50/40 p-3.5 rounded-lg border border-rose-100">
        <div>
          <span className="text-[11px] text-gray-500">Total Supplier Payables</span>
          <div className="text-lg sm:text-xl font-black text-rose-800">
            ₹{suppliers.totalSupplierPayables.toLocaleString('en-IN')}
          </div>
          <span className="text-[10px] text-rose-700">మొత్తం చెల్లించవలసిన బాకీ</span>
        </div>
        <div>
          <span className="text-[11px] text-gray-500">Active Supply Accounts</span>
          <div className="text-lg sm:text-xl font-bold text-gray-900">
            {suppliers.activeSupplierCount}
          </div>
          <span className="text-[10px] text-gray-500">యాక్టివ్ కంపెనీలు</span>
        </div>
        <div>
          <span className="text-[11px] text-gray-500">Highest Outstanding Payee</span>
          <div className="text-xs sm:text-sm font-bold text-gray-900 truncate">
            {suppliers.suppliers.length > 0
              ? [...suppliers.suppliers].sort((a, b) => b.outstandingBalance - a.outstandingBalance)[0]?.name
              : '--'}
          </div>
          <span className="text-[10px] text-gray-500">ఎక్కువ బాకీ ఉన్న కంపెనీ</span>
        </div>
      </div>

      {/* Supplier List */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
          <thead className="bg-gray-50 text-gray-600 uppercase font-semibold text-[11px] tracking-wider">
            <tr>
              <th scope="col" className="px-4 py-3">Supplier / Company (కంపెనీ పేరు)</th>
              <th scope="col" className="px-4 py-3">Phone</th>
              <th scope="col" className="px-4 py-3 text-right">Outstanding Payable (బాకీ మొత్తం)</th>
              <th scope="col" className="px-4 py-3 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {suppliers.suppliers.length > 0 ? (
              suppliers.suppliers.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50/80 transition-colors">
                  <td className="px-4 py-3 font-semibold text-gray-900">
                    {s.name}
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-600">
                    {s.phone ? (
                      <a href={`tel:${s.phone}`} className="flex items-center gap-1 text-emerald-700 hover:underline">
                        <Phone className="w-3 h-3" />
                        <span>{s.phone}</span>
                      </a>
                    ) : (
                      <span className="text-gray-400">--</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-black text-rose-900">
                    ₹{s.outstandingBalance.toLocaleString('en-IN')}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      s.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {s.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                  No supplier balances recorded.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

