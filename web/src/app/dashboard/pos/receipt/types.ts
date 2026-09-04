export type ReceiptItem = {
  id: string
  serialNumber: number
  productName: string
  description?: string
  hsn?: string
  sku?: string
  quantity: number
  unit: string // This might just be "units" or base unit if we can extract it, otherwise omit
  unitPrice: number
  gstPercentage?: number
  gstAmount?: number
  discount: number
  lineTotal: number
}

export type ReceiptPayment = {
  id: string
  method: string
  amount: number
  status: string
  paidAt?: string
}

export type ReceiptData = {
  // Shop Header
  logoUrl?: string
  shopName: string
  storeName: string
  address?: string
  phone?: string
  email?: string
  gstin?: string

  // Invoice
  invoiceNumber?: string // The new INV-2026-000001 format
  saleId: string         // Fallback
  date: string
  time: string
  customerName: string
  customerMobile?: string
  paymentMethod: string
  paymentStatus: string
  cashierName: string
  cashierRole?: string

  // Items
  items: ReceiptItem[]

  // Totals
  subtotal: number
  totalGST: number
  discount: number
  grandTotal: number
  amountPaid: number
  balanceDue: number
  amountInWords: string

  // Footer
  returnPolicy?: string
  thankYouText?: string
}
