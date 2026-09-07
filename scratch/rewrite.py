'use client'

import React, { useState, useTransition, useRef } from 'react'
import { addProduct } from './actions'
import { formatCurrency } from '@/utils/currency'
import { useRouter } from 'next/navigation'

type Product = {
  id: string
  product_id: string
  name: string
  sku: string
  category_name: string
  purchase_cost: number
  selling_price: number
  tracking_mode: string
  is_active: boolean
  unit_of_measure: string
  packaging_type: string
  units_per_pack: number
}

type Category = {
  id: string
  name: string
}

type Store = {
  id: string
  name: string
}

type Inventory = {
  store_id: string
  variant_id: string
  available_stock: number
}

export default function ProductsClient({ 
  initialProducts, 
  categories,
  stores,
  inventory,
  searchQuery,
  role 
}: { 
  initialProducts: Product[]
  categories: Category[]
  stores: Store[]
  inventory: Inventory[]
  searchQuery: string 
  role?: string
}) {
  const router = useRouter()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  
  const [search, setSearch] = useState(searchQuery)
  const [selectedStoreId, setSelectedStoreId] = useState<string>(stores[0]?.id || '')
  
  const [packagingType, setPackagingType] = useState('NONE')
  const [unitsPerPack, setUnitsPerPack] = useState(1)
  const [openingStock, setOpeningStock] = useState(0)

  const [itemSizePreset, setItemSizePreset] = useState('1_PCS')
  const [itemSize, setItemSize] = useState('1')
  const [itemUnit, setItemUnit] = useState('PCS')

  // AI Scanning State
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [uploadedImage, setUploadedImage] = useState<string | null>(null)
  const [scannedItems, setScannedItems] = useState<any[]>([])
  const [aiConfidenceInfo, setAiConfidenceInfo] = useState<any | null>(null)

  // Form Fields (Controlled)
  const [name, setName] = useState('')
  const [sku, setSku] = useState('')
  const [barcode, setBarcode] = useState('')
  const [purchaseCost, setPurchaseCost] = useState('0.00')
  const [sellingPrice, setSellingPrice] = useState('0.00')
  const [brand, setBrand] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [batchNumber, setBatchNumber] = useState('')
  const [manufacturingDate, setManufacturingDate] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [trackingMode, setTrackingMode] = useState('NONE')

  const resetForm = () => {
    setName('')
    setSku('')
    setBarcode('')
    setPurchaseCost('0.00')
    setSellingPrice('0.00')
    setBrand('')
    setManufacturer('')
    setBatchNumber('')
    setManufacturingDate('')
    setExpiryDate('')
    setDescription('')
    setCategoryId('')
    setTrackingMode('NONE')
    setPackagingType('NONE')
    setUnitsPerPack(1)
    setOpeningStock(0)
    setItemSize('1')
    setItemUnit('PCS')
    setItemSizePreset('1_PCS')
    setUploadedImage(null)
    setScannedItems([])
    setAiConfidenceInfo(null)
    setError(null)
  }

  const currentItemSize = parseFloat(itemSize) || 0
  const currentItemUnit = itemUnit

  const totalPackageBase = currentItemSize * unitsPerPack
  const displayPackageUnit = (currentItemUnit === 'ML' && totalPackageBase >= 1000) ? 'L' 
    : (currentItemUnit === 'G' && totalPackageBase >= 1000) ? 'KG' 
    : currentItemUnit
  const displayPackageValue = (currentItemUnit === 'ML' && totalPackageBase >= 1000) ? totalPackageBase / 1000 
    : (currentItemUnit === 'G' && totalPackageBase >= 1000) ? totalPackageBase / 1000 
    : totalPackageBase

  const handlePresetChange = (val: string) => {
    setItemSizePreset(val)
    if (val !== 'CUSTOM') {
      const [s, u] = val.split('_')
      setItemSize(s)
      setItemUnit(u)
    }
  }

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setSearch(val)
    
    startTransition(() => {
      const url = new URL(window.location.href)
      if (val) {
        url.searchParams.set('q', val)
      } else {
        url.searchParams.delete('q')
      }
      router.push(url.pathname + url.search)
    })
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsScanning(true)
    setError(null)
    setScannedItems([])
    setAiConfidenceInfo(null)

    try {
      const reader = new FileReader()
      reader.onloadend = async () => {
        const base64Data = reader.result as string
        setUploadedImage(base64Data)
        
        // Remove data URI prefix for API
        const base64String = base64Data.split(',')[1]

        const res = await fetch('/api/intelligence/scan-product', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64String, mimeType: file.type })
        })

        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Failed to scan image')
        }

        const data = await res.json()
        if (data.items && data.items.length > 0) {
          if (data.documentType === 'invoice' && data.items.length > 1) {
             setScannedItems(data.items)
          } else {
             handleSelectScannedItem(data.items[0])
          }
        } else {
          throw new Error('No products detected in the image')
        }
      }
      reader.readAsDataURL(file)
    } catch (err: any) {
      setError(err.message || 'Scanning failed')
    } finally {
      setIsScanning(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleSelectScannedItem = (item: any) => {
    setScannedItems([]) // Hide selection if any
    
    // Fill state
    if (item.productName) setName(item.productName)
    if (item.sku) setSku(item.sku)
    if (item.barcode) setBarcode(item.barcode)
    if (item.purchaseCost !== null) setPurchaseCost(item.purchaseCost.toString())
    if (item.mrp !== null) setSellingPrice(item.mrp.toString())
    
    if (item.brand) setBrand(item.brand)
    if (item.manufacturer) setManufacturer(item.manufacturer)
    if (item.batchNumber) setBatchNumber(item.batchNumber)
    if (item.manufacturingDate) setManufacturingDate(item.manufacturingDate)
    if (item.expiryDate) setExpiryDate(item.expiryDate)
    
    if (item.measurementValue) {
       setItemSize(item.measurementValue.toString())
       setItemSizePreset('CUSTOM')
    }
    if (item.measurementUnit) {
       let u = item.measurementUnit.toUpperCase()
       if (['G','KG','ML','L','PCS'].includes(u)) {
         setItemUnit(u)
       }
    }
    if (item.packagingType) {
       let pt = item.packagingType.toUpperCase()
       if (['BOX','PACK','NONE'].includes(pt)) {
         setPackagingType(pt)
       }
    }
    if (item.unitsPerPack) {
       setUnitsPerPack(item.unitsPerPack)
    }
    
    setAiConfidenceInfo(item.confidence || null)
  }

  const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    
    // Append the extra metadata fields that are controlled by React state
    const attributesData = {
      brand: brand || null,
      manufacturer: manufacturer || null,
      batchNumber: batchNumber || null,
      manufacturingDate: manufacturingDate || null,
      expiryDate: expiryDate || null
    }
    formData.append('attributes', JSON.stringify(attributesData))

    startTransition(async () => {
      const result = await addProduct(formData)
      if (result?.error) {
        setError(result.error)
      } else if (result?.success) {
        setIsModalOpen(false)
        resetForm()
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Products</h1>
        {(role === 'OWNER' || role === 'MANAGER') && (
          <button 
            onClick={() => { resetForm(); setIsModalOpen(true); }}
            className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
          >
            Add Product
          </button>
        )}
      </div>

      <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-4">
          <input
            type="text"
            value={search}
            onChange={handleSearch}
            placeholder="Search products by SKU..."
            className="w-full sm:max-w-md px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
          />
          {stores.length > 0 && (
            <select
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              className="block w-full sm:max-w-xs rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900"
            >
              {stores.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          {isPending && <span className="ml-3 text-sm text-gray-500 flex items-center">Searching...</span>}
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cost</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pack</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Units/Pack</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {initialProducts.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-6 py-12 text-center text-sm text-gray-500">
                    {searchQuery ? 'No products match your search.' : 'No products found. Click "Add Product" to create one.'}
                  </td>
                </tr>
              ) : (
                initialProducts.map((p) => {
                  const stock = inventory.find(i => i.variant_id === p.id && i.store_id === selectedStoreId)?.available_stock || 0
                  return (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{p.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{p.sku}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{p.category_name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatCurrency(p.purchase_cost)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatCurrency(p.selling_price)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{p.unit_of_measure}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{p.packaging_type}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{p.units_per_pack}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{stock}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${p.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {p.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button className="text-indigo-600 hover:text-indigo-900 focus:outline-none">View</button>
                    </td>
                  </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl overflow-hidden my-8 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 shrink-0">
              <h3 className="text-lg font-medium text-gray-900">Add New Product</h3>
              
              <div className="flex items-center gap-4">
                <input 
                  type="file" 
                  accept="image/*" 
                  capture="environment" 
                  ref={fileInputRef}
                  className="hidden"
                  onChange={handleFileUpload} 
                />
                <button 
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isScanning}
                  className="inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:from-purple-500 hover:to-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 transition"
                >
                  {isScanning ? (
                    <span className="animate-pulse">Scanning...</span>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M10.5 8.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z"/>
                        <path d="M2 4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1.172a2 2 0 0 1-1.414-.586l-.828-.828A2 2 0 0 0 9.172 2H6.828a2 2 0 0 0-1.414.586l-.828.828A2 2 0 0 1 3.172 4H2zm.5 2a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1zm9 2.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0z"/>
                      </svg>
                      Scan with AI
                    </>
                  )}
                </button>
                <button onClick={() => { setIsModalOpen(false); resetForm(); }} className="text-gray-400 hover:text-gray-500">
                  <span className="sr-only">Close</span>&times;
                </button>
              </div>
            </div>
            
            <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
              {/* Left Side: Uploaded Image Preview (If exists) */}
              {uploadedImage && (
                <div className="w-full md:w-1/3 bg-gray-100 p-4 border-r border-gray-200 flex flex-col overflow-y-auto">
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Original Image</h4>
                  <img src={uploadedImage} alt="Uploaded" className="w-full rounded-md shadow-sm border border-gray-300" />
                  
                  {scannedItems.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">Detected Items (Select One)</h4>
                      <div className="space-y-2">
                        {scannedItems.map((item, idx) => (
                          <div 
                            key={idx} 
                            onClick={() => handleSelectScannedItem(item)}
                            className="p-3 bg-white border border-indigo-200 rounded-md shadow-sm cursor-pointer hover:bg-indigo-50 transition"
                          >
                            <div className="font-medium text-gray-900">{item.productName || 'Unknown Product'}</div>
                            <div className="text-xs text-gray-500">Brand: {item.brand || '-'}</div>
                            <div className="text-xs text-gray-500">MRP: {item.mrp || '-'}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Right Side: Form */}
              <form onSubmit={handleFormSubmit} className="flex-1 p-6 overflow-y-auto">
                {aiConfidenceInfo && (
                  <div className="mb-6 p-4 bg-indigo-50 border-l-4 border-indigo-500 rounded-r-md">
                    <h4 className="text-sm font-bold text-indigo-900">Review AI Results</h4>
                    <p className="text-xs text-indigo-700 mt-1">
                      AI has pre-filled this form based on the image. Please verify all values. Uncertain values are marked. Do not assume AI values are 100% correct.
                    </p>
                  </div>
                )}
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Basic Info */}
                  <div className="sm:col-span-2 pb-2 border-b border-gray-200">
                    <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Core Identity</h4>
                  </div>
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700 flex justify-between">
                      <span>Product Name *</span>
                      {aiConfidenceInfo?.productName === 'uncertain' && <span className="text-xs text-amber-600 bg-amber-50 px-1 rounded border border-amber-200">Uncertain</span>}
                    </label>
                    <input type="text" name="name" id="name" required value={name} onChange={e => setName(e.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" placeholder="Widget" />
                  </div>
                  
                  <div>
                    <label htmlFor="sku" className="block text-sm font-medium text-gray-700">SKU *</label>
                    <input type="text" name="sku" id="sku" required value={sku} onChange={e => setSku(e.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" placeholder="WDG-001" />
                  </div>

                  <div>
                    <label htmlFor="brand" className="block text-sm font-medium text-gray-700">Brand</label>
                    <input type="text" name="brand" id="brand" value={brand} onChange={e => setBrand(e.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                  </div>
                  
                  <div>
                    <label htmlFor="manufacturer" className="block text-sm font-medium text-gray-700">Manufacturer</label>
                    <input type="text" name="manufacturer" id="manufacturer" value={manufacturer} onChange={e => setManufacturer(e.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                  </div>

                  <div>
                    <label htmlFor="category_id" className="block text-sm font-medium text-gray-700">Category</label>
                    <select name="category_id" id="category_id" value={categoryId} onChange={e => setCategoryId(e.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
                      <option value="">-- Select Category --</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label htmlFor="barcode" className="block text-sm font-medium text-gray-700">Barcode</label>
                    <input type="text" name="barcode" id="barcode" value={barcode} onChange={e => setBarcode(e.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" placeholder="123456789012" />
                  </div>

                  {/* Commercials */}
                  <div className="sm:col-span-2 mt-4 pb-2 border-b border-gray-200">
                    <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Commercials</h4>
                  </div>
                  <div>
                    <label htmlFor="purchase_cost" className="block text-sm font-medium text-gray-700 flex justify-between">
                      <span>Purchase Cost *</span>
                      {aiConfidenceInfo?.purchaseCost === 'uncertain' && <span className="text-xs text-amber-600 bg-amber-50 px-1 rounded border border-amber-200">Uncertain</span>}
                    </label>
                    <input type="number" step="0.01" min="0" name="purchase_cost" id="purchase_cost" required value={purchaseCost} onChange={e => setPurchaseCost(e.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                  </div>

                  <div>
                    <label htmlFor="selling_price" className="block text-sm font-medium text-gray-700 flex justify-between">
                      <span>Selling Price (MRP) *</span>
                    </label>
                    <input type="number" step="0.01" min="0" name="selling_price" id="selling_price" required value={sellingPrice} onChange={e => setSellingPrice(e.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                  </div>

                  {/* Metadata (Batch) */}
                  <div className="sm:col-span-2 mt-4 pb-2 border-b border-gray-200">
                    <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Batch & Dates (Metadata)</h4>
                  </div>
                  <div>
                    <label htmlFor="batch_number" className="block text-sm font-medium text-gray-700 flex justify-between">
                      <span>Batch Number</span>
                      {aiConfidenceInfo?.batchNumber === 'uncertain' && <span className="text-xs text-amber-600 bg-amber-50 px-1 rounded border border-amber-200">Uncertain</span>}
                    </label>
                    <input type="text" name="batch_number" id="batch_number" value={batchNumber} onChange={e => setBatchNumber(e.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                  </div>
                  <div className="hidden sm:block"></div>
                  <div>
                    <label htmlFor="manufacturing_date" className="block text-sm font-medium text-gray-700 flex justify-between">
                      <span>Mfg Date</span>
                      {aiConfidenceInfo?.manufacturingDate === 'uncertain' && <span className="text-xs text-amber-600 bg-amber-50 px-1 rounded border border-amber-200">Uncertain</span>}
                    </label>
                    <input type="text" name="manufacturing_date" id="manufacturing_date" value={manufacturingDate} onChange={e => setManufacturingDate(e.target.value)} placeholder="DD-MM-YYYY or MM/YYYY" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                  </div>
                  <div>
                    <label htmlFor="expiry_date" className="block text-sm font-medium text-gray-700 flex justify-between">
                      <span>Expiry Date</span>
                      {aiConfidenceInfo?.expiryDate === 'uncertain' && <span className="text-xs text-amber-600 bg-amber-50 px-1 rounded border border-amber-200">Uncertain</span>}
                    </label>
                    <input type="text" name="expiry_date" id="expiry_date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} placeholder="DD-MM-YYYY or MM/YYYY" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                  </div>


                  {/* Tracking Mode */}
                  <div className="sm:col-span-2 mt-4 pb-2 border-b border-gray-200">
                    <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Inventory Settings</h4>
                  </div>
                  <div>
                    <label htmlFor="tracking_mode" className="block text-sm font-medium text-gray-700">Tracking Mode *</label>
                    <select name="tracking_mode" id="tracking_mode" required value={trackingMode} onChange={e => setTrackingMode(e.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
                      <option value="NONE">NONE (Basic Item)</option>
                      <option value="BATCH">BATCH (Lot/Expiry Tracking)</option>
                      <option value="SERIALIZED">SERIALIZED (Individual Units)</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="col-span-full">
                        <label htmlFor="item_size" className="block text-sm font-medium text-gray-700 flex justify-between">
                          <span>Item Size *</span>
                          {aiConfidenceInfo?.measurement === 'uncertain' && <span className="text-xs text-amber-600 bg-amber-50 px-1 rounded border border-amber-200">Uncertain</span>}
                        </label>
                        <div className="mt-1 flex flex-col sm:flex-row gap-2">
                          <div className="flex-1 flex gap-2">
                            <input 
                              type="number" 
                              step="any"
                              min="0.0001"
                              name="item_size"
                              id="item_size"
                              value={itemSize}
                              onChange={(e) => { setItemSize(e.target.value); setItemSizePreset('CUSTOM'); }}
                              placeholder="Enter value, e.g. 500"
                              required
                              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                            />
                            <select 
                              name="unit_of_measure"
                              id="unit_of_measure"
                              value={itemUnit}
                              onChange={(e) => { setItemUnit(e.target.value); setItemSizePreset('CUSTOM'); }}
                              className="block w-32 rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                            >
                              <option value="G">G</option>
                              <option value="KG">KG</option>
                              <option value="ML">ML</option>
                              <option value="L">L</option>
                              <option value="PCS">PCS</option>
                            </select>
                          </div>

                          <div className="sm:w-1/3">
                            <select 
                              id="item_size_preset" 
                              value={itemSizePreset}
                              onChange={(e) => handlePresetChange(e.target.value)}
                              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-500 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm bg-gray-50"
                            >
                              <option value="CUSTOM">Quick Selections...</option>
                              <optgroup label="WEIGHT">
                                <option value="50_G">50 G</option>
                                <option value="100_G">100 G</option>
                                <option value="250_G">250 G</option>
                                <option value="500_G">500 G</option>
                                <option value="1_KG">1 KG</option>
                                <option value="2_KG">2 KG</option>
                                <option value="5_KG">5 KG</option>
                                <option value="10_KG">10 KG</option>
                                <option value="25_KG">25 KG</option>
                                <option value="50_KG">50 KG</option>
                              </optgroup>
                              <optgroup label="LIQUID">
                                <option value="50_ML">50 ML</option>
                                <option value="100_ML">100 ML</option>
                                <option value="250_ML">250 ML</option>
                                <option value="500_ML">500 ML</option>
                                <option value="750_ML">750 ML</option>
                                <option value="1_L">1 L</option>
                                <option value="2_L">2 L</option>
                                <option value="5_L">5 L</option>
                              </optgroup>
                              <optgroup label="COUNT">
                                <option value="1_PCS">1 PCS</option>
                              </optgroup>
                            </select>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label htmlFor="packaging_type" className="block text-sm font-medium text-gray-700">Does it come in a box/pack? *</label>
                        <select 
                          name="packaging_type" 
                          id="packaging_type" 
                          required 
                          value={packagingType}
                          onChange={(e) => setPackagingType(e.target.value)}
                          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        >
                          <option value="NONE">No packaging</option>
                          <option value="BOX">Box</option>
                          <option value="PACK">Pack</option>
                        </select>
                      </div>

                      {packagingType !== 'NONE' && (
                        <div>
                          <label htmlFor="units_per_pack" className="block text-sm font-medium text-gray-700 flex justify-between">
                            <span>Items per {packagingType.toLowerCase()} *</span>
                            {aiConfidenceInfo?.unitsPerPack === 'uncertain' && <span className="text-xs text-amber-600 bg-amber-50 px-1 rounded border border-amber-200">Uncertain</span>}
                          </label>
                          <input 
                            type="number" 
                            min="1" 
                            name="units_per_pack" 
                            id="units_per_pack" 
                            required 
                            value={unitsPerPack}
                            onChange={(e) => setUnitsPerPack(Math.max(1, parseInt(e.target.value) || 1))}
                            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" 
                          />
                        </div>
                      )}

                      {packagingType !== 'NONE' && currentItemSize > 0 && (
                        <div className="col-span-full bg-blue-50 p-4 rounded-md border border-blue-100 flex flex-col items-center justify-center">
                          <span className="text-sm text-blue-600 font-medium mb-1">Package Size Calculator</span>
                          <div className="text-lg text-blue-900 font-bold">
                            1 {packagingType} = {unitsPerPack} x {currentItemSize} {currentItemUnit}
                          </div>
                          <div className="text-2xl text-blue-700 font-black mt-1">
                            = {displayPackageValue} {displayPackageUnit}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="sm:col-span-2 mt-4 pt-4 border-t border-gray-200">
                    <h4 className="text-md font-medium text-gray-900 mb-4">Initial Inventory</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="store_id" className="block text-sm font-medium text-gray-700">Store *</label>
                        <select name="store_id" id="store_id" required className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
                          {stores.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label htmlFor="opening_stock" className="block text-sm font-medium text-gray-700">
                          Opening stock ({packagingType === 'NONE' ? 'Base units' : (packagingType === 'BOX' ? 'Boxes' : 'Packs')})
                        </label>
                        <input 
                          type="number" 
                          min="0" 
                          name="opening_stock" 
                          id="opening_stock" 
                          value={openingStock}
                          onChange={(e) => setOpeningStock(Math.max(0, parseFloat(e.target.value) || 0))}
                          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" 
                        />
                      </div>
                    </div>
                    
                    {openingStock > 0 && (
                      <div className="mt-3 p-3 bg-indigo-50 text-indigo-700 rounded-md text-sm">
                        You are adding: <br/>
                        <span className="font-semibold">
                          {openingStock} {packagingType === 'NONE' ? 'units' : (packagingType === 'BOX' ? 'boxes' : 'packs')}
                          {packagingType !== 'NONE' && ` × ${unitsPerPack} units`} = {openingStock * (packagingType !== 'NONE' ? unitsPerPack : 1)} total base units
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="sm:col-span-2 mt-4 pt-4 border-t border-gray-200">
                    <label htmlFor="description" className="block text-sm font-medium text-gray-700">Description</label>
                    <textarea name="description" id="description" value={description} onChange={e => setDescription(e.target.value)} rows={3} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" placeholder="Product details..."></textarea>
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-3 pt-4 border-t border-gray-200 sticky bottom-0 bg-white pb-2 z-10">
                  {error && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md animate-pulse">
                      {error}
                    </div>
                  )}
                  <div className="flex justify-end gap-3">
                    <button type="button" onClick={() => { setIsModalOpen(false); resetForm(); }} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
                      Cancel
                    </button>
                    <button type="submit" disabled={isPending || isScanning} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:bg-indigo-400">
                      {isPending ? 'Saving...' : 'Save Product'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
