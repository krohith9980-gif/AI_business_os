'use client'

import React, { useState, useTransition } from 'react'
import { recordCustomerPayment } from './actions'
import { formatCurrency } from '@/utils/currency'

type LedgerTransaction = {
  id: string
  transaction_type: 'SALE' | 'PAYMENT' | 'RETURN' | 'ADJUSTMENT'
  amount: number
  balance_after: number
  notes: string | null
  created_at: string
}

type Customer = {
  id: string
  name: string
  village: string | null
  outstanding_balance: number
  phone_number: string | null
  credit_limit: number | null
}

type Store = {
  id: string
  name: string
}

export default function CustomerLedgerClient({
  customer,
  ledger,
  stores,
  totalPurchases,
  totalPayments,
  agingBuckets,
  overdueAmount,
  nextDueDate
}: {
  customer: Customer
  ledger: LedgerTransaction[]
  stores: Store[]
  totalPurchases: number
  totalPayments: number
  agingBuckets: { '0_30': number, '31_60': number, '61_90': number, '90_plus': number }
  overdueAmount: number
  nextDueDate: string | null
}) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    formData.append('customer_id', customer.id)
    
    // Prevent overpayment on frontend
    const amountStr = formData.get('amount') as string
    const amount = parseFloat(amountStr)
    if (amount > customer.outstanding_balance) {
      setError(`Payment amount (${formatCurrency(amount)}) cannot exceed current outstanding balance (${formatCurrency(customer.outstanding_balance)})`)
      return
    }
    
    startTransition(async () => {
      const result = await recordCustomerPayment(formData)
      if (result?.error) {
        setError(result.error)
      } else if (result?.success) {
        setIsModalOpen(false)
        setError(null)
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
          <p className="text-sm text-gray-500">{customer.village || 'No village'} • {customer.phone_number || 'No phone'}</p>
        </div>
        <div className="flex gap-3">
          <button 
            className="inline-flex justify-center rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
          >
            Share Ledger
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
          >
            Record Payment
          </button>
        </div>
      </div>

      {overdueAmount > 0 && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Payment Overdue</h3>
              <p className="text-sm text-red-700 mt-1">This customer has {formatCurrency(overdueAmount)} in overdue payments.</p>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">Current Outstanding</dt>
            <dd className={`text-3xl font-bold ${customer.outstanding_balance > 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {formatCurrency(customer.outstanding_balance)}
            </dd>
            {nextDueDate && customer.outstanding_balance > 0 && (
              <p className="mt-2 text-xs text-gray-500">
                Next due: <span className="font-medium text-gray-700">{new Date(nextDueDate).toLocaleDateString()}</span>
              </p>
            )}
          </div>
        </div>
        
        <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">Total Purchases</dt>
            <dd className="mt-1 text-3xl font-semibold text-gray-900">
              {formatCurrency(totalPurchases)}
            </dd>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">Total Payments</dt>
            <dd className="mt-1 text-3xl font-semibold text-gray-900">
              {formatCurrency(totalPayments)}
            </dd>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">Credit Limit</dt>
            <dd className="mt-1 text-3xl font-semibold text-gray-900">
              {customer.credit_limit !== null ? formatCurrency(customer.credit_limit) : 'Unlimited'}
            </dd>
            {customer.credit_limit !== null && (
              <p className="mt-2 text-xs text-gray-500">
                Available: <span className="font-medium text-gray-700">{formatCurrency(Math.max(0, customer.credit_limit - customer.outstanding_balance))}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {customer.outstanding_balance > 0 && (
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
            <h3 className="text-lg leading-6 font-medium text-gray-900">Outstanding Aging</h3>
            <p className="text-sm text-gray-500 mt-1">Breakdown of unpaid sales by days overdue</p>
          </div>
          <div className="grid grid-cols-4 divide-x divide-gray-200 text-center">
            <div className="p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">1-30 Days</p>
              <p className={`text-lg font-semibold ${agingBuckets['0_30'] > 0 ? 'text-yellow-600' : 'text-gray-900'}`}>{formatCurrency(agingBuckets['0_30'])}</p>
            </div>
            <div className="p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">31-60 Days</p>
              <p className={`text-lg font-semibold ${agingBuckets['31_60'] > 0 ? 'text-orange-500' : 'text-gray-900'}`}>{formatCurrency(agingBuckets['31_60'])}</p>
            </div>
            <div className="p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">61-90 Days</p>
              <p className={`text-lg font-semibold ${agingBuckets['61_90'] > 0 ? 'text-red-500' : 'text-gray-900'}`}>{formatCurrency(agingBuckets['61_90'])}</p>
            </div>
            <div className="p-4 bg-red-50">
              <p className="text-xs font-medium text-red-500 uppercase tracking-wider mb-1">90+ Days</p>
              <p className={`text-lg font-bold ${agingBuckets['90_plus'] > 0 ? 'text-red-700' : 'text-gray-900'}`}>{formatCurrency(agingBuckets['90_plus'])}</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
          <h3 className="text-lg leading-6 font-medium text-gray-900">Transaction History</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference/Notes</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Debit (Sale)</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Credit (Payment)</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Balance After</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {ledger.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-500">
                    No transactions found in ledger.
                  </td>
                </tr>
              ) : (
                ledger.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(tx.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                      {tx.transaction_type}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {tx.notes || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-red-600">
                      {tx.amount > 0 ? formatCurrency(tx.amount) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-green-600">
                      {tx.amount < 0 ? formatCurrency(Math.abs(tx.amount)) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                      {formatCurrency(tx.balance_after)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-medium text-gray-900">Record Payment</h3>
              <button 
                onClick={() => {
                  setIsModalOpen(false)
                  setError(null)
                }}
                className="text-gray-400 hover:text-gray-500 focus:outline-none"
              >
                &times;
              </button>
            </div>
            
            <form onSubmit={handleFormSubmit} className="p-6">
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md">
                  {error}
                </div>
              )}
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="store_id" className="block text-sm font-medium text-gray-700">Store (Collection Point)</label>
                  <select
                    name="store_id"
                    id="store_id"
                    required
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  >
                    {stores.map(store => (
                      <option key={store.id} value={store.id}>{store.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="amount" className="block text-sm font-medium text-gray-700">Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    name="amount"
                    id="amount"
                    required
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    placeholder="0.00"
                  />
                </div>
                
                <div>
                  <label htmlFor="method" className="block text-sm font-medium text-gray-700">Payment Method</label>
                  <select
                    name="method"
                    id="method"
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  >
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="CARD">Card</option>
                  </select>
                </div>
                
                <div>
                  <label htmlFor="notes" className="block text-sm font-medium text-gray-700">Notes (Optional)</label>
                  <input
                    type="text"
                    name="notes"
                    id="notes"
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    placeholder="Payment for old dues"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:bg-indigo-400 flex items-center justify-center"
                >
                  {isPending ? 'Processing...' : 'Confirm Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
