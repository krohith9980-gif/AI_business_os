'use client'

import React, { useState, useTransition, useEffect } from 'react'
import { createPurchaseOrder } from './actions'

type PurchaseItem = {
  variant_id: string
  quantity: number
  purchase_cost: number
}

type Supplier = { id: string; name: string }
type Variant = { id: string; sku: string; product?: { name: string } | { name: string }[] | null }

export default function PurchasesClient({
  initialPurchases,
  suppliers,
  variants,
  storeId
}: {
  initialPurchases: any[]
  suppliers: Supplier[]
  variants: Variant[]
  storeId: string
}) {
  const [purchases, setPurchases] = useState(initialPurchases)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Form State
  const [supplierId, setSupplierId] = useState('')
  const [items, setItems] = useState<PurchaseItem[]>([])
  
  // Idempotency Key
  const [idempotencyKey, setIdempotencyKey] = useState('')

  const openNewPurchaseModal = () => {
    setSupplierId('')
    setItems([{ variant_id: '', quantity: 1, purchase_cost: 0 }])
    setIdempotencyKey(crypto.randomUUID())
    setError(null)
    setIsModalOpen(true)
  }

  const handleAddItem = () => {
    setItems([...items, { variant_id: '', quantity: 1, purchase_cost: 0 }])
  }

  const handleUpdateItem = (index: number, field: keyof PurchaseItem, value: any) => {
    const newItems = [...items]
    newItems[index] = { ...newItems[index], [field]: value }
    setItems(newItems)
  }

  const handleRemoveItem = (index: number) => {
    const newItems = [...items]
    newItems.splice(index, 1)
    setItems(newItems)
  }

  const totalCost = items.reduce((sum, item) => sum + (item.quantity * item.purchase_cost), 0)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!supplierId) {
      setError('Please select a supplier')
      return
    }

    if (items.length === 0) {
      setError('Please add at least one item')
      return
    }

    for (const item of items) {
      if (!item.variant_id) return setError('Please select a product for all items')
      if (item.quantity <= 0) return setError('Quantity must be greater than 0')
      if (item.purchase_cost < 0) return setError('Cost cannot be negative')
    }

    startTransition(async () => {
      // NOTE: idempotencyKey is preserved during retries. It only changes on a NEW purchase.
      const result = await createPurchaseOrder(storeId, supplierId, idempotencyKey, items)
      
      if (result?.error) {
        setError(result.error)
      } else if (result?.success) {
        // Optimistically add to UI, but in a real app we'd rely on revalidatePath
        // Just close modal and reset key
        setIsModalOpen(false)
        setIdempotencyKey('') 
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Purchases</h1>
        <button 
          onClick={openNewPurchaseModal}
          className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          Create Purchase Order
        </button>
      </div>

      <div className="bg-white shadow-sm rounded-lg border border-gray-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Supplier</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {purchases.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-sm text-gray-500">
                    No purchase orders found
                  </td>
                </tr>
              ) : (
                purchases.map((po) => (
                  <tr key={po.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(po.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{po.supplier_name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{po.status}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      ${po.total.toFixed(2)}
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
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 shrink-0">
              <h3 className="text-lg font-medium text-gray-900">Create Purchase Order</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-500">
                &times;
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden h-full">
              <div className="p-6 overflow-y-auto flex-1 space-y-6">
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md">
                    {error}
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Supplier</label>
                  <select
                    value={supplierId}
                    onChange={e => setSupplierId(e.target.value)}
                    required
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  >
                    <option value="">Select Supplier...</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-gray-700">Items</label>
                    <button type="button" onClick={handleAddItem} className="text-sm text-indigo-600 hover:text-indigo-900">
                      + Add Item
                    </button>
                  </div>
                  
                  <div className="space-y-3">
                    {items.map((item, index) => (
                      <div key={index} className="flex gap-3 items-start border p-3 rounded-md bg-gray-50">
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-500 mb-1">Product Variant</label>
                          <select
                            value={item.variant_id}
                            onChange={e => handleUpdateItem(index, 'variant_id', e.target.value)}
                            required
                            className="block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                          >
                            <option value="">Select Product...</option>
                            {variants.map(v => {
                              const productName = Array.isArray(v.product) ? v.product[0]?.name : v.product?.name;
                              return (
                                <option key={v.id} value={v.id}>
                                  {productName || 'Unnamed'} ({v.sku})
                                </option>
                              );
                            })}
                          </select>
                        </div>
                        <div className="w-24">
                          <label className="block text-xs font-medium text-gray-500 mb-1">Qty</label>
                          <input
                            type="number"
                            min="1"
                            required
                            value={item.quantity}
                            onChange={e => handleUpdateItem(index, 'quantity', parseInt(e.target.value) || 0)}
                            className="block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                          />
                        </div>
                        <div className="w-32">
                          <label className="block text-xs font-medium text-gray-500 mb-1">Unit Cost</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            required
                            value={item.purchase_cost}
                            onChange={e => handleUpdateItem(index, 'purchase_cost', parseFloat(e.target.value) || 0)}
                            className="block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                          />
                        </div>
                        <div className="w-24 pt-6 text-right font-medium text-sm text-gray-900">
                          ${(item.quantity * item.purchase_cost).toFixed(2)}
                        </div>
                        {items.length > 1 && (
                          <div className="pt-6">
                            <button type="button" onClick={() => handleRemoveItem(index)} className="text-red-500 hover:text-red-700">
                              &times;
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 text-right">
                    <span className="text-sm font-medium text-gray-500">Total Purchase Value: </span>
                    <span className="text-lg font-bold text-gray-900">${totalCost.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 bg-gray-50 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending || items.length === 0}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 disabled:bg-indigo-400"
                >
                  {isPending ? 'Processing...' : 'Confirm Purchase'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
