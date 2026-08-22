'use client'

import React, { useState, useTransition } from 'react'
import { receiveStockAction, adjustStockAction } from './actions'

type Store = { id: string; name: string }
type Variant = { id: string; sku: string; name: string; tracking_mode: string }

export type InventoryItem = {
  store_id: string;
  store_name: string;
  variant_id: string;
  product_name: string;
  sku: string;
  tracking_mode: string;
  on_hand: number;
  incoming: number;
  reserved: number;
  available: number;
}

export default function InventoryClient({
  items,
  stores,
  variants,
}: {
  items: InventoryItem[]
  stores: Store[]
  variants: Variant[]
}) {
  const [search, setSearch] = useState('')
  const [selectedStore, setSelectedStore] = useState('')
  
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [receiveModalOpen, setReceiveModalOpen] = useState(false)
  const [adjustModalOpen, setAdjustModalOpen] = useState(false)

  // Modals form state
  const [formStoreId, setFormStoreId] = useState(stores[0]?.id || '')
  const [formVariantId, setFormVariantId] = useState('')

  const handleReceiveStock = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    
    startTransition(async () => {
      const result = await receiveStockAction(formData)
      if (result?.error) {
        setError(result.error)
      } else if (result?.success) {
        setReceiveModalOpen(false)
        setError(null)
      }
    })
  }

  const handleAdjustStock = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    
    startTransition(async () => {
      const result = await adjustStockAction(formData)
      if (result?.error) {
        setError(result.error)
      } else if (result?.success) {
        setAdjustModalOpen(false)
        setError(null)
      }
    })
  }

  const filteredItems = items.filter(item => {
    const matchesSearch = item.product_name.toLowerCase().includes(search.toLowerCase()) || 
                          item.sku.toLowerCase().includes(search.toLowerCase())
    const matchesStore = selectedStore ? item.store_id === selectedStore : true
    return matchesSearch && matchesStore
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
        <div className="flex items-center space-x-2">
          <button 
            onClick={() => {
              setReceiveModalOpen(true)
              setError(null)
            }}
            className="inline-flex justify-center rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Receive Stock
          </button>
          <button 
            onClick={() => {
              setAdjustModalOpen(true)
              setError(null)
            }}
            className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Adjust Stock
          </button>
        </div>
      </div>

      <div className="bg-white shadow-sm rounded-lg border border-gray-200">
        <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-4 items-center">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or SKU..."
            className="w-full sm:max-w-xs px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
          />
          <select 
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
            className="w-full sm:max-w-xs px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
          >
            <option value="">All Stores</option>
            {stores.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {isPending && <span className="text-sm text-gray-500">Updating...</span>}
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product/Variant</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Store</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">On-hand</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Incoming</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Reserved</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Available</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tracking</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-sm text-gray-500">
                    No inventory records found matching your filters.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={`${item.store_id}-${item.variant_id}`} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{item.product_name}</div>
                      <div className="text-sm text-gray-500">SKU: {item.sku}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.store_name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">{item.on_hand}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">{item.incoming}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-orange-600">{item.reserved > 0 ? item.reserved : '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-green-600">{item.available}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.tracking_mode}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {item.available <= 0 ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Out of Stock</span>
                      ) : item.available < 10 ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">Low Stock</span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">In Stock</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* RECEIVE STOCK MODAL */}
      {receiveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-medium text-gray-900">Receive Stock</h3>
              <button onClick={() => setReceiveModalOpen(false)} className="text-gray-400 hover:text-gray-500">
                <span className="sr-only">Close</span>&times;
              </button>
            </div>
            
            <form onSubmit={handleReceiveStock} className="p-6">
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md">
                  {error}
                </div>
              )}
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="store_id" className="block text-sm font-medium text-gray-700">Store *</label>
                  <select name="store_id" id="store_id" required value={formStoreId} onChange={e => setFormStoreId(e.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900">
                    <option value="" disabled>Select Store</option>
                    {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>

                <div>
                  <label htmlFor="variant_id" className="block text-sm font-medium text-gray-700">Variant *</label>
                  <select name="variant_id" id="variant_id" required value={formVariantId} onChange={e => setFormVariantId(e.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900">
                    <option value="" disabled>Select Variant</option>
                    {variants.map(v => (
                      <option key={v.id} value={v.id}>{v.name} ({v.sku})</option>
                    ))}
                  </select>
                  {variants.find(v => v.id === formVariantId)?.tracking_mode !== 'NONE' && formVariantId && (
                    <p className="mt-1 text-xs text-amber-600">
                      Note: Serial/Batch capture is currently not supported. This will process as a quantity movement only.
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="quantity" className="block text-sm font-medium text-gray-700">Quantity Received *</label>
                  <input type="number" min="1" name="quantity" id="quantity" required className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900" />
                </div>

                <div>
                  <label htmlFor="notes" className="block text-sm font-medium text-gray-700">Notes</label>
                  <textarea name="notes" id="notes" rows={2} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900"></textarea>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={() => setReceiveModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={isPending} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 disabled:opacity-50">
                  {isPending ? 'Saving...' : 'Receive Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADJUST STOCK MODAL */}
      {adjustModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-medium text-gray-900">Adjust Stock</h3>
              <button onClick={() => setAdjustModalOpen(false)} className="text-gray-400 hover:text-gray-500">
                <span className="sr-only">Close</span>&times;
              </button>
            </div>
            
            <form onSubmit={handleAdjustStock} className="p-6">
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md">
                  {error}
                </div>
              )}
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="store_id" className="block text-sm font-medium text-gray-700">Store *</label>
                  <select name="store_id" id="store_id" required value={formStoreId} onChange={e => setFormStoreId(e.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900">
                    <option value="" disabled>Select Store</option>
                    {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>

                <div>
                  <label htmlFor="variant_id" className="block text-sm font-medium text-gray-700">Variant *</label>
                  <select name="variant_id" id="variant_id" required value={formVariantId} onChange={e => setFormVariantId(e.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900">
                    <option value="" disabled>Select Variant</option>
                    {variants.map(v => (
                      <option key={v.id} value={v.id}>{v.name} ({v.sku})</option>
                    ))}
                  </select>
                  {variants.find(v => v.id === formVariantId)?.tracking_mode !== 'NONE' && formVariantId && (
                    <p className="mt-1 text-xs text-amber-600">
                      Note: Serial/Batch capture is currently not supported. This will process as a quantity movement only.
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="movement_type" className="block text-sm font-medium text-gray-700">Adjustment Type *</label>
                  <select name="movement_type" id="movement_type" required className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900">
                    <option value="" disabled>Select Type</option>
                    <option value="opening_stock">Opening Stock (Add)</option>
                    <option value="adjustment">Positive Adjustment (Add)</option>
                    <option value="correction">Correction (Subtract)</option>
                    <option value="damage">Damage (Subtract to Damaged)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="quantity" className="block text-sm font-medium text-gray-700">Quantity *</label>
                  <input type="number" min="1" name="quantity" id="quantity" required placeholder="Absolute quantity" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900" />
                  <p className="mt-1 text-xs text-gray-500">Enter a positive number. Subtraction is handled by the selected adjustment type.</p>
                </div>

                <div>
                  <label htmlFor="notes" className="block text-sm font-medium text-gray-700">Notes / Reason</label>
                  <textarea name="notes" id="notes" rows={2} required className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900"></textarea>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={() => setAdjustModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={isPending} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 disabled:opacity-50">
                  {isPending ? 'Processing...' : 'Confirm Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
