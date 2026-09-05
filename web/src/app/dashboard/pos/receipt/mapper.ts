import { ReceiptData, ReceiptItem } from './types'
import { amountInWords } from '@/utils/currency'

export function mapSaleToReceiptData(saleData: any): ReceiptData {
  const dateObj = new Date(saleData.created_at)
  
  const items: ReceiptItem[] = (saleData.sale_items || saleData.items || []).map((item: any, index: number) => {
    // If it's a legacy sale, product_name/sku might be null.
    // Use the stored snapshots if available.
    // DO NOT fallback to variant relational data to preserve historical immutability.
    let pName = item.product_name
    let sSku = item.sku
    let description = undefined
    
    if (!pName) {
      pName = 'Legacy Sale'
      description = 'Historical product information unavailable'
    }
    
    if (!sSku) {
      sSku = '-'
    }

    // The legacy tax logic computes tax to 0. 
    // We map it for future compatibility.
    const taxRate = Number(item.tax_rate) || 0
    const taxAmount = Number(item.cgst || 0) + Number(item.sgst || 0) + Number(item.igst || 0)

    return {
      id: item.id,
      serialNumber: index + 1,
      productName: pName,
      description: description,
      sku: sSku,
      quantity: Number(item.quantity) || 0,
      unit: item.unit || 'units',
      unitPrice: Number(item.unit_selling_price) || 0,
      gstPercentage: taxRate,
      gstAmount: taxAmount,
      discount: Number(item.discount_amount) || 0,
      lineTotal: Number(item.total_price) || 0
    }
  })

  // Calculate payments
  const paymentsList = saleData.payments || []
  const amountPaid = paymentsList.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0)
  
  let paymentMethodStr = 'Multiple'
  if (paymentsList.length === 1) {
    paymentMethodStr = paymentsList[0].method
  } else if (paymentsList.length === 0) {
    paymentMethodStr = 'UNPAID'
  }

  const grandTotal = Number(saleData.grand_total) || 0
  const balanceDue = Math.max(0, grandTotal - amountPaid)

  // Cashier role logic
  let rawRole = ''
  if (saleData.profiles?.role) {
    rawRole = saleData.profiles.role
  } else if (saleData.cashier?.role) {
    rawRole = saleData.cashier.role
  }

  let cashierRole = 'Cashier'
  if (rawRole === 'OWNER') cashierRole = 'Owner'
  else if (rawRole === 'MANAGER') cashierRole = 'Manager'
  else if (rawRole === 'CASHIER') cashierRole = 'Cashier'
  else if (rawRole) cashierRole = rawRole

  // Handle nested objects safely
  const storeName = saleData.stores?.name || saleData.store?.name || 'Unknown Store'
  const custName = saleData.customers?.name || saleData.customer?.name || 'Walk-in'
  const custPhone = saleData.customers?.phone_number || saleData.customer?.phone_number || ''
  const cName = saleData.profiles?.full_name || saleData.cashier?.full_name || 'Unknown'

  return {
    shopName: 'VyaparOS', // In a real app, this might come from tenant config
    storeName: storeName,
    invoiceNumber: saleData.invoice_number || undefined,
    saleId: saleData.id,
    date: dateObj.toLocaleDateString('en-IN'),
    time: dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    customerName: custName,
    customerMobile: custPhone,
    paymentMethod: paymentMethodStr,
    paymentStatus: balanceDue <= 0 ? 'PAID' : 'PARTIAL/UNPAID',
    cashierName: cName,
    cashierRole: cashierRole,
    items: items,
    subtotal: Number(saleData.subtotal) || 0,
    totalGST: Number(saleData.tax_total) || 0,
    discount: Number(saleData.discount_total) || 0,
    grandTotal: grandTotal,
    amountPaid: amountPaid,
    balanceDue: balanceDue,
    amountInWords: amountInWords(grandTotal),
    thankYouText: 'Thank you for your business!'
  }
}
