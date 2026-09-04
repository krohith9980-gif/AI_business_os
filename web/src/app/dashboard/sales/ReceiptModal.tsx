'use client'

import React, { useEffect, useState } from 'react'
import { formatCurrency } from '@/utils/currency'
import { ReceiptData } from '../pos/receipt/types'
import { mapSaleToReceiptData } from '../pos/receipt/mapper'
import { fetchReceiptData } from '../pos/actions'

export default function ReceiptModal({ saleId, onClose }: { saleId: string; onClose: () => void }) {
  const [data, setData] = useState<ReceiptData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchReceipt = async () => {
      setLoading(true)
      try {
        const res = await fetchReceiptData(saleId)
        if (res.error || !res.saleData) {
          setError(res.error || 'Sale not found')
        } else {
          const rData = mapSaleToReceiptData(res.saleData)
          setData(rData)
        }
      } catch (err: any) {
        setError(err.message || 'An error occurred fetching receipt')
      } finally {
        setLoading(false)
      }
    }
    
    fetchReceipt()
  }, [saleId])

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm print:bg-white print:p-0">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl overflow-hidden print:shadow-none print:max-w-full">
        
        {/* Header - Hidden on print */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 print:hidden">
          <h3 className="text-lg font-medium text-gray-900">Sale Details / Receipt</h3>
          <div className="flex gap-4">
            <button 
              onClick={handlePrint}
              disabled={loading || !!error}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
            >
              Print A4
            </button>
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 focus:outline-none"
            >
              &times;
            </button>
          </div>
        </div>
        
        {/* Printable Content (A4 Reference Design) */}
        <div className="p-8 print:p-8 text-gray-900 max-h-[80vh] overflow-y-auto print:overflow-visible print:max-h-none font-sans bg-white">
          {loading ? (
            <div className="flex justify-center p-8">Loading receipt data...</div>
          ) : error || !data ? (
            <div className="p-4 text-red-600 bg-red-50 border border-red-200 rounded-md">{error}</div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6 text-[14px] leading-relaxed">
              
              {/* SHOP HEADER */}
              <div className="text-center pb-4">
                {data.logoUrl && (
                  <img src={data.logoUrl} alt="Logo" className="max-h-16 mx-auto mb-2" />
                )}
                <h1 className="text-2xl font-bold uppercase tracking-wide">{data.shopName}</h1>
                <h2 className="text-lg font-semibold text-gray-700">{data.storeName}</h2>
                {data.address && <p className="text-gray-600">{data.address}</p>}
                <p className="text-gray-600">
                  {data.phone && <span>Ph: {data.phone}</span>}
                  {data.phone && data.email && <span className="mx-2">|</span>}
                  {data.email && <span>Email: {data.email}</span>}
                </p>
                {data.gstin && <p className="text-gray-600 font-medium">GSTIN: {data.gstin}</p>}
              </div>

              {/* SALES BILL / INVOICE */}
              <div className="text-center border-t border-b border-gray-300 py-2 mb-4">
                <h3 className="text-xl font-bold uppercase tracking-widest">SALES BILL / INVOICE</h3>
              </div>

              <div className="flex justify-between font-medium text-gray-700 mb-4 px-2">
                <div>
                  {data.invoiceNumber ? (
                    <p>Bill No: <span className="font-bold text-black">{data.invoiceNumber}</span></p>
                  ) : (
                    <p>Ref No: <span className="font-bold text-black">{data.saleId.split('-')[0]}</span></p>
                  )}
                </div>
                <div className="text-right">
                  <p>Date: {data.date}</p>
                  <p>Time: {data.time}</p>
                </div>
              </div>

              {/* CUSTOMER + PAYMENT BOX */}
              <div className="border border-gray-300 rounded-xl p-4 flex justify-between bg-gray-50">
                <div className="w-1/2 pr-4 border-r border-gray-300">
                  <h4 className="font-bold text-gray-800 border-b border-gray-200 pb-1 mb-2">Customer Details</h4>
                  <div className="grid grid-cols-[80px_1fr] gap-1">
                    <span className="text-gray-600">Name:</span>
                    <span className="font-semibold text-black">{data.customerName}</span>
                    
                    <span className="text-gray-600">Mobile:</span>
                    <span className="font-medium text-black">{data.customerMobile || 'N/A'}</span>
                    
                    <span className="text-gray-600">Address:</span>
                    <span className="text-black">-</span>
                  </div>
                </div>
                <div className="w-1/2 pl-4">
                  <h4 className="font-bold text-gray-800 border-b border-gray-200 pb-1 mb-2">Payment Details</h4>
                  <div className="grid grid-cols-[120px_1fr] gap-1">
                    <span className="text-gray-600">Payment Method:</span>
                    <span className="font-semibold text-black">{data.paymentMethod}</span>
                    
                    <span className="text-gray-600">Payment Status:</span>
                    <span className="font-medium text-black">{data.paymentStatus}</span>
                    
                    <span className="text-gray-600">Cashier:</span>
                    <span className="text-black">{data.cashierName} ({data.cashierRole})</span>
                    
                    <span className="text-gray-600">Store:</span>
                    <span className="text-black">{data.storeName}</span>
                  </div>
                </div>
              </div>

              {/* ITEM TABLE */}
              <div className="mt-6 border border-gray-300 rounded-lg overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-100 border-b border-gray-300 text-gray-700">
                    <tr>
                      <th className="py-2 px-3 font-semibold text-center border-r border-gray-300">S.No</th>
                      <th className="py-2 px-3 font-semibold border-r border-gray-300">Product / Description</th>
                      <th className="py-2 px-3 font-semibold text-center border-r border-gray-300">HSN / SKU</th>
                      <th className="py-2 px-3 font-semibold text-right border-r border-gray-300">Qty</th>
                      <th className="py-2 px-3 font-semibold text-right border-r border-gray-300">Unit Price</th>
                      <th className="py-2 px-3 font-semibold text-right border-r border-gray-300">GST %</th>
                      <th className="py-2 px-3 font-semibold text-right border-r border-gray-300">GST Amt</th>
                      <th className="py-2 px-3 font-semibold text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {data.items.map((item, index) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="py-2 px-3 text-center border-r border-gray-300">{index + 1}</td>
                        <td className="py-2 px-3 border-r border-gray-300">
                          <p className="font-medium text-gray-900">{item.productName}</p>
                          {item.description && <p className="text-xs text-gray-500">{item.description}</p>}
                        </td>
                        <td className="py-2 px-3 text-center text-gray-600 border-r border-gray-300 text-xs">{item.hsn || item.sku || '-'}</td>
                        <td className="py-2 px-3 text-right border-r border-gray-300">{item.quantity} <span className="text-xs text-gray-500">{item.unit !== 'units' ? item.unit : ''}</span></td>
                        <td className="py-2 px-3 text-right border-r border-gray-300">{formatCurrency(item.unitPrice)}</td>
                        <td className="py-2 px-3 text-right border-r border-gray-300">{item.gstPercentage ? item.gstPercentage + '%' : '-'}</td>
                        <td className="py-2 px-3 text-right border-r border-gray-300">{item.gstAmount ? formatCurrency(item.gstAmount) : '-'}</td>
                        <td className="py-2 px-3 text-right font-medium">{formatCurrency(item.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* TOTALS */}
              <div className="flex justify-between mt-4">
                <div className="w-1/2 pr-8 flex flex-col justify-end pb-2">
                  <p className="text-gray-600 font-medium mb-1">Amount in Words:</p>
                  <p className="font-bold text-gray-800 italic">{data.amountInWords}</p>
                </div>
                <div className="w-1/2 border border-gray-300 rounded-lg p-4 bg-gray-50">
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-600">Sub Total</span>
                    <span className="font-medium">{formatCurrency(data.subtotal)}</span>
                  </div>
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-600">Total GST</span>
                    <span className="font-medium">{formatCurrency(data.totalGST)}</span>
                  </div>
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-600">Discount</span>
                    <span className="font-medium text-green-600">{data.discount > 0 ? `-${formatCurrency(data.discount)}` : '-'}</span>
                  </div>
                  <div className="border-t border-gray-300 mt-2 pt-2 flex justify-between items-center">
                    <span className="font-bold text-lg text-gray-900">GRAND TOTAL</span>
                    <span className="font-bold text-xl text-gray-900">{formatCurrency(data.grandTotal)}</span>
                  </div>
                </div>
              </div>

              {/* RETURN POLICY */}
              <div className="mt-8 border-2 border-dashed border-gray-300 rounded-lg p-4 bg-gray-50 text-center">
                {data.returnPolicy ? (
                  <p className="text-gray-700 italic">{data.returnPolicy}</p>
                ) : (
                  <p className="text-gray-700 italic">
                    All goods sold are not returnable.<br/>
                    {data.thankYouText || 'Thank you for your business!'}
                  </p>
                )}
              </div>

              {/* SIGNATURES */}
              <div className="mt-16 flex justify-between px-8">
                <div className="text-center w-48">
                  <div className="border-b border-black mb-2 pb-8">
                    {/* Placeholder for Customer Signature */}
                  </div>
                  <p className="font-bold text-gray-800">Customer Signature</p>
                  <p className="text-gray-500 text-sm">Name: {data.customerName}</p>
                </div>
                <div className="text-center w-48">
                  <div className="border-b border-black mb-2 pb-8">
                    {/* Placeholder for Owner Signature */}
                  </div>
                  <p className="font-bold text-gray-800">Owner Signature</p>
                  <p className="text-gray-500 text-sm">Name: {data.cashierName}</p>
                </div>
              </div>

              {/* FOOTER */}
              <div className="mt-12 text-center text-gray-600 font-medium">
                <p>Thank You! Visit Again!</p>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  )
}
