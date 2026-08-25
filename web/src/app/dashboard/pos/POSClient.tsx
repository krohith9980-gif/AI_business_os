'use client'

import React, { useState, useTransition, useMemo } from 'react'
import { completeSale, createCustomerFromPOS } from './actions'
import { formatCurrency } from '@/utils/currency'

type Store = { id: string; name: string }
type Customer = { id: string; name: string; phone_number: string | null; email: string | null; village: string | null }
type Variant = { 
  id: string
  productName: string
  variantName: string
  sku: string
  selling_price: number
  unit_of_measure: string
  packaging_type: string
  units_per_pack: number
}

type Inventory = {
  store_id: string
  variant_id: string
  available_stock: number
}

type CartItem = {
  variantId: string
  productName: string
  variantName: string
  sku: string
  displayQuantity: number
  saleUnit: string
  unitPrice: number
  discountAmount: number // flat amount per line item
  packagingType: string
  unitsPerPack: number
  baseUnit: string
}

type PaymentMethod = 'CASH' | 'UPI' | 'CARD' | 'SPLIT' | 'CREDIT'

export default function POSClient({
  stores,
  customers,
  variants,
  inventory
}: {
  stores: Store[]
  customers: Customer[]
  variants: Variant[]
  inventory: Inventory[]
}) {
  const [selectedStoreId, setSelectedStoreId] = useState<string>(stores[0]?.id || '')
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('')
  const [cart, setCart] = useState<CartItem[]>([])
  
  // Search
  const [productSearch, setProductSearch] = useState('')
  
  // Payment state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH')
  const [splitPayments, setSplitPayments] = useState<{method: 'CASH' | 'UPI' | 'CARD', amount: number}[]>([])
  
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [successSaleId, setSuccessSaleId] = useState<string | null>(null)

  // Customer Step State
  const [step, setStep] = useState<'CUSTOMER' | 'BILLING'>('CUSTOMER')
  const [custName, setCustName] = useState('')
  const [custPhone, setCustPhone] = useState('')
  const [custVillage, setCustVillage] = useState('')
  const [creatingCustomer, setCreatingCustomer] = useState(false)
  const [localCustomers, setLocalCustomers] = useState<Customer[]>(customers)

  const matchedCustomer = useMemo(() => {
    if (!custPhone.trim()) return null
    return localCustomers.find(c => c.phone_number === custPhone.trim()) || null
  }, [custPhone, localCustomers])

  const handleUseExistingCustomer = () => {
    if (matchedCustomer) {
      setSelectedCustomerId(matchedCustomer.id)
      setStep('BILLING')
      setError(null)
    }
  }

  const handleCreateAndContinue = () => {
    if (!custName.trim() || !custPhone.trim() || !custVillage.trim()) {
      setError('Name, Phone, and Village are required for a new customer.')
      return
    }
    setError(null)
    setCreatingCustomer(true)
    startTransition(async () => {
      const res = await createCustomerFromPOS(custName, custPhone, custVillage)
      setCreatingCustomer(false)
      if (res.error) {
        setError(res.error)
      } else if (res.customer) {
        setLocalCustomers(prev => [...prev, res.customer])
        setSelectedCustomerId(res.customer.id)
        setStep('BILLING')
      }
    })
  }

  // Computed totals matching backend RPC exactly
  const totals = useMemo(() => {
    let subtotal = 0
    let discountTotal = 0
    let grandTotal = 0

    cart.forEach(item => {
      const multiplier = (item.saleUnit === item.packagingType && item.packagingType !== 'NONE') ? item.unitsPerPack : 1;
      const lineSub = (item.unitPrice * multiplier) * item.displayQuantity;
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

  const addToCart = (variant: Variant, saleUnit: string) => {
    setSuccessSaleId(null)
    setCart(prev => {
      const existing = prev.find(item => item.variantId === variant.id && item.saleUnit === saleUnit)
      if (existing) {
        return prev.map(item => 
          item.variantId === variant.id && item.saleUnit === saleUnit
            ? { ...item, displayQuantity: item.displayQuantity + 1 } 
            : item
        )
      }
      return [...prev, {
        variantId: variant.id,
        productName: variant.productName,
        variantName: variant.variantName,
        sku: variant.sku,
        displayQuantity: 1,
        saleUnit: saleUnit,
        unitPrice: variant.selling_price,
        discountAmount: 0,
        packagingType: variant.packaging_type,
        unitsPerPack: variant.units_per_pack,
        baseUnit: variant.unit_of_measure
      }]
    })
  }

  const updateQuantity = (variantId: string, saleUnit: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.variantId === variantId && item.saleUnit === saleUnit) {
        const newQ = Math.max(1, item.displayQuantity + delta)
        return { ...item, displayQuantity: newQ }
      }
      return item
    }))
  }
  
  const updateDiscount = (variantId: string, saleUnit: string, amount: string) => {
    const val = parseFloat(amount) || 0
    setCart(prev => prev.map(item => {
      if (item.variantId === variantId && item.saleUnit === saleUnit) {
        return { ...item, discountAmount: val }
      }
      return item
    }))
  }

  const removeFromCart = (variantId: string, saleUnit: string) => {
    setCart(prev => prev.filter(item => !(item.variantId === variantId && item.saleUnit === saleUnit)))
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

  const handleSplitMethodChange = (index: number, method: 'CASH' | 'UPI' | 'CARD') => {
    const newSplit = [...splitPayments]
    newSplit[index].method = method
    setSplitPayments(newSplit)
  }

  const submitSale = () => {
    setError(null)
    
    let finalPayments: { method: PaymentMethod, amount: number }[] = []
    
    if (paymentMethod === 'CREDIT') {
      if (!selectedCustomerId) {
        setError('Select a customer for credit sale.')
        return
      }
      // Leave finalPayments empty to trigger outstanding balance calculation in the backend
    } else if (paymentMethod === 'SPLIT') {
      finalPayments = splitPayments.filter(p => p.amount > 0)
      const splitTotal = finalPayments.reduce((sum, p) => sum + p.amount, 0)
      // Math.abs to avoid float issues
      if (Math.abs(splitTotal - totals.grandTotal) > 0.001) {
        setError(`Split payments total (${formatCurrency(splitTotal)}) must exactly equal grand total (${formatCurrency(totals.grandTotal)})`)
        return
      }
    } else {
      finalPayments = [{ method: paymentMethod as 'CASH' | 'UPI' | 'CARD', amount: totals.grandTotal }]
    }

    startTransition(async () => {
      const payload = {
        storeId: selectedStoreId,
        customerId: selectedCustomerId || null,
        items: cart.map(c => ({
          variant_id: c.variantId,
          display_quantity: c.displayQuantity,
          sale_unit: c.saleUnit,
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
        </div>
      </div>

      {step === 'CUSTOMER' ? (
        <div className="bg-white p-6 shadow-sm rounded-lg border border-gray-200">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Customer Details</h2>
          {error && <div className="mb-4 text-sm text-red-600 bg-red-50 p-2 rounded-md">{error}</div>}
          <div className="grid grid-cols-1 gap-y-4 gap-x-4 sm:grid-cols-2 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">Customer Name *</label>
              <input
                type="text"
                value={custName}
                onChange={(e) => setCustName(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                placeholder="Ramesh Kumar"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Phone Number *</label>
              <input
                type="text"
                value={custPhone}
                onChange={(e) => setCustPhone(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                placeholder="9876543210"
              />
            </div>
          </div>
          
          {matchedCustomer ? (
            <div className="bg-green-50 p-4 rounded-md border border-green-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-green-800 mb-1">✓ Customer Found</p>
                <p className="text-sm text-green-700 font-medium">{matchedCustomer.name}</p>
                <p className="text-sm text-green-700">{matchedCustomer.phone_number}</p>
                <p className="text-sm text-green-700">{matchedCustomer.village}</p>
              </div>
              <button 
                onClick={handleUseExistingCustomer} 
                className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700"
              >
                Use Customer
              </button>
            </div>
          ) : custPhone.trim() ? (
            <div className="bg-gray-50 p-4 rounded-md border border-gray-200">
              <h3 className="text-sm font-medium text-gray-900 mb-3">New Customer</h3>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700">Village *</label>
                <input
                  type="text"
                  value={custVillage}
                  onChange={(e) => setCustVillage(e.target.value)}
                  className="mt-1 block w-full sm:w-1/2 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  placeholder="Miryala"
                />
              </div>
              <button 
                onClick={handleCreateAndContinue} 
                disabled={creatingCustomer}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 disabled:bg-indigo-400"
              >
                {creatingCustomer ? 'Creating...' : 'Continue Billing'}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="bg-indigo-50 p-4 rounded-lg flex items-center justify-between border border-indigo-100">
             <div>
                <p className="text-xs text-indigo-500 font-bold uppercase tracking-wider mb-1">CUSTOMER</p>
                <p className="text-sm font-medium text-indigo-900">{localCustomers.find(c => c.id === selectedCustomerId)?.name}</p>
                <p className="text-sm text-indigo-700">{localCustomers.find(c => c.id === selectedCustomerId)?.phone_number} | {localCustomers.find(c => c.id === selectedCustomerId)?.village}</p>
             </div>
             <button 
                onClick={() => setStep('CUSTOMER')} 
                className="text-sm text-indigo-600 font-medium hover:text-indigo-800 bg-white px-3 py-1.5 rounded border border-indigo-200 shadow-sm"
             >
               Change Customer
             </button>
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
                {filteredVariants.map(variant => {
                  const stock = inventory.find(i => i.variant_id === variant.id && i.store_id === selectedStoreId)?.available_stock || 0
                  return (
                  <div
                    key={variant.id}
                    className="flex flex-col p-4 bg-white border border-gray-200 rounded-lg shadow-sm text-left"
                  >
                    <div className="flex justify-between items-start w-full">
                      <span className="font-semibold text-gray-900 truncate w-full" title={variant.productName}>
                        {variant.productName}
                      </span>
                      <span className={`text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ml-2 ${stock > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {stock} {variant.unit_of_measure}
                      </span>
                    </div>
                    <span className="text-sm text-gray-500 truncate w-full" title={variant.variantName}>
                      {variant.variantName}
                    </span>
                    <div className="mt-3 flex flex-col gap-2 w-full">
                      <span className="text-xs text-gray-400">{variant.sku}</span>
                      <div className="flex flex-wrap gap-2 mt-1">
                        <button 
                          onClick={() => addToCart(variant, variant.unit_of_measure)}
                          className="px-2 py-1.5 text-xs font-medium bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100 border border-indigo-200 transition-colors"
                        >
                          <span className="font-medium">+ {variant.unit_of_measure} ({formatCurrency(variant.selling_price)})</span>
                        </button>
                        {variant.packaging_type !== 'NONE' && (
                          <button 
                            onClick={() => addToCart(variant, variant.packaging_type)}
                            className="px-2 py-1.5 text-xs font-medium bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100 border border-indigo-200 transition-colors"
                          >
                            <span className="font-medium">+ {variant.packaging_type} ({formatCurrency(variant.selling_price * variant.units_per_pack)})</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  )
                })}
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
                  <li key={`${item.variantId}-${item.saleUnit}`} className="p-4 hover:bg-gray-50">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1 min-w-0 pr-4">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.productName}</p>
                        <p className="text-xs text-gray-500 truncate">{item.saleUnit} {item.saleUnit === item.packagingType && item.packagingType !== 'NONE' ? `(${item.unitsPerPack} ${item.baseUnit})` : ''}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-medium text-gray-900">
                          {formatCurrency(((item.saleUnit === item.packagingType && item.packagingType !== 'NONE' ? item.unitsPerPack : 1) * item.unitPrice * item.displayQuantity) - item.discountAmount)}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center border border-gray-300 rounded-md">
                        <button 
                          onClick={() => updateQuantity(item.variantId, item.saleUnit, -1)}
                          className="px-2 py-1 text-gray-600 hover:bg-gray-100 rounded-l-md"
                        >-</button>
                        <span className="px-2 py-1 text-sm text-gray-900 min-w-[2rem] text-center">
                          {item.displayQuantity}
                        </span>
                        <button 
                          onClick={() => updateQuantity(item.variantId, item.saleUnit, 1)}
                          className="px-2 py-1 text-gray-600 hover:bg-gray-100 rounded-r-md"
                        >+</button>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <div className="flex items-center">
                          <span className="text-xs text-gray-500 mr-1">Disc: ₹</span>
                          <input 
                            type="number" 
                            min="0"
                            step="0.01"
                            value={item.discountAmount || ''}
                            onChange={(e) => updateDiscount(item.variantId, item.saleUnit, e.target.value)}
                            className="w-16 p-1 text-xs border border-gray-300 rounded focus:border-indigo-500 focus:ring-indigo-500 text-gray-900"
                          />
                        </div>
                        <button 
                          onClick={() => removeFromCart(item.variantId, item.saleUnit)}
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
              <span>{formatCurrency(totals.subtotal)}</span>
            </div>
            {totals.discountTotal > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Discount</span>
                <span>-{formatCurrency(totals.discountTotal)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold text-gray-900 pt-2 border-t border-gray-200">
              <span>Grand Total</span>
              <span>{formatCurrency(totals.grandTotal)}</span>
            </div>
            
            <button
              onClick={handleCheckoutOpen}
              disabled={cart.length === 0}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-300 disabled:cursor-not-allowed transition-colors"
            >
              Checkout ({formatCurrency(totals.grandTotal)})
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
                <p className="text-3xl font-bold text-gray-900">{formatCurrency(totals.grandTotal)}</p>
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
                    {([...(['CASH', 'UPI', 'CARD', 'SPLIT'] as PaymentMethod[]), 'CREDIT']).map(method => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setPaymentMethod(method as PaymentMethod | 'CREDIT')}
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

                {paymentMethod === 'CREDIT' && (
                  <div className="mt-4 p-4 bg-yellow-50 rounded-md border border-yellow-200">
                    <p className="text-sm text-yellow-800 font-medium mb-1">Credit Sale Details</p>
                    {selectedCustomerId ? (
                      <p className="text-sm text-yellow-700">
                        The amount of {formatCurrency(totals.grandTotal)} will be added to the outstanding balance of the selected customer.
                      </p>
                    ) : (
                      <p className="text-sm font-bold text-red-600">
                        Please select a customer before confirming a credit sale.
                      </p>
                    )}
                  </div>
                )}

                {paymentMethod === 'SPLIT' && (
                  <div className="mt-4 space-y-3 bg-gray-50 p-4 rounded-md border border-gray-200">
                    <p className="text-sm font-medium text-gray-700">Split Breakdown</p>
                    {splitPayments.map((split, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <select 
                          value={split.method}
                          onChange={(e) => handleSplitMethodChange(idx, e.target.value as 'CASH' | 'UPI' | 'CARD')}
                          className="block w-1/2 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        >
                          <option value="CASH">CASH</option>
                          <option value="UPI">UPI</option>
                          <option value="CARD">CARD</option>
                        </select>
                        <div className="relative flex-1">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <span className="text-gray-500 sm:text-sm">₹</span>
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
                        {formatCurrency(splitPayments.reduce((s, p) => s + p.amount, 0))}
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
        </>
      )}
    </div>
  )
}
