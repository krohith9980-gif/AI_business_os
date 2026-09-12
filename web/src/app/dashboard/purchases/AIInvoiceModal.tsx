'use client'

import React, { useState, useRef, useMemo } from 'react'
import { formatCurrency } from '@/utils/currency'
import { createInvoicePurchaseOrder, InvoicePurchaseItem } from './invoice-actions'

type Supplier = { id: string; name: string }
type Variant = { id: string; sku: string; selling_price: number; product?: { name: string } | { name: string }[] | null }

type DraftItem = {
  id: string
  selected: boolean
  is_new: boolean
  matched_variant_id: string
  product_name: string
  sku: string
  barcode: string
  purchase_cost: number
  sale_cost: number | ''
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
  const [aiSupplierSuggestion, setAiSupplierSuggestion] = useState<string>('')
  
  const [draftItems, setDraftItems] = useState<DraftItem[]>([])
  const [idempotencyKey, setIdempotencyKey] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Financial State
  const [invoiceDiscount, setInvoiceDiscount] = useState<number>(0)
  const [addDiscountMode, setAddDiscountMode] = useState<'amount' | 'percentage'>('amount')
  const [addDiscountValue, setAddDiscountValue] = useState<number>(0)
  const [taxTotal, setTaxTotal] = useState<number>(0)
  
  const [paymentStatus, setPaymentStatus] = useState<'CREDIT' | 'PARTIALLY_PAID' | 'PAID'>('CREDIT')
  const [amountPaid, setAmountPaid] = useState<number>(0)
  const [paymentMethod, setPaymentMethod] = useState<string>('CASH')
  const [aiInvoiceTotal, setAiInvoiceTotal] = useState<number | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Auto-matching algorithm
  const findBestMatch = (aiItem: any): string => {
    if (!aiItem.productName && !aiItem.sku && !aiItem.barcode) return ''
    for (const v of variants) {
      if (aiItem.sku && v.sku === aiItem.sku) return v.id
    }
    const targetName = (aiItem.productName || '').toLowerCase()
    if (!targetName) return ''
    for (const v of variants) {
      const vName = Array.isArray(v.product) ? v.product[0]?.name : v.product?.name
      if (vName && vName.toLowerCase() === targetName) return v.id
      if (vName && vName.toLowerCase().includes(targetName)) return v.id
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
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const res = await fetch('/api/intelligence/scan-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mimeType: file.type })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to scan invoice')

      const aiItems = data.items || []
      const newDrafts: DraftItem[] = aiItems.map((item: any, idx: number) => {
        const matchedVariantId = findBestMatch(item)
        const matchedVariant = variants.find(v => v.id === matchedVariantId)
        return {
          id: `draft-${idx}`,
          selected: true,
          is_new: !matchedVariantId,
          matched_variant_id: matchedVariantId,
          product_name: item.productName || '',
          sku: item.sku || '',
          barcode: item.barcode || '',
          purchase_cost: item.purchaseCost || 0,
          sale_cost: matchedVariant ? matchedVariant.selling_price : '',
          quantity: item.purchaseQuantity || item.measurementValue || 1,
          raw_ai_data: item
        }
      })

      setDraftItems(newDrafts)
      setAiSupplierSuggestion(data.supplierName || '')
      setInvoiceDiscount(data.invoiceDiscount || 0)
      setTaxTotal(data.taxAmount || 0)
      setAiInvoiceTotal(data.invoiceTotal || null)
      setSupplierId('') // Require explicit selection
      setPaymentStatus('CREDIT')
      setAmountPaid(0)
      
      setStep('review')
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'An error occurred during scanning')
      setStep('upload')
    }
  }

  const handleToggleItem = (id: string) => setDraftItems(prev => prev.map(item => item.id === id ? { ...item, selected: !item.selected } : item))
  const handleUpdateItem = (id: string, field: keyof DraftItem, value: any) => setDraftItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item))
  
  const handleMatchChange = (id: string, variantId: string) => {
    if (variantId === 'NEW') {
      setDraftItems(prev => prev.map(item => item.id === id ? { ...item, is_new: true, matched_variant_id: '', sale_cost: '' } : item))
    } else {
      const matchedVariant = variants.find(v => v.id === variantId)
      setDraftItems(prev => prev.map(item => item.id === id ? { ...item, is_new: false, matched_variant_id: variantId, sale_cost: matchedVariant ? matchedVariant.selling_price : '' } : item))
    }
  }

  // Financial Calculations
  const selectedCount = draftItems.filter(i => i.selected).length
  const grossSubtotal = useMemo(() => {
    return draftItems.filter(i => i.selected).reduce((sum, item) => sum + (item.quantity * item.purchase_cost), 0)
  }, [draftItems])

  const calculatedAdditionalDiscount = addDiscountMode === 'percentage' 
    ? (grossSubtotal * (addDiscountValue / 100))
    : addDiscountValue

  const finalPayable = Math.max(0, grossSubtotal - invoiceDiscount - calculatedAdditionalDiscount + taxTotal)

  const handlePaymentStatusChange = (status: 'CREDIT' | 'PARTIALLY_PAID' | 'PAID') => {
    setPaymentStatus(status)
    if (status === 'CREDIT') setAmountPaid(0)
    if (status === 'PAID') setAmountPaid(finalPayable)
    if (status === 'PARTIALLY_PAID' && amountPaid === 0) setAmountPaid(0)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!supplierId) return setError('Please confirm or select a supplier.')
    const selectedItems = draftItems.filter(i => i.selected)
    if (selectedItems.length === 0) return setError('Please select at least one item to purchase.')

    // Validate Items
    for (const item of selectedItems) {
      if (item.is_new && !item.product_name) return setError('New products must have a name')
      if (!item.is_new && !item.matched_variant_id) return setError('Existing products must have a variant selected')
      if (item.quantity <= 0) return setError('Quantity must be greater than 0')
      if (item.purchase_cost < 0) return setError('Purchase cost cannot be negative')
      if (item.sale_cost === '' || Number(item.sale_cost) < 0) return setError('Sale cost is required and cannot be negative')
    }

    // Validate Financials
    if (invoiceDiscount < 0 || calculatedAdditionalDiscount < 0) return setError('Discounts cannot be negative.')
    if (taxTotal < 0) return setError('Tax cannot be negative.')
    if (amountPaid < 0) return setError('Amount paid cannot be negative.')
    if (amountPaid > finalPayable) return setError('Amount paid cannot exceed final payable amount.')
    if (paymentStatus === 'PAID' && amountPaid !== finalPayable) return setError('PAID status requires amount paid to equal final payable.')
    if (paymentStatus === 'CREDIT' && amountPaid !== 0) return setError('CREDIT status requires amount paid to be 0.')
    if (paymentStatus === 'PARTIALLY_PAID' && (amountPaid <= 0 || amountPaid >= finalPayable)) return setError('PARTIALLY PAID requires amount between 0 and final payable.')

    setIsSubmitting(true)
    
    try {
      const payload: InvoicePurchaseItem[] = selectedItems.map(item => ({
        is_new: item.is_new,
        variant_id: item.is_new ? undefined : item.matched_variant_id,
        product_name: item.is_new ? item.product_name : undefined,
        sku: item.is_new ? item.sku : undefined,
        barcode: item.is_new ? item.barcode : undefined,
        purchase_cost: item.purchase_cost,
        sale_cost: Number(item.sale_cost),
        quantity: item.quantity,
        attributes: item.raw_ai_data
      }))

      const result = await createInvoicePurchaseOrder(
        storeId, 
        supplierId, 
        idempotencyKey, 
        payload,
        invoiceDiscount,
        calculatedAdditionalDiscount,
        taxTotal,
        amountPaid,
        paymentMethod,
        ''
      )
      
      if (result.error) throw new Error(result.error)
      onSuccess()
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Failed to save purchase')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl overflow-hidden flex flex-col max-h-[90vh]">
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
              <p className="mt-1 text-sm text-gray-500">AI will automatically extract products, quantities, prices, and discounts.</p>
              <div className="mt-6">
                <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" ref={fileInputRef} />
                <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700">
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
            <form id="invoice-form" onSubmit={handleSubmit} className="space-y-8">
              
              {/* Top Section: Supplier & Warnings */}
              <div className="bg-white border border-gray-200 shadow-sm rounded-lg p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-900">Supplier *</label>
                    {aiSupplierSuggestion && !supplierId && (
                      <p className="text-xs text-indigo-600 mt-1 mb-2">AI Suggests: {aiSupplierSuggestion}</p>
                    )}
                    <select
                      value={supplierId}
                      onChange={e => setSupplierId(e.target.value)}
                      required
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 bg-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    >
                      <option value="">-- Confirm or Select Supplier --</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  
                  {aiInvoiceTotal !== null && Math.abs(finalPayable - aiInvoiceTotal) > 0.1 && (
                    <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-md">
                      <h4 className="text-sm font-medium text-yellow-800">Total Mismatch Warning</h4>
                      <p className="text-xs text-yellow-700 mt-1">
                        The AI read a printed total of <strong>{formatCurrency(aiInvoiceTotal)}</strong>, but the calculated total is <strong>{formatCurrency(finalPayable)}</strong>. Please review discounts and tax.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Products Section */}
              <div>
                <h4 className="text-lg font-medium text-gray-900 mb-4">Extracted Products</h4>
                <div className="space-y-4">
                  {draftItems.map((item, idx) => (
                    <div key={item.id} className={`p-4 rounded-lg border ${item.selected ? 'border-indigo-200 bg-indigo-50/30' : 'border-gray-200 bg-gray-50 opacity-60'}`}>
                      <div className="flex items-center gap-4">
                        <input type="checkbox" checked={item.selected} onChange={() => handleToggleItem(item.id)} className="h-4 w-4 text-indigo-600 border-gray-300 rounded" />
                        
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 flex-1">
                          <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Product Match</label>
                            <select
                              value={item.is_new ? 'NEW' : item.matched_variant_id}
                              onChange={e => handleMatchChange(item.id, e.target.value)}
                              disabled={!item.selected}
                              className="block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 bg-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-500"
                            >
                              <option value="NEW" className="font-bold text-indigo-600">+ Create New Product</option>
                              <optgroup label="Existing Products">
                                {variants.map(v => {
                                  const vName = Array.isArray(v.product) ? v.product[0]?.name : v.product?.name
                                  return <option key={v.id} value={v.id}>{vName} ({v.sku})</option>
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
                                className="mt-2 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 bg-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-500"
                              />
                            )}
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Quantity</label>
                            <input
                              type="number" min="1" value={item.quantity}
                              onChange={e => handleUpdateItem(item.id, 'quantity', parseInt(e.target.value) || 0)}
                              disabled={!item.selected} required={item.selected}
                              className="block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 bg-white shadow-sm disabled:bg-gray-100 disabled:text-gray-500"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Purchase Cost</label>
                            <input
                              type="number" min="0" step="0.01" value={item.purchase_cost}
                              onChange={e => handleUpdateItem(item.id, 'purchase_cost', parseFloat(e.target.value) || 0)}
                              disabled={!item.selected} required={item.selected}
                              className="block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 bg-white shadow-sm disabled:bg-gray-100 disabled:text-gray-500"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Sale Cost</label>
                            <input
                              type="number" min="0" step="0.01" value={item.sale_cost}
                              onChange={e => handleUpdateItem(item.id, 'sale_cost', e.target.value === '' ? '' : (parseFloat(e.target.value) || 0))}
                              disabled={!item.selected} required={item.selected}
                              className="block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 bg-white shadow-sm disabled:bg-gray-100 disabled:text-gray-500"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Financials & Payment Section */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* Left: Discounts & Tax */}
                <div className="bg-gray-50 p-5 rounded-lg border border-gray-200 space-y-4">
                  <h4 className="font-medium text-gray-900 border-b pb-2">Discounts & Tax</h4>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Gross Subtotal</span>
                    <span className="text-sm font-medium text-gray-900">{formatCurrency(grossSubtotal)}</span>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Invoice Discount (₹)</label>
                    <input
                      type="number" min="0" step="0.01" value={invoiceDiscount}
                      onChange={e => setInvoiceDiscount(parseFloat(e.target.value) || 0)}
                      className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white shadow-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Additional Discount</label>
                    <div className="flex gap-2">
                      <select
                        value={addDiscountMode}
                        onChange={e => setAddDiscountMode(e.target.value as 'amount' | 'percentage')}
                        className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white shadow-sm"
                      >
                        <option value="amount">₹</option>
                        <option value="percentage">%</option>
                      </select>
                      <input
                        type="number" min="0" step="0.01" value={addDiscountValue}
                        onChange={e => setAddDiscountValue(parseFloat(e.target.value) || 0)}
                        className="flex-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white shadow-sm"
                      />
                    </div>
                    {addDiscountMode === 'percentage' && (
                      <p className="text-xs text-gray-500 mt-1">Calculated as {addDiscountValue}% of {formatCurrency(grossSubtotal)} = -{formatCurrency(calculatedAdditionalDiscount)}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Total Tax (₹)</label>
                    <input
                      type="number" min="0" step="0.01" value={taxTotal}
                      onChange={e => setTaxTotal(parseFloat(e.target.value) || 0)}
                      className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white shadow-sm"
                    />
                  </div>
                </div>

                {/* Right: Payment & Totals */}
                <div className="bg-gray-50 p-5 rounded-lg border border-gray-200 space-y-4">
                  <h4 className="font-medium text-gray-900 border-b pb-2">Payment Status</h4>

                  <div className="flex justify-between items-center text-lg font-bold text-gray-900 mb-4 bg-indigo-50 p-3 rounded-md">
                    <span>Final Payable</span>
                    <span>{formatCurrency(finalPayable)}</span>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Status</label>
                    <select
                      value={paymentStatus}
                      onChange={e => handlePaymentStatusChange(e.target.value as 'CREDIT' | 'PARTIALLY_PAID' | 'PAID')}
                      className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white shadow-sm font-medium"
                    >
                      <option value="CREDIT">CREDIT (Pay Later)</option>
                      <option value="PARTIALLY_PAID">PARTIALLY PAID</option>
                      <option value="PAID">PAID IN FULL</option>
                    </select>
                  </div>

                  {paymentStatus !== 'CREDIT' && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">Amount Paid (₹)</label>
                        <input
                          type="number" min="0.01" step="0.01" max={finalPayable}
                          value={amountPaid}
                          onChange={e => setAmountPaid(parseFloat(e.target.value) || 0)}
                          disabled={paymentStatus === 'PAID'}
                          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white shadow-sm disabled:bg-gray-100"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">Method</label>
                        <select
                          value={paymentMethod}
                          onChange={e => setPaymentMethod(e.target.value)}
                          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white shadow-sm"
                        >
                          <option value="CASH">CASH</option>
                          <option value="UPI">UPI</option>
                          <option value="CARD">CARD</option>
                          <option value="SPLIT">SPLIT</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {paymentStatus === 'PARTIALLY_PAID' && (
                    <div className="flex justify-between items-center mt-2 text-sm text-red-600 font-medium bg-red-50 p-2 rounded">
                      <span>Outstanding Remaining</span>
                      <span>{formatCurrency(Math.max(0, finalPayable - amountPaid))}</span>
                    </div>
                  )}
                </div>
              </div>
            </form>
          )}
        </div>

        {step === 'review' && (
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between shrink-0">
            <div className="text-sm">
              <span className="text-gray-500 mr-4">{selectedCount} items selected</span>
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
                {isSubmitting ? 'Saving...' : 'Save Purchase & Update Ledger'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
