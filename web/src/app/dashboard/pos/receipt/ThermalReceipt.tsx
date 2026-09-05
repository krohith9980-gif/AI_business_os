import React from 'react'
import { ReceiptData } from './types'
import { formatCurrency } from '@/utils/currency'

export default function ThermalReceipt({ data }: { data: ReceiptData }) {
  return (
    <div className="w-[80mm] text-black bg-white font-sans text-[12px] leading-tight print:w-[80mm] print:m-0 print:p-0 mx-auto" id="thermal-receipt">
      <style>{`
        @media print {
          /* Hide global app layout components */
          body.print-thermal aside,
          body.print-thermal header {
            display: none !important;
          }
          body.print-thermal main {
            padding: 0 !important;
            margin: 0 !important;
          }

          /* Hide A4 receipt modal explicitly if it is open */
          body.print-thermal #a4-modal-wrapper {
            display: none !important;
          }
          
          /* Hide standard POSClient print:hidden elements */
          body.print-thermal .print\\:hidden {
            display: none !important;
          }

          /* Thermal receipt overrides */
          body.print-thermal #thermal-receipt-wrapper {
            position: absolute;
            left: 0;
            top: 0;
            width: 80mm !important;
          }
        }
        
        .receipt-section {
          page-break-inside: avoid;
          break-inside: avoid;
        }
      `}</style>
      
      {/* SHOP HEADER */}
      <div className="text-center mb-4 receipt-section">
        {data.logoUrl && (
          <img src={data.logoUrl} alt="Logo" className="max-h-16 mx-auto mb-2 object-contain grayscale" />
        )}
        <h1 className="text-[18px] font-bold tracking-tight uppercase text-gray-900">{data.shopName}</h1>
        <h2 className="text-[13px] font-semibold text-gray-800 mt-1">{data.storeName}</h2>
        
        <div className="mt-1 text-[11px] text-gray-600 space-y-0.5">
          {data.address && <p>{data.address}</p>}
          {data.phone && <p>Ph: {data.phone}</p>}
          {data.email && <p>{data.email}</p>}
          {data.gstin && <p className="font-semibold mt-1">GSTIN: {data.gstin}</p>}
        </div>
      </div>

      {/* SALES INVOICE TITLE */}
      <div className="text-center border-y border-gray-400 py-1.5 mb-3 receipt-section bg-gray-50">
        <h3 className="text-[14px] font-bold tracking-wider uppercase text-gray-900">Sales Invoice</h3>
      </div>

      {/* BILL INFO */}
      <div className="flex flex-col space-y-0.5 mb-3 text-[11px] receipt-section">
        <div className="flex justify-between">
          <span className="text-gray-600">Bill No:</span>
          <span className="font-bold">{data.invoiceNumber || data.saleId.split('-')[0]}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Date:</span>
          <span className="font-medium">{data.date} {data.time}</span>
        </div>
      </div>

      {/* CUSTOMER & PAYMENT DETAILS */}
      <div className="border-t border-gray-300 pt-2 mb-3 text-[11px] receipt-section">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-[9px] text-gray-500 font-semibold uppercase mb-0.5">Customer</p>
            <p className="font-bold">{data.customerName}</p>
            {data.customerMobile && <p className="text-gray-700">{data.customerMobile}</p>}
          </div>
          <div className="text-right">
            <p className="text-[9px] text-gray-500 font-semibold uppercase mb-0.5">Payment</p>
            <p className="font-bold">{data.paymentMethod}</p>
            <p className="text-gray-700">[{data.paymentStatus}]</p>
          </div>
        </div>
        <div className="mt-2 text-right flex justify-between">
            <p className="text-[9px] text-gray-500 font-semibold uppercase">Cashier</p>
            <p className="text-gray-700">
              {data.cashierName} {data.cashierRole ? `(${data.cashierRole})` : ''}
            </p>
        </div>
      </div>

      {/* ITEMS */}
      <div className="mb-3">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-y border-gray-400 bg-gray-50">
              <th className="font-semibold py-1.5 text-[11px] pl-1">Item</th>
              <th className="font-semibold py-1.5 text-[11px] text-center w-10">Qty</th>
              <th className="font-semibold py-1.5 text-[11px] text-right w-14">Rate</th>
              <th className="font-semibold py-1.5 text-[11px] text-right pr-1 w-16">Amount</th>
            </tr>
          </thead>
          <tbody className="align-top">
            {data.items.map((item) => (
              <tr key={item.id} className="border-b border-gray-100 last:border-b-0 receipt-section">
                <td className="py-1.5 pl-1 pr-2">
                  <div className="font-semibold text-[11px] text-gray-900 break-words leading-tight">
                    {item.serialNumber}. {item.productName}
                  </div>
                  <div className="text-[9px] text-gray-500 mt-0.5 flex flex-wrap gap-x-2">
                    {item.hsn && <span>HSN:{item.hsn}</span>}
                    {item.sku && <span>SKU:{item.sku}</span>}
                    {item.gstPercentage ? <span>GST:{item.gstPercentage}%</span> : null}
                  </div>
                </td>
                <td className="py-1.5 text-center text-[11px] font-medium text-gray-800">
                  {item.quantity}
                </td>
                <td className="py-1.5 text-right text-[11px] text-gray-700">
                  {Number(item.unitPrice).toFixed(2)}
                </td>
                <td className="py-1.5 text-right font-semibold text-[11px] pr-1">
                  {Number(item.lineTotal).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* TOTALS */}
      <div className="border-t-[1.5px] border-black pt-2 space-y-1 receipt-section">
        <div className="flex justify-between text-[11px] text-gray-700 px-1">
          <span>Subtotal</span>
          <span>{Number(data.subtotal).toFixed(2)}</span>
        </div>
        {data.discount > 0 && (
          <div className="flex justify-between text-[11px] text-red-600 px-1">
            <span>Discount</span>
            <span>-{Number(data.discount).toFixed(2)}</span>
          </div>
        )}
        {data.totalGST > 0 && (
          <div className="flex justify-between text-[11px] text-gray-700 px-1">
            <span>Tax (GST)</span>
            <span>{Number(data.totalGST).toFixed(2)}</span>
          </div>
        )}
        
        <div className="flex justify-between items-center font-bold text-[16px] border-y-[1.5px] border-black py-2 mt-2 px-1 bg-gray-50">
          <span className="uppercase tracking-wide">Grand Total</span>
          <span>{formatCurrency(data.grandTotal)}</span>
        </div>
      </div>

      <div className="text-[10px] mt-1 mb-4 italic text-gray-600 text-right px-1 receipt-section">
        {data.amountInWords}
      </div>

      {/* RETURN POLICY */}
      <div className="mb-6 rounded border border-gray-300 p-2 text-center bg-gray-50 receipt-section">
        <p className="text-[9.5px] text-gray-600 font-medium">
          {data.returnPolicy || "All goods sold are subject to store return policy."}
        </p>
      </div>
      
      {/* SIGNATURES */}
      <div className="flex justify-between items-end mt-8 px-2 text-[10px] font-semibold text-gray-600 receipt-section h-10">
        <div className="text-center w-[40%] border-t border-gray-400 pt-1.5">
           Customer Signature
        </div>
        <div className="text-center w-[40%] border-t border-gray-400 pt-1.5">
           Owner Signature
        </div>
      </div>

      {/* FOOTER */}
      <div className="mt-6 text-center receipt-section pb-4">
        <p className="font-bold text-[13px] text-gray-900 tracking-wide">Thank You!</p>
        <p className="text-[11px] text-gray-600 mt-0.5">Please visit again</p>
      </div>
    </div>
  )
}

