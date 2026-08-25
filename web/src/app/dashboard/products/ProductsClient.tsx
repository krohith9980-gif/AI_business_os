'use client'

import React, { useState, useTransition } from 'react'
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
  searchQuery 
}: { 
  initialProducts: Product[]
  categories: Category[]
  stores: Store[]
  inventory: Inventory[]
  searchQuery: string 
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

  const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    
    startTransition(async () => {
      const result = await addProduct(formData)
      if (result?.error) {
        setError(result.error)
      } else if (result?.success) {
        setIsModalOpen(false)
        setError(null)
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Products</h1>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
        >
          Add Product
        </button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-medium text-gray-900">Add New Product</h3>
              <button onClick={() => { setIsModalOpen(false); setError(null); }} className="text-gray-400 hover:text-gray-500">
                <span className="sr-only">Close</span>&times;
              </button>
            </div>
            
            <form onSubmit={handleFormSubmit} className="p-6 overflow-y-auto max-h-[75vh]">
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md">
                  {error}
                </div>
              )}
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700">Product Name *</label>
                  <input type="text" name="name" id="name" required className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" placeholder="Widget" />
                </div>
                
                <div>
                  <label htmlFor="sku" className="block text-sm font-medium text-gray-700">SKU *</label>
                  <input type="text" name="sku" id="sku" required className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" placeholder="WDG-001" />
                </div>

                <div>
                  <label htmlFor="category_id" className="block text-sm font-medium text-gray-700">Category</label>
                  <select name="category_id" id="category_id" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
                    <option value="">-- Select Category --</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label htmlFor="barcode" className="block text-sm font-medium text-gray-700">Barcode</label>
                  <input type="text" name="barcode" id="barcode" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" placeholder="123456789012" />
                </div>

                <div>
                  <label htmlFor="purchase_cost" className="block text-sm font-medium text-gray-700">Purchase Cost *</label>
                  <input type="number" step="0.01" min="0" name="purchase_cost" id="purchase_cost" required defaultValue="0.00" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                </div>

                <div>
                  <label htmlFor="selling_price" className="block text-sm font-medium text-gray-700">Selling Price *</label>
                  <input type="number" step="0.01" min="0" name="selling_price" id="selling_price" required defaultValue="0.00" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                </div>

                <div>
                  <label htmlFor="tracking_mode" className="block text-sm font-medium text-gray-700">Tracking Mode *</label>
                  <select name="tracking_mode" id="tracking_mode" required className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
                    <option value="NONE">NONE (Basic Item)</option>
                    <option value="BATCH">BATCH (Lot/Expiry Tracking)</option>
                    <option value="SERIALIZED">SERIALIZED (Individual Units)</option>
                  </select>
                </div>

                <div className="sm:col-span-2 mt-4 pt-4 border-t border-gray-200">
                  <h4 className="text-md font-medium text-gray-900 mb-4">Stock & Packaging</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="unit_of_measure" className="block text-sm font-medium text-gray-700">How is this product sold? (Base Unit) *</label>
                      <select name="unit_of_measure" id="unit_of_measure" required className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
                        <option value="Piece">Piece</option>
                        <option value="Kg">Kg</option>
                        <option value="Gram">Gram</option>
                        <option value="Litre">Litre</option>
                        <option value="Ml">Ml</option>
                      </select>
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
                        <label htmlFor="units_per_pack" className="block text-sm font-medium text-gray-700">How many base units in 1 {packagingType.toLowerCase()}? *</label>
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
                  <textarea name="description" id="description" rows={3} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" placeholder="Product details..."></textarea>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
                  Cancel
                </button>
                <button type="submit" disabled={isPending} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:bg-indigo-400">
                  {isPending ? 'Saving...' : 'Save Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
