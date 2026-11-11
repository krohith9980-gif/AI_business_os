'use client'

import React, { useState, useTransition } from 'react'
import { OverdueCustomer } from '../dashboard.types'
import { recordCustomerPaymentAction } from '../dashboard.actions'
import { X, CheckCircle2, AlertCircle, Loader2, IndianRupee } from 'lucide-react'

interface RecordPaymentModalProps {
  customer: OverdueCustomer | null
  isOpen: boolean
  onClose: () => void
  availableStores: Array<{ id: string; name: string }>
  defaultStoreId?: string
  onSuccess?: () => void
}

function RecordPaymentForm({
  customer,
  onClose,
  availableStores,
  defaultStoreId,
  onSuccess
}: {
  customer: OverdueCustomer
  onClose: () => void
  availableStores: Array<{ id: string; name: string }>
  defaultStoreId?: string
  onSuccess?: () => void
}) {
  const [amount, setAmount] = useState<string>(customer.pendingAmount.toString())
  const [method, setMethod] = useState<'CASH' | 'UPI' | 'CARD'>('CASH')
  const [storeId, setStoreId] = useState<string>(defaultStoreId || availableStores[0]?.id || '')
  const [notes, setNotes] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState<boolean>(false)
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a valid positive payment amount')
      return
    }

    const formData = new FormData()
    formData.append('customerId', customer.id)
    formData.append('storeId', storeId)
    formData.append('amount', amount)
    formData.append('method', method)
    if (notes) formData.append('notes', notes)

    startTransition(async () => {
      const res = await recordCustomerPaymentAction(formData)
      if (res.success) {
        setIsSuccess(true)
        if (onSuccess) onSuccess()
        setTimeout(() => {
          onClose()
          setIsSuccess(false)
        }, 1200)
      } else {
        setError(res.error || 'Failed to record payment')
      }
    })
  }

  if (isSuccess) {
    return (
      <div className="p-8 text-center space-y-3">
        <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto animate-bounce" />
        <h4 className="text-lg font-bold text-gray-900">Payment Recorded Successfully!</h4>
        <p className="text-xs text-gray-500">
          ₹{parseFloat(amount).toLocaleString('en-IN')} has been credited to {customer.name}&apos;s account.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="p-5 space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Customer Summary Card */}
      <div className="bg-emerald-50/60 p-3 rounded-lg border border-emerald-100 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-900">{customer.name}</p>
          <p className="text-[11px] text-gray-500">
            {customer.village || 'No village specified'} • {customer.phone || 'No phone'}
          </p>
        </div>
        <div className="text-right">
          <span className="text-[10px] uppercase tracking-wide text-gray-500 block">Current Balance</span>
          <span className="text-sm font-bold text-amber-700">
            ₹{customer.pendingAmount.toLocaleString('en-IN')}
          </span>
        </div>
      </div>

      {/* Store Selection */}
      {availableStores.length > 1 && (
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Receiving Store
          </label>
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          >
            {availableStores.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Payment Amount */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">
          Payment Amount (రూపాయలు) *
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
            <IndianRupee className="w-4 h-4" />
          </div>
          <input
            type="number"
            step="0.01"
            min="0.01"
            max={customer.pendingAmount}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            placeholder="Enter amount"
            className="w-full pl-9 pr-3 py-2 text-base font-bold border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none text-gray-900"
          />
        </div>
        <div className="flex justify-between items-center mt-1 text-[11px] text-gray-400">
          <span>Maximum allowed: ₹{customer.pendingAmount.toLocaleString('en-IN')}</span>
          <button
            type="button"
            onClick={() => setAmount(customer.pendingAmount.toString())}
            className="text-emerald-700 font-semibold hover:underline"
          >
            Pay Full Balance
          </button>
        </div>
      </div>

      {/* Payment Method */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">
          Payment Method (చెల్లింపు పద్ధతి) *
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(['CASH', 'UPI', 'CARD'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                method === m
                  ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {m === 'CASH' ? 'Cash (నగదు)' : m === 'UPI' ? 'UPI / GPay' : 'Card'}
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">
          Notes / Reference (ఐచ్ఛికం - వివరాలు)
        </label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Cleared Kharif season balance"
          className="w-full text-xs border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
        />
      </div>

      {/* Actions */}
      <div className="pt-2 flex justify-end gap-2.5">
        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          className="px-4 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="px-5 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
        >
          {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          <span>Confirm Payment</span>
        </button>
      </div>
    </form>
  )
}

export default function RecordPaymentModal({
  customer,
  isOpen,
  onClose,
  availableStores,
  defaultStoreId,
  onSuccess
}: RecordPaymentModalProps) {
  if (!isOpen || !customer) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-gray-900">
              Record Customer Payment (చెల్లింపు రికార్డ్)
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Settles customer credit balance via authoritative ledger RPC
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Keyed Form to naturally reset state when customer changes */}
        <RecordPaymentForm
          key={customer.id}
          customer={customer}
          onClose={onClose}
          availableStores={availableStores}
          defaultStoreId={defaultStoreId}
          onSuccess={onSuccess}
        />
      </div>
    </div>
  )
}
