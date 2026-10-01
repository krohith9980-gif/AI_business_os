'use client'

import React, { useState, useTransition, useEffect } from 'react'
import { addSupplier, editSupplier, getSupplierLedger, getLedgerPurchaseDetails } from './actions'
import { recordSupplierPayment } from '../purchases/invoice-actions'
import { useRouter } from 'next/navigation'
import { formatCurrency } from '@/utils/currency'

export type Supplier = {
  id: string
  name: string
  is_active: boolean
  outstanding_balance?: number
  created_at: string
  updated_at: string
  attributes?: {
    contact_person?: string
    phone?: string
    email?: string
    gstin?: string
    address?: string
    city?: string
    state?: string
    pin?: string
    payment_terms?: string
    notes?: string
  }
}

export default function SuppliersClient({ 
  initialSuppliers, 
  searchQuery,
  storeId
}: { 
  initialSuppliers: Supplier[]
  searchQuery: string 
  storeId?: string
}) {
  const router = useRouter()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  
  const [search, setSearch] = useState(searchQuery)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [gstin, setGstin] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [stateName, setStateName] = useState('')
  const [pin, setPin] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('')
  const [notes, setNotes] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [openingBalance, setOpeningBalance] = useState<string>('')

  const [existingAttributes, setExistingAttributes] = useState<any>({})

  // Ledger state
  const [isLedgerOpen, setIsLedgerOpen] = useState(false)
  const [activeSupplier, setActiveSupplier] = useState<Supplier | null>(null)
  const [ledgerEntries, setLedgerEntries] = useState<any[]>([])
  const [isLoadingLedger, setIsLoadingLedger] = useState(false)
  const [isPaymentMode, setIsPaymentMode] = useState(false)

  // Payment form state
  const [payAmount, setPayAmount] = useState<number>(0)
  const [payMethod, setPayMethod] = useState('CASH')
  const [payRef, setPayRef] = useState('')
  const [payNotes, setPayNotes] = useState('')

  // Document state
  const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false)
  const [documentDetails, setDocumentDetails] = useState<any>(null)
  const [isLoadingDocument, setIsLoadingDocument] = useState(false)
  const [documentError, setDocumentError] = useState<string | null>(null)

  const resetForm = () => {
    setEditingId(null)
    setName('')
    setContactPerson('')
    setPhone('')
    setEmail('')
    setGstin('')
    setAddress('')
    setCity('')
    setStateName('')
    setPin('')
    setPaymentTerms('')
    setNotes('')
    setIsActive(true)
    setOpeningBalance('')
    setError(null)
    setExistingAttributes({})
  }

  const handleEdit = (s: Supplier) => {
    let attrs = s.attributes
    if (typeof attrs === 'string') {
      try { attrs = JSON.parse(attrs) } catch (e) { attrs = {} }
    }
    setExistingAttributes(attrs || {})
    
    setEditingId(s.id)
    setName(s.name)
    setIsActive(s.is_active)
    setContactPerson(attrs?.contact_person || '')
    setPhone(attrs?.phone || '')
    setEmail(attrs?.email || '')
    setGstin(attrs?.gstin || '')
    setAddress(attrs?.address || '')
    setCity(attrs?.city || '')
    setStateName(attrs?.state || '')
    setPin(attrs?.pin || '')
    setPaymentTerms(attrs?.payment_terms || '')
    setNotes(attrs?.notes || '')
    setIsModalOpen(true)
  }

  const handleViewLedger = async (s: Supplier) => {
    setActiveSupplier(s)
    setIsLedgerOpen(true)
    setIsPaymentMode(false)
    setIsLoadingLedger(true)
    setError(null)
    
    const result = await getSupplierLedger(s.id)
    if (result.error) setError(result.error)
    else setLedgerEntries(result.ledger || [])
    
    setIsLoadingLedger(false)
  }

  const handleViewDocument = async (referenceId: string) => {
    setIsDocumentModalOpen(true)
    setIsLoadingDocument(true)
    setDocumentError(null)
    setDocumentDetails(null)

    const res = await getLedgerPurchaseDetails(referenceId)
    if (res.error) {
      setDocumentError(res.error)
    } else {
      setDocumentDetails(res)
    }
    setIsLoadingDocument(false)
  }

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setSearch(val)
    
    startTransition(() => {
      const url = new URL(window.location.href)
      if (val) url.searchParams.set('q', val)
      else url.searchParams.delete('q')
      router.push(url.pathname + url.search)
    })
  }

  const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    
    const numericBalance = openingBalance === '' ? 0 : parseFloat(openingBalance)
    if (isNaN(numericBalance) || numericBalance < 0) {
      return setError('Opening balance must be 0 or a positive number')
    }

    const attributes = {
      ...existingAttributes,
      contact_person: contactPerson,
      phone, email, gstin, address, city, state: stateName, pin, payment_terms: paymentTerms, notes
    }
    formData.append('attributes', JSON.stringify(attributes))
    if (editingId) formData.append('id', editingId)
    formData.append('is_active', isActive ? 'true' : 'false')
    if (storeId) formData.append('storeId', storeId)
    if (!editingId) {
      formData.append('openingBalance', numericBalance.toString())
    }
    
    startTransition(async () => {
      const result = editingId ? await editSupplier(formData) : await addSupplier(formData)
      if (result?.error) setError(result.error)
      else {
        setIsModalOpen(false)
        resetForm()
      }
    })
  }

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!activeSupplier || !storeId) return setError('Missing required data.')
    if (payAmount <= 0) return setError('Payment must be greater than 0.')

    startTransition(async () => {
      const idempotencyKey = crypto.randomUUID()
      const res = await recordSupplierPayment(
        storeId,
        activeSupplier.id,
        idempotencyKey,
        payAmount,
        payMethod,
        payRef,
        payNotes
      )
      if (res.error) {
        setError(res.error)
      } else {
        setIsPaymentMode(false)
        setPayAmount(0)
        setPayRef('')
        setPayNotes('')
        // Refresh Ledger
        handleViewLedger(activeSupplier)
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Suppliers</h1>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
        >
          Add Supplier
        </button>
      </div>

      <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <input
            type="text" value={search} onChange={handleSearch} placeholder="Search suppliers by name..."
            className="w-full sm:max-w-md px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
          />
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Outstanding</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Added</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-600 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {initialSuppliers.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-600">No suppliers found.</td></tr>
              ) : (
                initialSuppliers.map((supplier) => (
                  <tr key={supplier.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{supplier.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{supplier.is_active ? 'Active' : 'Inactive'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                      {formatCurrency(supplier.outstanding_balance || 0)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{new Date(supplier.created_at).toLocaleDateString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                      <button onClick={() => handleViewLedger(supplier)} className="text-indigo-600 hover:text-indigo-900">Ledger</button>
                      <button onClick={() => handleEdit(supplier)} className="text-gray-600 hover:text-gray-900">Edit</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Supplier Form Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-medium text-gray-900">{editingId ? 'Edit Supplier' : 'Add Supplier'}</h3>
              <button onClick={() => { setIsModalOpen(false); resetForm(); }} className="text-gray-400 hover:text-gray-600">&times;</button>
            </div>
            <form onSubmit={handleFormSubmit} className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-gray-900">Supplier Name *</label>
                <input type="text" name="name" required value={name} onChange={e => setName(e.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
              </div>
              
              {!editingId && (
                <div>
                  <label className="block text-sm font-medium text-gray-900">
                    Opening Balance (₹)
                  </label>
                  <p className="text-xs text-gray-600 mb-1">Current existing payable balance</p>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    placeholder="0"
                    value={openingBalance}
                    onChange={e => setOpeningBalance(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  />
                </div>
              )}

              {editingId && <div className="flex items-center"><input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-indigo-600" /><label className="ml-2 text-sm text-gray-900">Active</label></div>}
              <div className="grid grid-cols-2 gap-4"><div><label className="block text-sm text-gray-900">Contact</label><input type="text" value={contactPerson} onChange={e => setContactPerson(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" /></div><div><label className="block text-sm text-gray-900">Phone</label><input type="text" value={phone} onChange={e => setPhone(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" /></div></div>
              <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm bg-white border rounded">Cancel</button><button type="submit" disabled={isPending} className="px-4 py-2 text-sm text-white bg-indigo-600 rounded disabled:bg-indigo-400">{isPending ? 'Saving...' : 'Save'}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Ledger Modal */}
      {isLedgerOpen && activeSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-medium text-gray-900">{activeSupplier.name} - Statement & Ledger</h3>
              <button onClick={() => setIsLedgerOpen(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-white">
              {error && <div className="p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>}
              
              <div className="flex items-center justify-between bg-indigo-50 p-4 rounded border border-indigo-100">
                <div>
                  <p className="text-sm text-indigo-800">Current Outstanding Balance</p>
                  <p className="text-2xl font-bold text-indigo-900">{formatCurrency(activeSupplier.outstanding_balance || 0)}</p>
                </div>
                {!isPaymentMode ? (
                  <button onClick={() => setIsPaymentMode(true)} className="px-4 py-2 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 shadow-sm">
                    Record Payment
                  </button>
                ) : (
                  <button onClick={() => setIsPaymentMode(false)} className="px-4 py-2 bg-white text-gray-900 border border-gray-300 rounded text-sm hover:bg-gray-50 shadow-sm">
                    Cancel Payment
                  </button>
                )}
              </div>

              {isPaymentMode && (
                <form onSubmit={handleRecordPayment} className="bg-gray-50 p-4 rounded border border-gray-200 space-y-4 shadow-sm">
                  <h4 className="font-medium text-gray-900">Record General Supplier Payment</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm text-gray-900">Amount (₹)</label>
                      <input type="number" min="0.01" step="0.01" required value={payAmount} onChange={e => setPayAmount(parseFloat(e.target.value)||0)} className="mt-1 w-full border rounded px-2 py-1 text-gray-900" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-900">Method</label>
                      <select value={payMethod} onChange={e => setPayMethod(e.target.value)} className="mt-1 w-full border rounded px-2 py-1 text-gray-900">
                        <option value="CASH">CASH</option>
                        <option value="UPI">UPI</option>
                        <option value="CARD">CARD</option>
                        <option value="SPLIT">SPLIT</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-900">Reference</label>
                      <input type="text" value={payRef} onChange={e => setPayRef(e.target.value)} className="mt-1 w-full border rounded px-2 py-1 text-gray-900" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-900">Notes</label>
                      <input type="text" value={payNotes} onChange={e => setPayNotes(e.target.value)} className="mt-1 w-full border rounded px-2 py-1 text-gray-900" />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button type="submit" disabled={isPending} className="px-4 py-2 bg-green-600 text-white text-sm rounded shadow disabled:bg-green-400">
                      {isPending ? 'Saving...' : 'Confirm Payment'}
                    </button>
                  </div>
                </form>
              )}

              <div className="border rounded overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Date</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Type</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Notes</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-600 uppercase">Debit (Purchase)</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-600 uppercase">Credit (Payment)</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-600 uppercase">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {isLoadingLedger ? (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-600">Loading ledger...</td></tr>
                    ) : ledgerEntries.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-600">No transactions recorded yet.</td></tr>
                    ) : (
                      ledgerEntries.map((entry) => (
                        <tr key={entry.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-sm text-gray-600">{new Date(entry.created_at).toLocaleString()}</td>
                          <td className="px-4 py-2 text-sm">
                            <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                              entry.transaction_type === 'PURCHASE' ? 'bg-red-100 text-red-800' :
                              entry.transaction_type === 'PAYMENT' ? 'bg-green-100 text-green-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {entry.transaction_type}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-600">{entry.notes}</td>
                          <td className="px-4 py-2 text-sm text-red-600 text-right font-medium">
                            {entry.amount > 0 ? (
                              <div className="flex flex-col items-end">
                                <span>{formatCurrency(entry.amount)}</span>
                                {entry.transaction_type === 'PURCHASE' && entry.reference_id && (
                                  <button 
                                    onClick={() => handleViewDocument(entry.reference_id)}
                                    className="text-xs text-indigo-600 hover:text-indigo-900 mt-1"
                                  >
                                    {entry.notes?.toLowerCase().includes('invoice') ? 'View Bill' : 'View Receipt'}
                                  </button>
                                )}
                              </div>
                            ) : '-'}
                          </td>
                          <td className="px-4 py-2 text-sm text-green-600 text-right font-medium">
                            {entry.amount < 0 ? formatCurrency(Math.abs(entry.amount)) : '-'}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-900 text-right font-bold">
                            {formatCurrency(entry.balance_after)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Document Modal */}
      {isDocumentModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-medium text-gray-900">
                {documentDetails?.type === 'INVOICE' ? 'Invoice Purchase Details' : 
                 documentDetails?.type === 'RECEIPT' ? 'Goods Receipt Details' : 'Document Details'}
              </h3>
              <button onClick={() => setIsDocumentModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 bg-white space-y-6">
              {isLoadingDocument && <p className="text-gray-600">Loading document details...</p>}
              {documentError && <p className="text-red-600 bg-red-50 p-3 rounded">{documentError}</p>}
              
              {!isLoadingDocument && documentDetails && documentDetails.document && (
                <div>
                  <div className="grid grid-cols-2 gap-4 mb-6 bg-gray-50 p-4 rounded border">
                    <div>
                      <p className="text-sm text-gray-500">Supplier</p>
                      <p className="font-medium text-gray-900">
                        {documentDetails.type === 'INVOICE' 
                          ? documentDetails.document.suppliers?.name 
                          : documentDetails.document.purchase_orders?.suppliers?.name}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Date</p>
                      <p className="font-medium text-gray-900">
                        {new Date(documentDetails.type === 'INVOICE' 
                          ? documentDetails.document.created_at 
                          : documentDetails.document.received_at || documentDetails.document.created_at).toLocaleString()}
                      </p>
                    </div>
                    {documentDetails.type === 'INVOICE' && (
                      <div>
                        <p className="text-sm text-gray-500">Invoice No</p>
                        <p className="font-medium text-gray-900">{documentDetails.document.invoice_number || 'N/A'}</p>
                      </div>
                    )}
                  </div>

                  <div className="overflow-x-auto border rounded">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 uppercase">Product</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 uppercase">Pkg Qty/Unit</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 uppercase">Units/Pkg</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 uppercase">Base Qty</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-600 uppercase">Rate</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-600 uppercase">Gross</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-600 uppercase">Disc</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 uppercase">Batch/Mfg/Exp</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {documentDetails.type === 'INVOICE' ? (
                          documentDetails.document.po_items.map((item: any) => (
                            <tr key={item.id}>
                              <td className="px-3 py-2 text-sm text-gray-900">{item.product_variants?.products?.name} ({item.product_variants?.sku})</td>
                              <td className="px-3 py-2 text-sm text-gray-900">{item.package_quantity || '-'} {item.package_unit || '-'}</td>
                              <td className="px-3 py-2 text-sm text-gray-900">{item.units_per_package || '-'}</td>
                              <td className="px-3 py-2 text-sm text-gray-900">{item.quantity_ordered} {item.product_variants?.unit_of_measure}</td>
                              <td className="px-3 py-2 text-sm text-gray-900 text-right">{formatCurrency(item.purchase_cost)}</td>
                              <td className="px-3 py-2 text-sm text-gray-900 text-right">{formatCurrency(item.gross_purchase_cost || (item.quantity_ordered * item.purchase_cost))}</td>
                              <td className="px-3 py-2 text-sm text-gray-900 text-right">{item.discount_amount ? formatCurrency(item.discount_amount) : '-'}</td>
                              <td className="px-3 py-2 text-sm text-gray-600">
                                {item.batch_number ? `B: ${item.batch_number}` : '-'}
                                {item.mfg_date ? ` M: ${item.mfg_date}` : ''}
                                {item.expiry_date ? ` E: ${item.expiry_date}` : ''}
                              </td>
                            </tr>
                          ))
                        ) : (
                          documentDetails.document.purchase_receipt_items.map((rItem: any) => {
                            const item = rItem.po_items
                            return (
                              <tr key={rItem.id}>
                                <td className="px-3 py-2 text-sm text-gray-900">{item.product_variants?.products?.name} ({item.product_variants?.sku})</td>
                                <td className="px-3 py-2 text-sm text-gray-900">{item.package_quantity || '-'} {item.package_unit || '-'}</td>
                                <td className="px-3 py-2 text-sm text-gray-900">{item.units_per_package || '-'}</td>
                                <td className="px-3 py-2 text-sm text-gray-900">{rItem.quantity_received} {item.product_variants?.unit_of_measure}</td>
                                <td className="px-3 py-2 text-sm text-gray-900 text-right">{formatCurrency(item.purchase_cost)}</td>
                                <td className="px-3 py-2 text-sm text-gray-900 text-right">{formatCurrency(rItem.quantity_received * item.purchase_cost)}</td>
                                <td className="px-3 py-2 text-sm text-gray-900 text-right">
                                  -
                                </td>
                                <td className="px-3 py-2 text-sm text-gray-600">
                                  {rItem.batch_number ? `B: ${rItem.batch_number}` : '-'}
                                  {rItem.mfg_date ? ` M: ${rItem.mfg_date}` : ''}
                                  {rItem.expiry_date ? ` E: ${rItem.expiry_date}` : ''}
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 flex justify-end">
                    <div className="text-right">
                      <p className="text-sm text-gray-600">Document Total</p>
                      <p className="text-xl font-bold text-gray-900">
                        {formatCurrency(documentDetails.type === 'INVOICE' ? documentDetails.document.total : documentDetails.document.purchase_receipt_items.reduce((acc: number, rItem: any) => acc + (rItem.quantity_received * rItem.po_items.purchase_cost), 0))}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
