import React from 'react'
import { ReceiptData } from './types'
import { formatCurrency } from '@/utils/currency'

export default function ThermalReceipt({ data }: { data: ReceiptData }) {
  return (
    <div className="w-[80mm] text-black bg-white font-mono text-[11px] leading-[1.2] print:w-[80mm] print:m-0 print:p-0 mx-auto" id="thermal-receipt">
      <style>{`
        @media print {
          @page {
            size: 80mm auto;
            margin: 0;
          }
          body {
            margin: 0;
            padding: 0;
          }
          #thermal-receipt {
            width: 80mm !important;
            padding: 2mm !important;
          }
          /* Hide everything else when printing this component */
          body > *:not(#thermal-receipt) {
            display: none !important;
          }
        }
      `}</style>
      
      {/* SHOP HEADER */}
      <div className="text-center mb-3">
        {data.logoUrl && (
          <img src={data.logoUrl} alt="Logo" className="max-h-12 mx-auto mb-1 grayscale" />
        )}
        <h1 className="text-[14px] font-bold uppercase">{data.shopName}</h1>
        <h2 className="text-[12px] font-semibold">{data.storeName}</h2>
        {data.address && <p>{data.address}</p>}
        {data.phone && <p>Ph: {data.phone}</p>}
        {data.email && <p>{data.email}</p>}
        {data.gstin && <p>GSTIN: {data.gstin}</p>}
      </div>

      <div className="text-center border-t border-b border-black border-dashed py-1 mb-2">
        <h3 className="text-[13px] font-bold uppercase">SALES BILL / INVOICE</h3>
      </div>

      <div className="mb-2">
        {data.invoiceNumber ? (
          <p className="font-bold text-[12px]">Bill No: {data.invoiceNumber}</p>
        ) : (
          <p className="font-bold text-[10px] break-all">Ref No: {data.saleId.split('-')[0]}</p>
        )}
        <p>Date: {data.date} {data.time}</p>
      </div>

      <div className="border-t border-b border-black border-dashed py-1 mb-2">
        <p className="font-bold">Customer Details:</p>
        <p>Name: {data.customerName}</p>
        {data.customerMobile && <p>Mobile: {data.customerMobile}</p>}
        <div className="mt-1">
          <p>Payment: {data.paymentMethod} [{data.paymentStatus}]</p>
          <p>Cashier: {data.cashierName}</p>
        </div>
      </div>

      {/* ITEMS */}
      <table className="w-full text-left mb-2 border-collapse">
        <thead>
          <tr className="border-b border-black">
            <th className="font-semibold py-1">Item</th>
            <th className="font-semibold py-1 text-right">Qty</th>
            <th className="font-semibold py-1 text-right">Price</th>
            <th className="font-semibold py-1 text-right">Amt</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item) => (
            <React.Fragment key={item.id}>
              <tr>
                <td colSpan={4} className="pt-1 font-semibold truncate max-w-[200px]">
                  {item.serialNumber}. {item.productName}
                </td>
              </tr>
              {(item.sku || item.hsn) && (
                <tr>
                  <td colSpan={4} className="text-[9px] text-gray-700">
                    {item.hsn ? `HSN: ${item.hsn} ` : ''}{item.sku ? `SKU: ${item.sku}` : ''}
                  </td>
                </tr>
              )}
              <tr>
                <td className="pb-1 pl-2 text-[9px]">
                  {item.unit} {item.gstPercentage ? `(GST ${item.gstPercentage}%)` : ''}
                </td>
                <td className="pb-1 text-right">{item.quantity}</td>
                <td className="pb-1 text-right">{Number(item.unitPrice).toFixed(2)}</td>
                <td className="pb-1 text-right">{Number(item.lineTotal).toFixed(2)}</td>
              </tr>
            </React.Fragment>
          ))}
        </tbody>
      </table>

      {/* TOTALS */}
      <div className="border-t border-black border-dashed pt-1 space-y-[2px]">
        <div className="flex justify-between">
          <span>Sub Total:</span>
          <span>{Number(data.subtotal).toFixed(2)}</span>
        </div>
        {data.discount > 0 && (
          <div className="flex justify-between">
            <span>Discount:</span>
            <span>-{Number(data.discount).toFixed(2)}</span>
          </div>
        )}
        {data.totalGST > 0 && (
          <div className="flex justify-between">
            <span>Total GST:</span>
            <span>{Number(data.totalGST).toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-[14px] border-t border-black pt-1 mt-1">
          <span>GRAND TOTAL:</span>
          <span>{formatCurrency(data.grandTotal)}</span>
        </div>
      </div>

      <div className="text-[10px] mt-2 mb-2 italic">
        {data.amountInWords}
      </div>

      {/* RETURN POLICY */}
      <div className="mt-3 border border-black border-dashed p-1 text-center">
        {data.returnPolicy ? (
          <p className="text-[10px] italic">{data.returnPolicy}</p>
        ) : (
          <p className="text-[10px] italic">
            All goods sold are not returnable.<br/>
            Thank you for your business!
          </p>
        )}
      </div>
      
      {/* SIGNATURES */}
      <div className="flex justify-between mt-8 px-1 text-[9px]">
        <div className="text-center w-[30%]">
           <div className="border-t border-black pt-1">Customer</div>
        </div>
        <div className="text-center w-[30%]">
           <div className="border-t border-black pt-1">Owner</div>
        </div>
      </div>

      {/* FOOTER */}
      <div className="mt-4 text-center">
        <p className="font-bold text-[12px] pb-4">Thank You! Visit Again!</p>
        <div className="pb-6"></div> {/* Padding for tear-off */}
      </div>
    </div>
  )
}
