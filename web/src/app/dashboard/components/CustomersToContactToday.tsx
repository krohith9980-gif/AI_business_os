'use client'

import React, { useState } from 'react'
import { OverdueCustomer, OverdueSummary } from '../dashboard.types'
import { Phone, MessageSquare, CreditCard, Search, MapPin, AlertTriangle, CheckCircle2 } from 'lucide-react'
import RecordPaymentModal from './RecordPaymentModal'

interface CustomersToContactTodayProps {
  customers: OverdueCustomer[]
  summary: OverdueSummary
  shopName: string
  availableStores: Array<{ id: string; name: string }>
  defaultStoreId?: string
  onPaymentSuccess?: () => void
}

export default function CustomersToContactToday({
  customers,
  summary,
  shopName,
  availableStores,
  defaultStoreId,
  onPaymentSuccess
}: CustomersToContactTodayProps) {
  const [selectedVillage, setSelectedVillage] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [selectedCustomerForPayment, setSelectedCustomerForPayment] = useState<OverdueCustomer | null>(null)

  // Filter customers by village and search query
  const filteredCustomers = customers.filter(c => {
    const matchesVillage = selectedVillage === 'all' || (c.village && c.village.trim() === selectedVillage)
    const matchesSearch = !searchTerm ||
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.phone && c.phone.includes(searchTerm)) ||
      (c.village && c.village.toLowerCase().includes(searchTerm.toLowerCase()))
    return matchesVillage && matchesSearch
  })

  const getUrgencyBadge = (days: number) => {
    if (days >= 30) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 border border-red-200">
          <AlertTriangle className="w-3 h-3" />
          <span>అత్యవసరం ({days}d)</span>
        </span>
      )
    }
    if (days > 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
          <span>గడువు ముగిసింది ({days}d)</span>
        </span>
      )
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-700">
        బాకీ ఉంది
      </span>
    )
  }

  const buildWhatsAppLink = (c: OverdueCustomer) => {
    if (!c.phone) return '#'
    // Clean phone number: remove non-digits
    let cleanPhone = c.phone.replace(/\D/g, '')
    if (cleanPhone.length === 10) cleanPhone = `91${cleanPhone}`

    const dueDateStr = c.oldestDueDate ? new Date(c.oldestDueDate).toLocaleDateString('en-IN') : 'ఇటీవల'
    const message = `నమస్కారం ${c.name} గారు, ${shopName} నుంచి.\nమీ వ్యవసాయ ఎరువులు/పురుగుమందుల బిల్లు బాకీ మొత్తం ₹${c.pendingAmount.toLocaleString('en-IN')} చెల్లింపు గడువు (${dueDateStr}) ముగిసింది.\nదయచేసి మీ వీలు చూసుకుని దుకాణంలో చెల్లించగలరు.\nధన్యవాదాలు! - ${shopName}`

    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
  }

  return (
    <div id="overdue-section" className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-gray-100 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base sm:text-lg font-bold text-gray-900">
              Customers to Contact Today (నేడు సంప్రదించవలసిన రైతులు)
            </h2>
            <span className="bg-red-100 text-red-800 text-xs font-black px-2 py-0.5 rounded-full">
              {summary.totalOverdueCount} Overdue
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Prioritized by days overdue. Collect receivables directly into store sub-ledger.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Village Filter */}
          {summary.allVillages.length > 0 && (
            <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-700">
              <MapPin className="w-3.5 h-3.5 text-gray-400" />
              <select
                value={selectedVillage}
                onChange={(e) => setSelectedVillage(e.target.value)}
                className="bg-transparent border-none text-gray-800 focus:outline-none cursor-pointer pr-2 font-medium"
              >
                <option value="all">All Villages (అన్ని ఊర్లు)</option>
                {summary.allVillages.map(v => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search farmer or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="text-xs pl-8 pr-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 w-44 sm:w-52"
            />
          </div>
        </div>
      </div>

      {/* Highlights Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-red-50/50 p-3.5 rounded-lg border border-red-100">
        <div>
          <span className="text-[11px] text-gray-500">Total Overdue Debt</span>
          <div className="text-base sm:text-lg font-black text-red-700">
            ₹{summary.totalOverdueAmount.toLocaleString('en-IN')}
          </div>
          <span className="text-[10px] text-red-600">మొత్తం గడువు ముగిసిన బాకీ</span>
        </div>
        <div>
          <span className="text-[11px] text-gray-500">Overdue Farmers</span>
          <div className="text-base sm:text-lg font-bold text-gray-900">
            {summary.totalOverdueCount}
          </div>
          <span className="text-[10px] text-gray-500">రైతుల సంఖ్య</span>
        </div>
        <div>
          <span className="text-[11px] text-gray-500">Highest Pending</span>
          <div className="text-xs sm:text-sm font-bold text-gray-900 truncate">
            {summary.highestOutstanding ? `${summary.highestOutstanding.name} (₹${summary.highestOutstanding.pendingAmount.toLocaleString('en-IN')})` : '--'}
          </div>
          <span className="text-[10px] text-gray-500">గరిష్ట బాకీదారుడు</span>
        </div>
        <div>
          <span className="text-[11px] text-gray-500">Longest Overdue</span>
          <div className="text-xs sm:text-sm font-bold text-red-700 truncate">
            {summary.mostOverdue ? `${summary.mostOverdue.name} (${summary.mostOverdue.daysOverdue} days)` : '--'}
          </div>
          <span className="text-[10px] text-red-600">అత్యధిక రోజుల బాకీ</span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
          <thead className="bg-gray-50 text-gray-600 uppercase font-semibold text-[11px] tracking-wider">
            <tr>
              <th scope="col" className="px-4 py-3">Farmer / Customer (రైతు పేరు)</th>
              <th scope="col" className="px-4 py-3">Village (ఊరు)</th>
              <th scope="col" className="px-4 py-3">Phone (ఫోన్)</th>
              <th scope="col" className="px-4 py-3 text-right">Overdue Amount (బాకీ)</th>
              <th scope="col" className="px-4 py-3">Oldest Due Date</th>
              <th scope="col" className="px-4 py-3">Urgency (స్థితి)</th>
              <th scope="col" className="px-4 py-3 text-center">Actions (చర్యలు)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {filteredCustomers.length > 0 ? (
              filteredCustomers.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50/80 transition-colors">
                  <td className="px-4 py-3 font-semibold text-gray-900">
                    <div>{c.name}</div>
                    {c.creditLimit && (
                      <span className="text-[10px] text-gray-400 font-normal">
                        Limit: ₹{c.creditLimit.toLocaleString('en-IN')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.village || <span className="text-gray-400">--</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-600">
                    {c.phone || <span className="text-gray-400">No Phone</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-black text-amber-900">
                    ₹{c.pendingAmount.toLocaleString('en-IN')}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.oldestDueDate ? new Date(c.oldestDueDate).toLocaleDateString('en-IN') : '--'}
                  </td>
                  <td className="px-4 py-3">
                    {getUrgencyBadge(c.daysOverdue)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1.5">
                      {/* Call Button */}
                      {c.phone ? (
                        <a
                          href={`tel:${c.phone}`}
                          title="Call Farmer"
                          className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                        >
                          <Phone className="w-3.5 h-3.5" />
                        </a>
                      ) : (
                        <span className="p-1.5 rounded-lg bg-gray-100 text-gray-300">
                          <Phone className="w-3.5 h-3.5" />
                        </span>
                      )}

                      {/* WhatsApp Button */}
                      {c.phone ? (
                        <a
                          href={buildWhatsAppLink(c)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Send WhatsApp Reminder"
                          className="p-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </a>
                      ) : (
                        <span className="p-1.5 rounded-lg bg-gray-100 text-gray-300">
                          <MessageSquare className="w-3.5 h-3.5" />
                        </span>
                      )}

                      {/* Record Payment Button */}
                      <button
                        onClick={() => setSelectedCustomerForPayment(c)}
                        title="Record Payment in Sub-Ledger"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-700 text-white font-bold text-[11px] hover:bg-emerald-800 transition-colors shadow-xs"
                      >
                        <CreditCard className="w-3 h-3" />
                        <span>Pay (వసూలు)</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-1 opacity-70" />
                  <p className="font-semibold text-gray-700">No Overdue Customers</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    All farmers are currently within agreed credit terms or fully paid.
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Record Payment Modal */}
      <RecordPaymentModal
        customer={selectedCustomerForPayment}
        isOpen={Boolean(selectedCustomerForPayment)}
        onClose={() => setSelectedCustomerForPayment(null)}
        availableStores={availableStores}
        defaultStoreId={defaultStoreId}
        onSuccess={onPaymentSuccess}
      />
    </div>
  )
}

