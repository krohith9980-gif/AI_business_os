import React from 'react'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatCurrency } from '@/utils/currency'
import PurchaseDetailsInteractive from './PurchaseDetailsInteractive'

export const metadata = {
  title: 'Purchase Details | AI Business OS',
}

export default async function PurchaseViewPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  
  // Note: params needs to be awaited in next.js 15
  const resolvedParams = await params
  const purchaseId = resolvedParams.id

  const { data: purchase, error } = await supabase
    .from('purchase_orders')
    .select(`
      *,
      suppliers ( name ),
      po_items (
        id,
        quantity_ordered,
        quantity_received,
        purchase_cost,
        batch_number,
        mfg_date,
        expiry_date,
        package_quantity,
        package_unit,
        units_per_package,
        product_variants (
          sku,
          unit_of_measure,
          products ( name )
        )
      )
    `)
    .eq('id', purchaseId)
    .single()

  if (error || !purchase) {
    return <div className="p-8 text-center text-red-500">Purchase order not found.</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Purchase Details</h1>
        <Link 
          href="/dashboard/purchases"
          className="text-sm font-medium text-indigo-600 hover:text-indigo-900"
        >
          &larr; Back to Purchases
        </Link>
      </div>

      <div className="bg-white p-6 shadow-sm rounded-lg border border-gray-200">
        <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
          <div>
            <span className="text-gray-500">Date:</span>
            <p className="font-medium text-gray-900">{new Date(purchase.created_at).toLocaleString()}</p>
          </div>
          <div>
            <span className="text-gray-500">Supplier:</span>
            <p className="font-medium text-gray-900">{purchase.suppliers?.name || 'Unknown'}</p>
          </div>
          <div>
            <span className="text-gray-500">Payment Status:</span>
            <p className="font-medium text-gray-900">{purchase.payment_status}</p>
          </div>
        </div>
        
        <PurchaseDetailsInteractive purchase={purchase} />

        <h3 className="text-lg font-medium text-gray-900 mt-8 mb-4 border-b pb-2">Line Items</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Batch No.</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">MFG / EXP</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ordered</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Received</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Cost</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {purchase.po_items?.map((item: any) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">{item.product_variants?.products?.name || 'Unknown Product'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{item.product_variants?.sku || '-'}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.batch_number || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {item.mfg_date || '-'} / {item.expiry_date || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">
                    {item.package_unit && item.package_unit !== 'PCS' && item.package_unit !== (item.product_variants?.unit_of_measure || 'PCS') ? (
                      <>
                        <div className="font-bold">{item.package_quantity} {item.package_unit}</div>
                        <div className="text-xs text-gray-500">({item.quantity_ordered} {item.product_variants?.unit_of_measure || 'PCS'})</div>
                      </>
                    ) : (
                      <div className="font-bold">{item.quantity_ordered} {item.product_variants?.unit_of_measure || 'PCS'}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">
                    {item.quantity_received > 0 ? (
                      <div className="font-bold text-indigo-700">{item.quantity_received} {item.product_variants?.unit_of_measure || 'PCS'}</div>
                    ) : (
                      <div className="text-gray-400">0</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatCurrency(item.purchase_cost)}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                    {formatCurrency(item.quantity_ordered * item.purchase_cost)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6} className="px-4 py-3 text-sm font-bold text-gray-900 text-right">Total:</td>
                <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">{formatCurrency(purchase.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
