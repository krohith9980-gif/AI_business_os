'use client'

import React, { useState, useTransition } from 'react'
import { recordCustomerPayment } from './actions'

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
}

type Store = {
  id: string
  name: string
}

export default function CustomerLedgerClient({
  customer,
  ledger,
  stores
}: {
  customer: Customer
  ledger: LedgerTransaction[]
  stores: Store[]
}) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    formData.append('customer_id', customer.id)
    
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">Current Outstanding</dt>
            <dd className="mt-1 text-3xl font-semibold text-gray-900">
              ₹{customer.outstanding_balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </dd>
          </div>
        </div>
        <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">Total Purchases (MOCK)</dt>
            <dd className="mt-1 text-3xl font-semibold text-gray-900">
              ₹0.00
            </dd>
          </div>
        </div>
        <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">Total Payments (MOCK)</dt>
            <dd className="mt-1 text-3xl font-semibold text-gray-900">
              ₹0.00
            </dd>
          </div>
        </div>
      </div>

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
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-red-600 font-medium">
                      {tx.amount > 0 ? `₹${tx.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-green-600 font-medium">
                      {tx.amount < 0 ? `₹${Math.abs(tx.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                      ₹{tx.balance_after.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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
