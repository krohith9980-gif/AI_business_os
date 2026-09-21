'use client'

import React, { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createPurchaseOrder } from './actions'
import { formatCurrency } from '@/utils/currency'
import AIInvoiceModal from './AIInvoiceModal'

type PurchaseItem = {
  variant_id: string
  purchase_unit: string
  package_quantity?: number
  units_per_package?: number
  quantity: number
  purchase_cost: number
}

type Supplier = { id: string; name: string; attributes?: any }
type Variant = { id: string; sku: string | null; selling_price: number; attributes?: any; unit_of_measure?: string; packaging_type?: string; units_per_pack?: number; product?: { name: string } | { name: string }[] | null }

function getVariantName(v: Variant): string {
  const baseName = Array.isArray(v.product) ? v.product[0]?.name : v.product?.name || '';
  if (!v.attributes) return baseName;
  
  // Extract sizing or volume attributes if they exist
  const sizeStr = v.attributes.measurementValue && v.attributes.measurementUnit 
      ? `${v.attributes.measurementValue} ${v.attributes.measurementUnit}`
      : v.attributes.size || v.attributes.volume || v.attributes.weight || v.attributes.measurement || v.attributes.variant || '';
      
  if (sizeStr && typeof sizeStr === 'string' && !baseName.toLowerCase().includes(sizeStr.toLowerCase())) {
    return `${baseName} — ${sizeStr}`;
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
    setItems([{ variant_id: '', purchase_unit: 'PCS', package_quantity: undefined, units_per_package: 1, quantity: 1, purchase_cost: 0 }])
    setIdempotencyKey(crypto.randomUUID())
    setError(null)
    setIsModalOpen(true)
  }

  const handleAddItem = () => {
    setItems([...items, { variant_id: '', purchase_unit: 'PCS', package_quantity: undefined, units_per_package: 1, quantity: 1, purchase_cost: 0 }])
  }

  const handleUpdateItem = (index: number, updates: Partial<PurchaseItem>) => {
    const newItems = [...items]
    newItems[index] = { ...newItems[index], ...updates }
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

    let phoneStr = String(rawPhone || '');
    let phone = phoneStr.replace(/\D/g, ''); // strip all non-digits
    
    // Normalize Indian Numbers
    if (phone.length === 10) {
      phone = '91' + phone;
    } else if (phone.length === 11 && phone.startsWith('0')) {
      phone = '91' + phone.substring(1);
    }
    
    if (phone.length < 10) return null; // Reject obviously invalid
    
    let message = `Hello ${supplier.name},\n\nWe would like to reorder the following products:\n\n`;
    items.forEach(item => {
      const v = variants.find(v => v.id === item.variant_id);
      if (v) {
        const productName = getVariantName(v);
        const baseUom = v.unit_of_measure || 'PCS';
        
        const isPkg = item.purchase_unit !== baseUom && item.purchase_unit !== 'PCS';
        if (isPkg) {
          message += `• ${productName} — ${item.package_quantity} ${item.purchase_unit} (${item.units_per_package} ${baseUom}/${item.purchase_unit} = ${item.quantity} ${baseUom})\n`;
        } else {
          message += `• ${productName} — ${item.quantity} ${baseUom}\n`;
        }
      }
    });
    message += `\nPlease confirm availability and delivery.\n\nThank you,\n${storeName}`;

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
      if (item.quantity <= 0) return setError('Base Quantity must be greater than 0')
      if (item.purchase_cost < 0) return setError('Cost cannot be negative')
    }

    if (formStep === 'edit') {
      const waUrl = getWhatsAppUrl();
      if (!waUrl) {
        setError('Supplier WhatsApp number is missing or invalid.');
        return;
      }
      setFormStep('review');
      return;
    }

    // 7. Before RPC submission, normalize the complete payload again.
    const normalizedItems = items.map(item => {
      const v = variants.find(v => v.id === item.variant_id);
      const baseUom = v?.unit_of_measure || 'PCS';
      const isPkg = item.purchase_unit !== baseUom && item.purchase_unit !== 'PCS';

      if (isPkg) {
        return {
          variant_id: item.variant_id,
          package_unit: item.purchase_unit, // the normalized package unit
          package_quantity: item.package_quantity || 1,
          units_per_package: item.units_per_package || 1,
          quantity: (item.package_quantity || 1) * (item.units_per_package || 1),
          purchase_cost: item.purchase_cost
        };
      } else {
        return {
          variant_id: item.variant_id,
          package_unit: 'PCS', // always PCS for base units
          package_quantity: undefined,
          units_per_package: 1,
          quantity: item.quantity || 1,
          purchase_cost: item.purchase_cost
        };
      }
    });

    // 8. Add a final client-side invariant check
    for (const item of normalizedItems) {
      if (item.package_unit === 'PCS' && item.units_per_package !== 1) {
        setError('Invariant Error: PCS item has units_per_package != 1');
        return;
      }
      if (item.package_unit !== 'PCS') {
        if (!item.package_quantity || !item.units_per_package) {
          setError('Invariant Error: Package item missing quantity or units');
          return;
        }
        if (item.quantity !== item.package_quantity * item.units_per_package) {
          setError('Invariant Error: Base quantity mismatch');
          return;
        }
      }
    }

    startTransition(async () => {
      console.log("Submitting normalized payload:", normalizedItems);
      const result = await createPurchaseOrder(storeId, supplierId, idempotencyKey, normalizedItems as any)

      
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
                      <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                        po.status === 'PENDING' ? 'bg-gray-100 text-gray-800' :
                        po.status === 'SUPPLIER_CONFIRMED' ? 'bg-green-100 text-green-800' :
                        po.status === 'PARTIAL_RECEIVED' ? 'bg-yellow-100 text-yellow-800' :
                        po.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                        po.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                        po.status === 'CANCELLED' ? 'bg-gray-100 text-gray-500' :
                        'bg-gray-100 text-gray-800'
                      }`}>
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
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
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
                    <span className="font-medium">{error}</span>
                    {error.includes('WhatsApp number is missing') && (
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
                        <button type="button" onClick={handleAddItem} className="text-sm font-semibold text-indigo-600 hover:text-indigo-900">
                          + Add Item
                        </button>
                      </div>
                      
                      <div className="space-y-4">
                        {items.map((item, index) => {
                          const v = variants.find(v => v.id === item.variant_id);
                          const baseUom = v?.unit_of_measure || 'PCS';
                          const hasPackage = v?.packaging_type && v.packaging_type !== 'NONE';
                          const isPackage = item.purchase_unit !== baseUom && item.purchase_unit !== 'PCS';

                          const PACKAGE_UNITS = [
                            'BOX', 'CTN', 'CARTON', 'PACK', 'PAC', 'PKT', 'BAG', 
                            'BTL', 'BOTTLE', 'STRIP', 'BALE', 'DOZEN', 'ROLL', 
                            'DRUM', 'JAR', 'TIN', 'CAN'
                          ];

                          return (
                            <div key={index} className="flex flex-col sm:flex-row gap-3 items-end border border-gray-300 p-4 rounded-md bg-gray-50">
                              <div className="flex-1 w-full">
                                <label className="block text-xs font-bold text-gray-700 mb-1">Product Variant</label>
                                <select
                                  value={item.variant_id}
                                  onChange={e => {
                                    const variant = variants.find(v => v.id === e.target.value);
                                    handleUpdateItem(index, { 
                                      variant_id: e.target.value,
                                      purchase_unit: variant?.unit_of_measure || 'PCS',
                                      package_quantity: undefined,
                                      units_per_package: 1,
                                      quantity: 1
                                    });
                                  }}
                                  required
                                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm"
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

                              <div className="w-full sm:w-36 shrink-0">
                                <label className="block text-xs font-bold text-gray-700 mb-1">Purchase Unit</label>
                                <select
                                  value={item.purchase_unit}
                                  onChange={e => {
                                    const pu = e.target.value;
                                    const isPkg = pu !== baseUom && pu !== 'PCS';
                                    if (isPkg) {
                                      const defaultUpp = (pu === v?.packaging_type && v?.units_per_pack) ? v.units_per_pack : 1;
                                      handleUpdateItem(index, {
                                        purchase_unit: pu,
                                        package_quantity: item.package_quantity || 1,
                                        units_per_package: defaultUpp,
                                        quantity: (item.package_quantity || 1) * defaultUpp
                                      });
                                    } else {
                                      handleUpdateItem(index, {
                                        purchase_unit: pu,
                                        package_quantity: undefined,
                                        units_per_package: 1,
                                        quantity: item.quantity || 1
                                      });
                                    }
                                  }}
                                  disabled={!v}
                                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm disabled:bg-gray-100"
                                >
                                  {v && <option value={baseUom}>{baseUom}</option>}
                                  {v && baseUom !== 'PCS' && <option value="PCS">PCS</option>}
                                  <optgroup label="Packages">
                                    {hasPackage && v?.packaging_type && !PACKAGE_UNITS.includes(v.packaging_type) && (
                                      <option value={v.packaging_type}>{v.packaging_type}</option>
                                    )}
                                    {PACKAGE_UNITS.map(pu => (
                                      <option key={pu} value={pu}>{pu}</option>
                                    ))}
                                  </optgroup>
                                </select>
                              </div>

                              {isPackage ? (
                                <div className="flex gap-2 shrink-0">
                                  <div className="w-20">
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Pkg Qty</label>
                                    <input
                                      type="number"
                                      min="1"
                                      required
                                      value={item.package_quantity || ''}
                                      onChange={e => {
                                        const val = parseInt(e.target.value) || 0;
                                        handleUpdateItem(index, {
                                          package_quantity: val,
                                          quantity: val * (item.units_per_package || 1)
                                        });
                                      }}
                                      className="block w-full rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-900 shadow-sm"
                                    />
                                  </div>
                                  <div className="flex items-center justify-center pb-2 text-gray-400 font-bold">×</div>
                                  <div className="w-20">
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Units/{item.purchase_unit}</label>
                                    <input
                                      type="number"
                                      min="1"
                                      required
                                      value={item.units_per_package || ''}
                                      onChange={e => {
                                        const val = parseInt(e.target.value) || 0;
                                        handleUpdateItem(index, {
                                          units_per_package: val,
                                          quantity: (item.package_quantity || 1) * val
                                        });
                                      }}
                                      className="block w-full rounded-md border border-gray-300 px-2 py-2 text-sm text-gray-900 shadow-sm"
                                    />
                                  </div>
                                  <div className="flex flex-col justify-end pb-3 pl-1">
                                    <p className="text-xs font-black text-indigo-700 whitespace-nowrap">
                                      = {item.quantity} {baseUom}
                                    </p>
                                  </div>
                                </div>
                              ) : (
                                <div className="w-full sm:w-28 shrink-0">
                                  <label className="block text-xs font-bold text-gray-700 mb-1">Quantity</label>
                                  <input
                                    type="number"
                                    min="1"
                                    required
                                    value={item.quantity || ''}
                                    onChange={e => handleUpdateItem(index, { quantity: parseInt(e.target.value) || 0 })}
                                    className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm"
                                  />
                                </div>
                              )}

                              <div className="w-full sm:w-36">
                                <label className="block text-xs font-bold text-gray-700 mb-1">Unit Cost (per {baseUom})</label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  required
                                  value={item.purchase_cost}
                                  onChange={e => handleUpdateItem(index, { purchase_cost: parseFloat(e.target.value) || 0 })}
                                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm"
                                />
                              </div>

                              <div className="w-full sm:w-28 text-right font-bold text-gray-900 py-2">
                                {formatCurrency(item.quantity * item.purchase_cost)}
                              </div>
                              
                              {items.length > 1 && (
                                <div className="pb-2 pl-2">
                                  <button type="button" onClick={() => handleRemoveItem(index)} className="text-red-600 hover:text-red-800 font-bold text-xl leading-none">
                                    &times;
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>

                      <div className="mt-6 text-right bg-indigo-50 p-4 rounded-lg border border-indigo-100">
                        <span className="text-sm font-bold text-indigo-900">Total Purchase Value: </span>
                        <span className="text-2xl font-black text-indigo-900 ml-2">{formatCurrency(totalCost)}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="space-y-6">
                    <div className="p-5 bg-white border-2 border-gray-900 rounded-xl shadow-sm">
                      <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-2">Supplier</h4>
                      <p className="text-xl font-black text-gray-900">{suppliers.find(s => s.id === supplierId)?.name}</p>
                    </div>
                    
                    <div className="bg-white border-2 border-gray-900 rounded-xl shadow-sm overflow-hidden">
                      <div className="bg-gray-50 px-5 py-3 border-b-2 border-gray-900">
                        <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest">Order Details</h4>
                      </div>
                      
                      <div className="divide-y-2 divide-gray-100">
                        {items.map((item, idx) => {
                          const v = variants.find(v => v.id === item.variant_id);
                          const productName = v ? getVariantName(v) : 'Unknown';
                          const baseUom = v?.unit_of_measure || 'PCS';
                          const isPackage = item.purchase_unit !== baseUom;
                          
                          // Parse out Unit Size for display (e.g. 500 ML)
                          let unitSize = '-';
                          if (v?.attributes) {
                             if (v.attributes.measurementValue && v.attributes.measurementUnit) {
                               unitSize = `${v.attributes.measurementValue} ${v.attributes.measurementUnit}`;
                             } else {
                               unitSize = v.attributes.size || v.attributes.volume || v.attributes.weight || v.attributes.measurement || '-';
                             }
                          }

                          return (
                            <div key={idx} className="p-5 flex flex-col md:flex-row justify-between md:items-center gap-4 hover:bg-gray-50">
                              <div className="flex-1 space-y-3">
                                <div>
                                  <span className="text-xs font-bold text-gray-500 uppercase block mb-1">Product</span>
                                  <span className="text-lg font-black text-gray-900">{productName}</span>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                  <div>
                                    <span className="text-xs font-bold text-gray-500 uppercase block">Unit Size</span>
                                    <span className="text-sm font-bold text-gray-900">{unitSize}</span>
                                  </div>
                                  <div>
                                    <span className="text-xs font-bold text-gray-500 uppercase block">Purchase Unit</span>
                                    <span className="text-sm font-bold text-gray-900">{item.purchase_unit}</span>
                                  </div>
                                  {isPackage ? (
                                    <>
                                      <div>
                                        <span className="text-xs font-bold text-gray-500 uppercase block">Package Qty</span>
                                        <span className="text-sm font-bold text-indigo-700">{item.package_quantity} {item.purchase_unit}</span>
                                      </div>
                                      <div>
                                        <span className="text-xs font-bold text-gray-500 uppercase block">Units / Package</span>
                                        <span className="text-sm font-bold text-gray-900">{item.units_per_package}</span>
                                      </div>
                                    </>
                                  ) : (
                                    <div>
                                      <span className="text-xs font-bold text-gray-500 uppercase block">Quantity</span>
                                      <span className="text-sm font-bold text-indigo-700">{item.quantity} {baseUom}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              
                              <div className="text-left md:text-right bg-indigo-50 p-4 rounded-lg border border-indigo-100 min-w-[200px]">
                                <div className="mb-2 border-b border-indigo-200 pb-2">
                                  <span className="text-xs font-bold text-indigo-900 uppercase block mb-1">Base Quantity</span>
                                  <span className="text-lg font-black text-indigo-900">{item.quantity} {baseUom}</span>
                                </div>
                                <div className="mb-2">
                                  <span className="text-xs font-bold text-indigo-900 uppercase block">Unit Cost</span>
                                  <span className="text-sm font-bold text-indigo-900">{formatCurrency(item.purchase_cost)} / {baseUom}</span>
                                </div>
                                <div>
                                  <span className="text-xs font-bold text-indigo-900 uppercase block">Total</span>
                                  <span className="text-xl font-black text-indigo-900">{formatCurrency(item.quantity * item.purchase_cost)}</span>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      
                      <div className="bg-gray-900 p-6 flex justify-between items-center text-white">
                        <span className="text-sm font-bold uppercase tracking-widest text-gray-400">Total Purchase Value</span>
                        <span className="text-3xl font-black text-white">{formatCurrency(totalCost)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 bg-gray-50 shrink-0">
                <button
                  type="button"
                  onClick={() => formStep === 'review' ? setFormStep('edit') : setIsModalOpen(false)}
                  className="px-6 py-3 text-sm font-bold text-gray-700 bg-white border-2 border-gray-300 rounded-lg shadow-sm hover:bg-gray-100 hover:text-gray-900 transition-colors"
                >
                  {formStep === 'review' ? 'Back' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isPending || items.length === 0}
                  className="px-6 py-3 text-sm font-bold text-white bg-indigo-600 border-2 border-indigo-600 rounded-lg shadow-sm hover:bg-indigo-700 disabled:bg-indigo-400 disabled:border-indigo-400 transition-colors flex items-center gap-2"
                >
                  {formStep === 'review' ? (
                    isPending ? 'Processing...' : (
                      <>
                        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" xmlns="http://www.w3.org/2000/svg">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
                        </svg>
                        Place Order & Open WhatsApp
                      </>
                    )
                  ) : 'Review Order'}
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
