'use client'

import React, { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { formatCurrency } from '@/utils/currency'

type ReceiptData = {
  id: string
  created_at: string
  subtotal: number
  discount_total: number
  tax_total: number
  grand_total: number
  status: string
  store: { name: string } | null
  cashier: { full_name: string } | null
  customer: { name: string; phone_number: string | null } | null
  items: {
    id: string
    quantity: number
    unit_selling_price: number
    discount_amount: number
    total_price: number
    product_variant: {
      name: string
      sku: string
      products: { name: string } | null
    } | null
  }[]
  payments: {
    id: string
    method: string
    amount: number
    status: string
    paid_at: string
  }[]
}

export default function ReceiptModal({ saleId, onClose }: { saleId: string; onClose: () => void }) {
  const [data, setData] = useState<ReceiptData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const supabase = createClient()

  useEffect(() => {
    const fetchReceipt = async () => {
      setLoading(true)
      
      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .select(`
          id, created_at, subtotal, discount_total, tax_total, grand_total, status,
          store_id, organization_id,
          profiles ( full_name ),
          customers ( name, phone_number )
        `)
        .eq('id', saleId)
        .single()

      if (saleError || !saleData) {
        setError(saleError?.message || 'Sale not found')
        setLoading(false)
        return
      }

      // Safely fetch store to avoid PostgREST ambiguity with multiple FKs
      // We explicitly enforce organization_id to respect multi-tenant boundaries
      const { data: storeData, error: storeError } = await supabase
        .from('stores')
        .select('name')
        .eq('id', saleData.store_id)
        .eq('organization_id', saleData.organization_id)
        .single()

      if (storeError) {
        console.error('Failed to fetch store for receipt:', storeError)
      }

      const { data: itemsData } = await supabase
        .from('sale_items')
        .select(`
          id, quantity, unit_selling_price, discount_amount, total_price,
          product_variants ( name, sku, products ( name ) )
        `)
        .eq('sale_id', saleId)

      const { data: paymentsData } = await supabase
        .from('payments')
        .select('id, method, amount, status, paid_at')
        .eq('sale_id', saleId)

      setData({
        id: saleData.id,
        created_at: saleData.created_at,
        subtotal: saleData.subtotal,
        discount_total: saleData.discount_total,
        tax_total: saleData.tax_total,
        grand_total: saleData.grand_total,
        status: saleData.status,
        store: storeData ? { name: storeData.name } : { name: 'Unknown Store' },
        cashier: saleData.profiles as unknown as { full_name: string },
        customer: saleData.customers as unknown as { name: string; phone_number: string | null },
        items: (itemsData || []).map((item: { id: string; quantity: number; unit_selling_price: number; discount_amount: number; total_price: number; product_variants: { name: string; sku: string; products: { name: string } | null } | null | unknown }) => ({
          ...item,
          product_variant: item.product_variants as { name: string; sku: string; products: { name: string } | null } | null
        })),
        payments: paymentsData || []
      })
      
      setLoading(false)
    }
    
    fetchReceipt()
  }, [saleId, supabase])

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm print:bg-white print:p-0">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl overflow-hidden print:shadow-none print:max-w-full">
        
        {/* Header - Hidden on print */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 print:hidden">
          <h3 className="text-lg font-medium text-gray-900">Sale Details / Receipt</h3>
          <div className="flex gap-4">
            <button 
              onClick={handlePrint}
              disabled={loading || !!error}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
            >
              Print
            </button>
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 focus:outline-none"
            >
              &times;
            </button>
          </div>
        </div>
        
        {/* Printable Content */}
        <div className="p-8 print:p-4 text-gray-900 max-h-[80vh] overflow-y-auto print:overflow-visible print:max-h-none">
          {loading ? (
            <div className="flex justify-center p-8">Loading receipt data...</div>
          ) : error || !data ? (
            <div className="p-4 text-red-600 bg-red-50 border border-red-200 rounded-md">{error}</div>
          ) : (
            <div className="space-y-6">
              
              <div className="text-center border-b border-gray-200 pb-6">
                <h2 className="text-2xl font-bold tracking-tight">{data.store?.name || 'Unknown Store'}</h2>
                <p className="text-sm text-gray-500 mt-1">Receipt Ref: {data.id.split('-')[0]}</p>
                <p className="text-xs text-gray-400 font-mono mt-1" title="Full UUID">{data.id}</p>
                <p className="text-sm text-gray-500 mt-2">{new Date(data.created_at).toLocaleString()}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm border-b border-gray-200 pb-6">
                <div>
                  <p className="text-gray-500 mb-1">Customer</p>
                  <p className="font-medium">{data.customer?.name || 'Walk-in'}</p>
                  {data.customer?.phone_number && <p className="text-gray-600">{data.customer.phone_number}</p>}
                </div>
                <div className="text-right">
                  <p className="text-gray-500 mb-1">Cashier</p>
                  <p className="font-medium">{data.cashier?.full_name || 'Unknown'}</p>
                  <p className="text-gray-500 mt-2 mb-1">Status</p>
                  <p className="font-medium">{data.status}</p>
                </div>
              </div>

              <div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-500">
                      <th className="py-2 text-left font-normal">Item</th>
                      <th className="py-2 text-right font-normal">Qty</th>
                      <th className="py-2 text-right font-normal">Price</th>
                      <th className="py-2 text-right font-normal">Disc</th>
                      <th className="py-2 text-right font-normal">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.items.map(item => (
                      <tr key={item.id}>
                        <td className="py-3">
                          <p className="font-medium">{item.product_variant?.products?.name || 'Unknown'}</p>
                          <p className="text-xs text-gray-500">{item.product_variant?.name} {item.product_variant?.sku ? `(${item.product_variant.sku})` : ''}</p>
                        </td>
                        <td className="py-3 text-right">{item.quantity}</td>
                        <td className="py-3 text-right">{formatCurrency(item.unit_selling_price)}</td>
                        <td className="py-3 text-right text-green-600">
                          {item.discount_amount > 0 ? `-${formatCurrency(item.discount_amount)}` : '-'}
                        </td>
                        <td className="py-3 text-right font-medium">{formatCurrency(item.total_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="border-t border-gray-200 pt-4 space-y-2">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Subtotal</span>
                  <span>{formatCurrency(data.subtotal)}</span>
                </div>
                {data.discount_total > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Discount</span>
                    <span>-{formatCurrency(data.discount_total)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Tax</span>
                  <span>{formatCurrency(data.tax_total)}</span>
                </div>
                <div className="flex justify-between text-base font-bold text-gray-900 border-t border-gray-200 pt-2">
                  <span>Total</span>
                  <span>{formatCurrency(data.grand_total)}</span>
                </div>
              </div>

              {data.payments.length > 0 && (
                <div className="border-t border-gray-200 pt-4">
                  <p className="text-sm font-medium mb-2">Payments</p>
                  <div className="space-y-1">
                    {data.payments.map(payment => (
                      <div key={payment.id} className="flex justify-between text-sm">
                        <span className="text-gray-600">{payment.method} <span className="text-xs ml-1 bg-gray-100 px-1 rounded">{payment.status}</span></span>
                        <span>${Number(payment.amount).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-center text-xs text-gray-400 mt-8 pt-8 border-t border-gray-200">
                Thank you for your business!
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
