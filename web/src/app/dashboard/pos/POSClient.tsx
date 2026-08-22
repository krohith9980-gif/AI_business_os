'use client'

import React, { useState, useTransition, useMemo } from 'react'
import { completeSale } from './actions'

type Store = { id: string; name: string }
type Customer = { id: string; name: string; phone_number: string | null; email: string | null }
type Variant = { id: string; productName: string; variantName: string; sku: string; selling_price: number }

type CartItem = {
  variantId: string
  productName: string
  variantName: string
  sku: string
  quantity: number
  unitPrice: number
  discountAmount: number // flat amount per line item
}

type PaymentMethod = 'CASH' | 'UPI' | 'CARD' | 'SPLIT'

export default function POSClient({
  stores,
  customers,
  variants
}: {
  stores: Store[]
  customers: Customer[]
  variants: Variant[]
}) {
  const [selectedStoreId, setSelectedStoreId] = useState<string>(stores[0]?.id || '')
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('')
  const [cart, setCart] = useState<CartItem[]>([])
  
  // Search
  const [productSearch, setProductSearch] = useState('')
  
  // Payment state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH')
  const [splitPayments, setSplitPayments] = useState<{method: PaymentMethod, amount: number}[]>([])
  
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [successSaleId, setSuccessSaleId] = useState<string | null>(null)

  // Computed totals matching backend RPC exactly
  const totals = useMemo(() => {
    let subtotal = 0
    let discountTotal = 0
    let grandTotal = 0

    cart.forEach(item => {
      const lineSub = item.unitPrice * item.quantity
      const lineDiscount = item.discountAmount 
      
      const lineTotal = lineSub - lineDiscount
      
      subtotal += lineSub
      discountTotal += lineDiscount
      grandTotal += lineTotal
    })

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      discountTotal: Math.round(discountTotal * 100) / 100,
      grandTotal: Math.round(grandTotal * 100) / 100
    }
  }, [cart])

  const filteredVariants = useMemo(() => {
    if (!productSearch.trim()) return variants
    const lower = productSearch.toLowerCase()
    return variants.filter(v => 
      v.productName.toLowerCase().includes(lower) || 
      v.variantName.toLowerCase().includes(lower) || 
      (v.sku && v.sku.toLowerCase().includes(lower))
    )
  }, [productSearch, variants])

  const addToCart = (variant: Variant) => {
    setSuccessSaleId(null)
    setCart(prev => {
      const existing = prev.find(item => item.variantId === variant.id)
      if (existing) {
        return prev.map(item => 
          item.variantId === variant.id 
            ? { ...item, quantity: item.quantity + 1 } 
            : item
        )
      }
      return [...prev, {
        variantId: variant.id,
        productName: variant.productName,
        variantName: variant.variantName,
        sku: variant.sku,
        quantity: 1,
        unitPrice: variant.selling_price,
        discountAmount: 0
      }]
    })
  }

  const updateQuantity = (variantId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.variantId === variantId) {
        const newQ = Math.max(1, item.quantity + delta)
        return { ...item, quantity: newQ }
      }
      return item
    }))
  }
  
  const updateDiscount = (variantId: string, amount: string) => {
    const val = parseFloat(amount) || 0
    setCart(prev => prev.map(item => {
      if (item.variantId === variantId) {
        return { ...item, discountAmount: val }
      }
      return item
    }))
  }

  const removeFromCart = (variantId: string) => {
    setCart(prev => prev.filter(item => item.variantId !== variantId))
  }

  const handleCheckoutOpen = () => {
    if (cart.length === 0) return
    setIsPaymentModalOpen(true)
    setPaymentMethod('CASH')
    // Initialize split with two methods
    setSplitPayments([
      { method: 'CASH', amount: totals.grandTotal }, 
      { method: 'CARD', amount: 0 }
    ])
    setError(null)
  }

  const handleSplitAmountChange = (index: number, amount: string) => {
    const val = parseFloat(amount) || 0
    const newSplit = [...splitPayments]
    newSplit[index].amount = val
    setSplitPayments(newSplit)
  }

  const handleSplitMethodChange = (index: number, method: PaymentMethod) => {
    const newSplit = [...splitPayments]
    newSplit[index].method = method
    setSplitPayments(newSplit)
  }

  const submitSale = () => {
    setError(null)
    
    let finalPayments: { method: PaymentMethod, amount: number }[] = []
    
    if (paymentMethod === 'SPLIT') {
      finalPayments = splitPayments.filter(p => p.amount > 0)
      const splitTotal = finalPayments.reduce((sum, p) => sum + p.amount, 0)
      // Math.abs to avoid float issues
      if (Math.abs(splitTotal - totals.grandTotal) > 0.001) {
        setError(`Split payments total ($${splitTotal.toFixed(2)}) must exactly equal grand total ($${totals.grandTotal.toFixed(2)})`)
        return
      }
    } else {
      finalPayments = [{ method: paymentMethod, amount: totals.grandTotal }]
    }

    startTransition(async () => {
      const payload = {
        storeId: selectedStoreId,
        customerId: selectedCustomerId || null,
        items: cart.map(c => ({
          variant_id: c.variantId,
          quantity: c.quantity,
          discount_amount: c.discountAmount
        })),
        payments: finalPayments
      }
      
      const res = await completeSale(payload)
      if (res?.error) {
        setError(res.error)
      } else if (res?.success) {
        setSuccessSaleId(res.saleId!)
        setIsPaymentModalOpen(false)
        setCart([])
      }
    })
  }

  return (
    <div className="h-full flex flex-col space-y-4">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Point of Sale</h1>
        
        <div className="flex gap-4">
          <select
            value={selectedStoreId}
            onChange={(e) => setSelectedStoreId(e.target.value)}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          >
            {stores.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          
          <select
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value)}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          >
            <option value="">Walk-in Customer</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>{c.name} {c.phone_number ? `(${c.phone_number})` : ''}</option>
            ))}
          </select>
        </div>
      </div>

      {successSaleId && (
        <div className="p-4 bg-green-50 border border-green-200 text-green-700 rounded-md shadow-sm">
          Sale completed successfully! Reference ID: <span className="font-mono text-sm">{successSaleId}</span>
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Product Selection Area */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <input
              type="text"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Search products by name or SKU..."
              className="w-full px-4 py-3 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
            />
          </div>
          <div className="flex-1 p-4 overflow-y-auto bg-gray-50">
            {filteredVariants.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <p className="text-gray-500 mb-2">No products found</p>
                <p className="text-sm text-gray-400">Try adjusting your search</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {filteredVariants.map(variant => (
                  <button
                    key={variant.id}
                    onClick={() => addToCart(variant)}
                    className="flex flex-col p-4 bg-white border border-gray-200 rounded-lg shadow-sm hover:border-indigo-500 hover:ring-1 hover:ring-indigo-500 transition-all text-left"
                  >
                    <span className="font-semibold text-gray-900 truncate w-full" title={variant.productName}>
                      {variant.productName}
                    </span>
                    <span className="text-sm text-gray-500 truncate w-full" title={variant.variantName}>
                      {variant.variantName}
                    </span>
                    <div className="mt-2 flex justify-between items-center w-full">
                      <span className="text-xs text-gray-400">{variant.sku}</span>
                      <span className="font-medium text-indigo-600">${Number(variant.selling_price).toFixed(2)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Cart Area */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <h2 className="text-lg font-semibold text-gray-900">Current Sale</h2>
          </div>
          
          <div className="flex-1 p-0 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-500 p-8">
                Cart is empty
              </div>
            ) : (
              <ul className="divide-y divide-gray-200">
                {cart.map(item => (
                  <li key={item.variantId} className="p-4 hover:bg-gray-50">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1 min-w-0 pr-4">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.productName}</p>
                        <p className="text-xs text-gray-500 truncate">{item.variantName}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-900">
                          ${((item.unitPrice * item.quantity) - item.discountAmount).toFixed(2)}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center border border-gray-300 rounded-md">
                        <button 
                          onClick={() => updateQuantity(item.variantId, -1)}
                          className="px-2 py-1 text-gray-600 hover:bg-gray-100 rounded-l-md"
                        >-</button>
                        <span className="px-2 py-1 text-sm text-gray-900 min-w-[2rem] text-center">
                          {item.quantity}
                        </span>
                        <button 
                          onClick={() => updateQuantity(item.variantId, 1)}
                          className="px-2 py-1 text-gray-600 hover:bg-gray-100 rounded-r-md"
                        >+</button>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <div className="flex items-center">
                          <span className="text-xs text-gray-500 mr-1">Disc: $</span>
                          <input 
                            type="number" 
                            min="0"
                            step="0.01"
                            value={item.discountAmount || ''}
                            onChange={(e) => updateDiscount(item.variantId, e.target.value)}
                            className="w-16 p-1 text-xs border border-gray-300 rounded focus:border-indigo-500 focus:ring-indigo-500 text-gray-900"
                          />
                        </div>
                        <button 
                          onClick={() => removeFromCart(item.variantId)}
                          className="text-red-500 hover:text-red-700 p-1"
                          title="Remove item"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="p-4 border-t border-gray-200 bg-gray-50 space-y-3">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span>
              <span>${totals.subtotal.toFixed(2)}</span>
            </div>
            {totals.discountTotal > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Discount</span>
                <span>-${totals.discountTotal.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold text-gray-900 pt-2 border-t border-gray-200">
              <span>Grand Total</span>
              <span>${totals.grandTotal.toFixed(2)}</span>
            </div>
            
            <button
              onClick={handleCheckoutOpen}
              disabled={cart.length === 0}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-300 disabled:cursor-not-allowed transition-colors"
            >
              Checkout (${totals.grandTotal.toFixed(2)})
            </button>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-medium text-gray-900">Complete Payment</h3>
              <button 
                onClick={() => {
                  setIsPaymentModalOpen(false)
                  setError(null)
                }}
                disabled={isPending}
                className="text-gray-400 hover:text-gray-500 focus:outline-none"
              >
                &times;
              </button>
            </div>
            
            <div className="p-6">
              <div className="mb-6 text-center">
                <p className="text-sm text-gray-500 mb-1">Amount Due</p>
                <p className="text-3xl font-bold text-gray-900">${totals.grandTotal.toFixed(2)}</p>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['CASH', 'UPI', 'CARD', 'SPLIT'] as PaymentMethod[]).map(method => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setPaymentMethod(method)}
                        className={`px-4 py-2 border rounded-md text-sm font-medium ${
                          paymentMethod === method 
                            ? 'bg-indigo-50 border-indigo-500 text-indigo-700' 
                            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {method}
                      </button>
                    ))}
                  </div>
                </div>

                {paymentMethod === 'SPLIT' && (
                  <div className="mt-4 space-y-3 bg-gray-50 p-4 rounded-md border border-gray-200">
                    <p className="text-sm font-medium text-gray-700">Split Breakdown</p>
                    {splitPayments.map((split, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <select 
                          value={split.method}
                          onChange={(e) => handleSplitMethodChange(idx, e.target.value as PaymentMethod)}
                          className="block w-1/2 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        >
                          <option value="CASH">CASH</option>
                          <option value="UPI">UPI</option>
                          <option value="CARD">CARD</option>
                        </select>
                        <div className="relative flex-1">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <span className="text-gray-500 sm:text-sm">$</span>
                          </div>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={split.amount || ''}
                            onChange={(e) => handleSplitAmountChange(idx, e.target.value)}
                            className="block w-full pl-7 rounded-md border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900"
                          />
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between items-center text-sm pt-2">
                      <span className="text-gray-500">Split Total:</span>
                      <span className={`font-medium ${
                        Math.abs(splitPayments.reduce((s, p) => s + p.amount, 0) - totals.grandTotal) < 0.001 
                          ? 'text-green-600' 
                          : 'text-red-600'
                      }`}>
                        ${splitPayments.reduce((s, p) => s + p.amount, 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-8">
                <button
                  onClick={submitSale}
                  disabled={isPending}
                  className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400"
                >
                  {isPending ? 'Processing...' : 'Confirm Payment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
