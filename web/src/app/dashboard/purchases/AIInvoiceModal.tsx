'use client'

import React, { useState, useRef } from 'react'
import { formatCurrency } from '@/utils/currency'
import { createInvoicePurchaseOrder, InvoicePurchaseItem } from './invoice-actions'

type Supplier = { id: string; name: string }
type Variant = { id: string; sku: string; product?: { name: string } | { name: string }[] | null }

type DraftItem = {
  id: string
  selected: boolean
  is_new: boolean
  matched_variant_id: string
  product_name: string
  sku: string
  barcode: string
  purchase_cost: number
  quantity: number
  raw_ai_data: any
}

export default function AIInvoiceModal({
  isOpen,
  onClose,
  onSuccess,
  suppliers,
  variants,
  storeId
}: {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  suppliers: Supplier[]
  variants: Variant[]
  storeId: string
}) {
  const [step, setStep] = useState<'upload' | 'scanning' | 'review'>('upload')
  const [error, setError] = useState<string | null>(null)
  
  const [supplierId, setSupplierId] = useState('')
  const [draftItems, setDraftItems] = useState<DraftItem[]>([])
  const [idempotencyKey, setIdempotencyKey] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Auto-matching algorithm
  const findBestMatch = (aiItem: any): string => {
    if (!aiItem.productName && !aiItem.sku && !aiItem.barcode) return ''
    
    // Exact match by SKU or Barcode
    for (const v of variants) {
      if (aiItem.sku && v.sku === aiItem.sku) return v.id
      // Assuming variants have barcode in the real payload, but types here are limited.
      // If barcode exists, we'd check it.
    }
    
    // Fuzzy match by name
    const targetName = (aiItem.productName || '').toLowerCase()
    if (!targetName) return ''

    for (const v of variants) {
      const vName = Array.isArray(v.product) ? v.product[0]?.name : v.product?.name
      if (vName && vName.toLowerCase() === targetName) {
        return v.id
      }
      if (vName && vName.toLowerCase().includes(targetName)) {
        return v.id // Simple substring match
      }
    }
    
    return ''
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setStep('scanning')
    setError(null)
    setIdempotencyKey(crypto.randomUUID())

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          resolve(result.split(',')[1])
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const res = await fetch('/api/intelligence/scan-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64,
          mimeType: file.type
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to scan invoice')

      // Process items
      const aiItems = data.items || []
      const newDrafts: DraftItem[] = aiItems.map((item: any, idx: number) => {
        const matchedVariantId = findBestMatch(item)
        return {
          id: `draft-${idx}`,
          selected: true,
          is_new: !matchedVariantId,
          matched_variant_id: matchedVariantId,
          product_name: item.productName || '',
          sku: item.sku || '',
          barcode: item.barcode || '',
          purchase_cost: item.purchaseCost || 0,
          quantity: item.purchaseQuantity || item.measurementValue || 1, // Fallback if qty wasn't found
          raw_ai_data: item
        }
      })

      setDraftItems(newDrafts)
      setStep('review')
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'An error occurred during scanning')
      setStep('upload')
    }
  }

  const handleToggleItem = (id: string) => {
    setDraftItems(prev => prev.map(item => item.id === id ? { ...item, selected: !item.selected } : item))
  }

  const handleUpdateItem = (id: string, field: keyof DraftItem, value: any) => {
    setDraftItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item))
  }

  const handleMatchChange = (id: string, variantId: string) => {
    if (variantId === 'NEW') {
      handleUpdateItem(id, 'is_new', true)
      handleUpdateItem(id, 'matched_variant_id', '')
    } else {
      handleUpdateItem(id, 'is_new', false)
      handleUpdateItem(id, 'matched_variant_id', variantId)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!supplierId) {
      setError('Please select a supplier')
      return
    }

    const selectedItems = draftItems.filter(i => i.selected)
    if (selectedItems.length === 0) {
      setError('Please select at least one item to purchase')
      return
    }

    // Validate
    for (const item of selectedItems) {
      if (item.is_new && !item.product_name) return setError('New products must have a name')
      if (!item.is_new && !item.matched_variant_id) return setError('Existing products must have a variant selected')
      if (item.quantity <= 0) return setError('Quantity must be greater than 0')
      if (item.purchase_cost < 0) return setError('Cost cannot be negative')
    }

    setIsSubmitting(true)
    
    try {
      const payload: InvoicePurchaseItem[] = selectedItems.map(item => ({
        is_new: item.is_new,
        variant_id: item.is_new ? undefined : item.matched_variant_id,
        product_name: item.is_new ? item.product_name : undefined,
        sku: item.is_new ? item.sku : undefined,
        barcode: item.is_new ? item.barcode : undefined,
        purchase_cost: item.purchase_cost,
        quantity: item.quantity,
        attributes: item.raw_ai_data
      }))

      const result = await createInvoicePurchaseOrder(storeId, supplierId, idempotencyKey, payload)
      if (result.error) {
        throw new Error(result.error)
      }

      onSuccess()
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Failed to save purchase')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  const selectedCount = draftItems.filter(i => i.selected).length
  const totalCost = draftItems.filter(i => i.selected).reduce((sum, item) => sum + (item.quantity * item.purchase_cost), 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 shrink-0">
          <h3 className="text-lg font-medium text-gray-900">Upload Invoice</h3>
          <button onClick={onClose} disabled={isSubmitting} className="text-gray-400 hover:text-gray-500">
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md">
              {error}
            </div>
          )}

          {step === 'upload' && (
            <div className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">Upload Supplier Invoice</h3>
              <p className="mt-1 text-sm text-gray-500">AI will automatically extract products, quantities, and prices.</p>
              <div className="mt-6">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                  ref={fileInputRef}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none"
                >
                  Select Image
                </button>
              </div>
            </div>
          )}

          {step === 'scanning' && (
            <div className="text-center py-12 space-y-4">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              <p className="text-sm text-gray-500">AI is analyzing the invoice...</p>
            </div>
          )}

          {step === 'review' && (
            <form id="invoice-form" onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700">Supplier</label>
                <select
                  value={supplierId}
                  onChange={e => setSupplierId(e.target.value)}
                  required
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 bg-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                >
                  <option value="">Select Supplier...</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-4">Review Extracted Products</h4>
                <div className="space-y-4">
                  {draftItems.map((item, idx) => (
                    <div key={item.id} className={`p-4 rounded-lg border ${item.selected ? 'border-indigo-200 bg-indigo-50/30' : 'border-gray-200 bg-gray-50 opacity-60'}`}>
                      <div className="flex items-center gap-4">
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={() => handleToggleItem(item.id)}
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                        />
                        
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 flex-1">
                          {/* Matching / Name */}
                          <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-gray-500 mb-1">Product Match</label>
                            <select
                              value={item.is_new ? 'NEW' : item.matched_variant_id}
                              onChange={e => handleMatchChange(item.id, e.target.value)}
                              disabled={!item.selected}
                              className="block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 bg-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-700 disabled:border-gray-200"
                            >
                              <option value="NEW" className="font-bold text-indigo-600">+ Create New Product</option>
                              <optgroup label="Existing Products">
                                {variants.map(v => {
                                  const vName = Array.isArray(v.product) ? v.product[0]?.name : v.product?.name
                                  return (
                                    <option key={v.id} value={v.id}>
                                      {vName} ({v.sku})
                                    </option>
                                  )
                                })}
                              </optgroup>
                            </select>
                            
                            {item.is_new && (
                              <input
                                type="text"
                                value={item.product_name}
                                onChange={e => handleUpdateItem(item.id, 'product_name', e.target.value)}
                                disabled={!item.selected}
                                placeholder="New Product Name"
                                required={item.is_new && item.selected}
                                className="mt-2 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 bg-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500 placeholder:text-gray-400 disabled:bg-gray-100 disabled:text-gray-700 disabled:border-gray-200"
                              />
                            )}
                          </div>

                          {/* Quantity */}
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Quantity</label>
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={e => handleUpdateItem(item.id, 'quantity', parseInt(e.target.value) || 0)}
                              disabled={!item.selected}
                              required={item.selected}
                              className="block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 bg-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-700 disabled:border-gray-200"
                            />
                          </div>

                          {/* Price */}
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Unit Purchase Price</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.purchase_cost}
                              onChange={e => handleUpdateItem(item.id, 'purchase_cost', parseFloat(e.target.value) || 0)}
                              disabled={!item.selected}
                              required={item.selected}
                              className="block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 bg-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-700 disabled:border-gray-200"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </form>
          )}
        </div>

        {step === 'review' && (
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between shrink-0">
            <div className="text-sm">
              <span className="text-gray-500 mr-4">{selectedCount} items selected</span>
              <span className="text-gray-900 font-bold">Total: {formatCurrency(totalCost)}</span>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="invoice-form"
                disabled={isSubmitting || selectedCount === 0}
                className="px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400"
              >
                {isSubmitting ? 'Saving...' : 'Save Products & Purchase'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
