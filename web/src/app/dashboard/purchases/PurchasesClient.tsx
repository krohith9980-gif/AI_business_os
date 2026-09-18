'use client'

import React, { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createPurchaseOrder } from './actions'
import { formatCurrency } from '@/utils/currency'
import AIInvoiceModal from './AIInvoiceModal'

type PurchaseItem = {
  variant_id: string
  quantity: number
  purchase_cost: number
}

type Supplier = { id: string; name: string; attributes?: any }
type Variant = { id: string; sku: string | null; selling_price: number; attributes?: any; unit_of_measure?: string; product?: { name: string } | { name: string }[] | null }

function getVariantName(v: Variant): string {
  const baseName = Array.isArray(v.product) ? v.product[0]?.name : v.product?.name || '';
  if (!v.attributes) return baseName;
  
  // Extract sizing or volume attributes if they exist
  const sizeStr = v.attributes.size || v.attributes.volume || v.attributes.weight || v.attributes.measurement || v.attributes.variant || '';
  if (sizeStr && typeof sizeStr === 'string' && !baseName.toLowerCase().includes(sizeStr.toLowerCase())) {
    return `${baseName} ${sizeStr}`;
  }
  return baseName;
}

export default function PurchasesClient({
  initialPurchases,
  suppliers,
  variants,
  storeId,
  storeName
}: {
  initialPurchases: any[]
  suppliers: Supplier[]
  variants: Variant[]
  storeId: string
  storeName: string
}) {
  const purchases = initialPurchases
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isAiModalOpen, setIsAiModalOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  // Form State
  const [formStep, setFormStep] = useState<'edit' | 'review'>('edit')
  const [supplierId, setSupplierId] = useState('')
  const [items, setItems] = useState<PurchaseItem[]>([])
  
  // Idempotency Key
  const [idempotencyKey, setIdempotencyKey] = useState('')

  const openNewPurchaseModal = () => {
    setFormStep('edit')
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

  const getWhatsAppUrl = () => {
    const supplier = suppliers.find(s => s.id === supplierId);
    if (!supplier) return null;
    let rawPhone = supplier.attributes?.phone || supplier.attributes?.whatsapp_number || supplier.attributes?.contact_number || '';
    if (!rawPhone) return null;

    let phone = rawPhone.replace(/\D/g, '');
    if (phone.length === 10) {
      phone = '91' + phone;
    }
    
    let message = `Hello ${supplier.name},\n\nWe would like to reorder the following products:\n\n`;
    items.forEach(item => {
      const v = variants.find(v => v.id === item.variant_id);
      if (v) {
        const productName = getVariantName(v);
        const uom = v.attributes?.measurementUnit || v.unit_of_measure || 'PCS';
        message += `• ${productName} — ${item.quantity} ${uom}\n`;
      }
    });
    message += `\nPlease confirm availability and current price.\n\nThank you,\n${storeName}`;

    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  }

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

    if (formStep === 'edit') {
      const waUrl = getWhatsAppUrl();
      if (!waUrl) {
        setError('Supplier WhatsApp number is missing.');
        return;
      }
      setFormStep('review');
      return;
    }

    startTransition(async () => {
      // NOTE: idempotencyKey is preserved during retries. It only changes on a NEW purchase.
      const result = await createPurchaseOrder(storeId, supplierId, idempotencyKey, items)
      
      if (result?.error) {
        setError(result.error)
      } else if (result?.success) {
        setIsModalOpen(false)
        setIdempotencyKey('')
        
        const waUrl = getWhatsAppUrl();
        if (waUrl) {
          window.open(waUrl, '_blank', 'noopener,noreferrer');
        }
        
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Purchases</h1>
        <div className="flex gap-3">
          <button 
            onClick={() => setIsAiModalOpen(true)}
            className="inline-flex justify-center rounded-md border border-indigo-600 bg-white py-2 px-4 text-sm font-medium text-indigo-600 shadow-sm hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Upload Invoice (AI)
          </button>
          <button 
            onClick={openNewPurchaseModal}
            className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Create Purchase Order
          </button>
        </div>
      </div>

      <div className="bg-white shadow-sm rounded-lg border border-gray-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Supplier</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {purchases.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-500">
                    No purchase orders found
                  </td>
                </tr>
              ) : (
                purchases.map((po) => (
                  <tr key={po.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(po.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{po.supplier_name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className="inline-flex rounded-full bg-green-100 px-2 text-xs font-semibold leading-5 text-green-800">
                        {po.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                        po.payment_status === 'PAID' ? 'bg-blue-100 text-blue-800' :
                        po.payment_status === 'PARTIALLY_PAID' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {po.payment_status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-medium">
                      {formatCurrency(po.total)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button onClick={() => router.push(`/dashboard/purchases/${po.id}`)} className="text-indigo-600 hover:text-indigo-900 focus:outline-none">
                        View Details
                      </button>
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
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md flex justify-between items-center">
                    <span>{error}</span>
                    {error === 'Supplier WhatsApp number is missing.' && (
                      <button type="button" onClick={() => router.push('/dashboard/suppliers')} className="ml-4 px-3 py-1 bg-white text-red-700 text-xs font-medium border border-red-200 rounded hover:bg-red-50 whitespace-nowrap">
                        Add WhatsApp Number
                      </button>
                    )}
                  </div>
                )}
                
                {formStep === 'edit' ? (
                  <>
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
                                  const productName = getVariantName(v);
                                  return (
                                    <option key={v.id} value={v.id}>
                                      {productName || 'Unnamed'} {v.sku ? `(${v.sku})` : ''}
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
                              {formatCurrency(item.quantity * item.purchase_cost)}
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
                        <span className="text-lg font-bold text-gray-900">{formatCurrency(totalCost)}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                      <h4 className="text-sm font-medium text-gray-500 mb-1">Supplier</h4>
                      <p className="text-lg font-bold text-gray-900">{suppliers.find(s => s.id === supplierId)?.name}</p>
                    </div>
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                      <h4 className="text-sm font-medium text-gray-500 mb-3">Products</h4>
                      <ul className="space-y-2">
                        {items.map((item, idx) => {
                          const v = variants.find(v => v.id === item.variant_id);
                          const productName = v ? getVariantName(v) : 'Unknown';
                          const uom = v?.attributes?.measurementUnit || v?.unit_of_measure || 'PCS';
                          return (
                            <li key={idx} className="flex justify-between items-center bg-white p-2 border border-gray-200 rounded">
                              <span className="font-medium text-gray-900">
                                {productName} <span className="text-gray-400 mx-1">—</span> {item.quantity} {uom}
                              </span>
                              <span className="text-gray-900 font-medium">{formatCurrency(item.quantity * item.purchase_cost)}</span>
                            </li>
                          )
                        })}
                      </ul>
                      <div className="mt-4 text-right pt-4 border-t border-gray-200">
                        <span className="text-sm font-medium text-gray-500">Total Purchase Value: </span>
                        <span className="text-lg font-bold text-gray-900">{formatCurrency(totalCost)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 bg-gray-50 shrink-0">
                <button
                  type="button"
                  onClick={() => formStep === 'review' ? setFormStep('edit') : setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50"
                >
                  {formStep === 'review' ? 'Back' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isPending || items.length === 0}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 disabled:bg-indigo-400"
                >
                  {formStep === 'review' ? (isPending ? 'Processing...' : 'Confirm & Open WhatsApp') : 'Review Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AIInvoiceModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        onSuccess={() => {
          setIsAiModalOpen(false)
          router.refresh()
        }}
        suppliers={suppliers}
        variants={variants}
        storeId={storeId}
      />
    </div>
  )
}
