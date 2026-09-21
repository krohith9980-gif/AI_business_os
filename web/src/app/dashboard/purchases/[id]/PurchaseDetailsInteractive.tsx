'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { recordSupplierResponse, recordGoodsReceipt } from './actions'
import { recordSupplierPayment } from '../invoice-actions'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function PurchaseDetailsInteractive({ purchase }: { purchase: any }) {
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleStatusChange = async (status: 'SUPPLIER_CONFIRMED' | 'REJECTED' | 'CANCELLED') => {
    setIsPending(true)
    setError(null)
    const res = await recordSupplierResponse(purchase.id, status)
    if (res.error) {
      setError(res.error)
    }
    setIsPending(false)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getBadgeClass = (status: string) => {
    switch (status) {
      case 'PENDING': return 'bg-gray-100 text-gray-800'
      case 'SUPPLIER_CONFIRMED': return 'bg-blue-100 text-blue-800'
      case 'PARTIAL_RECEIVED': return 'bg-purple-100 text-purple-800'
      case 'COMPLETED': return 'bg-green-100 text-green-800'
      case 'REJECTED':
      case 'CANCELLED': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'PENDING': return 'Pending Supplier Confirmation'
      case 'SUPPLIER_CONFIRMED': return 'Supplier Confirmed — Awaiting Goods'
      case 'PARTIAL_RECEIVED': return 'Partially Received'
      case 'COMPLETED': return 'Completed — Goods Fully Received'
      default: return status
    }
  }

  return (
    <>
      <div className="flex items-center gap-4 mt-4">
        <span className={`px-3 py-1 rounded-full text-sm font-bold uppercase ${getBadgeClass(purchase.status)}`}>
          {getStatusText(purchase.status)}
        </span>
        
        {purchase.status === 'PENDING' && (
          <div className="flex gap-2">
            <button
              onClick={() => handleStatusChange('SUPPLIER_CONFIRMED')}
              disabled={isPending}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              Supplier Confirmed
            </button>
            <button
              onClick={() => handleStatusChange('REJECTED')}
              disabled={isPending}
              className="px-4 py-2 bg-red-100 text-red-700 text-sm font-bold rounded hover:bg-red-200 disabled:opacity-50"
            >
              Supplier Rejected
            </button>
            <button
              onClick={() => router.push(`/dashboard/purchases/new?edit=${purchase.id}`)}
              disabled={isPending}
              className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-bold rounded hover:bg-gray-50 disabled:opacity-50"
            >
              Edit Order
            </button>
            <button
              onClick={() => handleStatusChange('CANCELLED')}
              disabled={isPending}
              className="px-4 py-2 border border-gray-300 text-red-600 text-sm font-bold rounded hover:bg-red-50 disabled:opacity-50"
            >
              Cancel Order
            </button>
          </div>
        )}

        {(purchase.status === 'SUPPLIER_CONFIRMED' || purchase.status === 'PARTIAL_RECEIVED') && (
          <button
            onClick={() => setIsReceiptModalOpen(true)}
            className="px-4 py-2 bg-green-600 text-white text-sm font-bold rounded hover:bg-green-700"
          >
            Record Goods Receipt
          </button>
        )}
      </div>
      
      {purchase.status === 'COMPLETED' && (
        <div className="mt-2 text-sm font-medium text-green-700">
          Inventory Updated
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 bg-red-100 text-red-700 text-sm rounded">
          {error}
        </div>
      )}

      {isReceiptModalOpen && (
        <ReceiptModal 
          purchase={purchase} 
          onClose={() => setIsReceiptModalOpen(false)} 
        />
      )}
    </>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ReceiptModal({ purchase, onClose }: { purchase: any, onClose: () => void }) {
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Initialize items state with remaining quantities
  const [items, setItems] = useState(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return purchase.po_items.map((item: any) => ({
      po_item_id: item.id,
      name: item.product_variants?.products?.name,
      ordered: item.quantity_ordered || item.quantity, // Fallback for schema mismatch during transition
      already_received: item.quantity_received || 0,
      remaining: (item.quantity_ordered || item.quantity) - (item.quantity_received || 0),
      quantity_received: (item.quantity_ordered || item.quantity) - (item.quantity_received || 0),
      purchase_cost: item.purchase_cost || 0,
      batch_number: '',
      mfg_date: '',
      expiry_date: ''
    })).filter((i: any) => i.remaining > 0)
  })

  const [paymentOption, setPaymentOption] = useState<'CREDIT' | 'FULL' | 'PARTIAL'>('CREDIT')
  const [amountPaid, setAmountPaid] = useState<number>(0)
  const [paymentMethod, setPaymentMethod] = useState<string>('CASH')

  const totalReceiptValue = items.reduce((sum: number, item: any) => sum + (item.quantity_received * item.purchase_cost), 0)

  React.useEffect(() => {
    if (paymentOption === 'FULL') {
      setAmountPaid(totalReceiptValue)
    } else if (paymentOption === 'CREDIT') {
      setAmountPaid(0)
    }
  }, [paymentOption, totalReceiptValue])

  const handleUpdateItem = (index: number, field: string, value: any) => {
    const newItems = [...items]
    newItems[index][field] = value
    setItems(newItems)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsPending(true)
    setError(null)
    
    // Filter out items with 0 received qty
    const payload = items
      .filter((i: any) => i.quantity_received > 0)
      .map((i: any) => ({
        po_item_id: i.po_item_id,
        quantity_received: i.quantity_received,
        batch_number: i.batch_number || '',
        mfg_date: i.mfg_date || null,
        expiry_date: i.expiry_date || null
      }))

    if (payload.length === 0) {
      setError("Please enter a quantity greater than 0 for at least one item.")
      setIsPending(false)
      return
    }

    const idempotencyKey = crypto.randomUUID()
    const res = await recordGoodsReceipt(purchase.id, idempotencyKey, payload)
    
    if (res.error) {
      setError(res.error)
      setIsPending(false)
      return
    }

    if (paymentOption !== 'CREDIT' && amountPaid > 0) {
      const paymentRes = await recordSupplierPayment(
        purchase.store_id,
        purchase.supplier_id || purchase.suppliers?.id,
        crypto.randomUUID(),
        amountPaid,
        paymentMethod,
        '',
        'Payment for goods receipt'
      )
      
      if (paymentRes.error) {
        setError(`Goods received successfully, but payment recording failed: ${paymentRes.error}`)
        setIsPending(false)
        return
      }
    }
    
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900">Record Goods Receipt</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 font-bold text-xl">&times;</button>
        </div>
        
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            {error && (
              <div className="p-4 bg-red-50 text-red-700 rounded-md text-sm font-medium border border-red-200">
                {error}
              </div>
            )}
            
            <div className="space-y-4">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {items.map((item: any, index: number) => (
                <div key={item.po_item_id} className="p-4 border rounded-lg bg-gray-50">
                  <div className="font-bold text-lg mb-2">{item.name}</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <span className="block text-xs font-bold text-gray-500 uppercase">Ordered</span>
                      <span className="font-medium">{item.ordered}</span>
                    </div>
                    <div>
                      <span className="block text-xs font-bold text-gray-500 uppercase">Previously Received</span>
                      <span className="font-medium">{item.already_received}</span>
                    </div>
                    <div>
                      <span className="block text-xs font-bold text-gray-500 uppercase">Remaining</span>
                      <span className="font-bold text-indigo-600">{item.remaining}</span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Receiving Qty</label>
                      <input 
                        type="number" 
                        min="0" 
                        max={item.remaining} 
                        value={item.quantity_received}
                        onChange={e => handleUpdateItem(index, 'quantity_received', parseInt(e.target.value) || 0)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Batch Number</label>
                      <input 
                        type="text" 
                        value={item.batch_number}
                        onChange={e => handleUpdateItem(index, 'batch_number', e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">MFG Date</label>
                      <input 
                        type="date" 
                        value={item.mfg_date}
                        onChange={e => handleUpdateItem(index, 'mfg_date', e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Expiry Date</label>
                      <input 
                        type="date" 
                        value={item.expiry_date}
                        onChange={e => handleUpdateItem(index, 'expiry_date', e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm" 
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 p-4 border rounded-lg bg-white shadow-sm">
              <h3 className="text-lg font-bold text-gray-900 mb-4 border-b pb-2">Payment Details</h3>
              <div className="mb-4">
                <span className="block text-sm font-bold text-gray-700 mb-1">Receipt Total Value</span>
                <span className="text-xl font-bold text-gray-900">₹{totalReceiptValue.toFixed(2)}</span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Payment Action</label>
                  <select 
                    value={paymentOption}
                    onChange={(e) => setPaymentOption(e.target.value as any)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm"
                  >
                    <option value="CREDIT">Credit (Pay Later)</option>
                    <option value="FULL">Paid in Full</option>
                    <option value="PARTIAL">Partially Paid</option>
                  </select>
                </div>
                
                {paymentOption !== 'CREDIT' && (
                  <>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">Amount Paid</label>
                      <input 
                        type="number" 
                        min="0"
                        step="0.01"
                        max={totalReceiptValue}
                        value={amountPaid}
                        onChange={(e) => setAmountPaid(parseFloat(e.target.value) || 0)}
                        disabled={paymentOption === 'FULL'}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm disabled:bg-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">Payment Method</label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm"
                      >
                        <option value="CASH">Cash</option>
                        <option value="UPI">UPI</option>
                        <option value="CARD">Card</option>
                        <option value="BANK_TRANSFER">Bank Transfer</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          
          <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3 sticky bottom-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 border border-gray-300 rounded text-gray-700 font-bold hover:bg-gray-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || items.length === 0}
              className="px-4 py-2 bg-green-600 text-white font-bold rounded hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
            >
              {isPending ? 'Processing...' : 'Confirm Receipt & Update Inventory'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
