'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export type InvoicePurchaseItem = {
  is_new: boolean
  variant_id?: string
  product_name?: string
  category_id?: string
  sku?: string
  barcode?: string
  purchase_cost: number
  sale_cost: number
  quantity: number
  attributes?: Record<string, any>
}

export async function createInvoicePurchaseOrder(
  storeId: string,
  supplierId: string,
  idempotencyKey: string,
  items: InvoicePurchaseItem[],
  invoiceDiscount: number = 0,
  additionalDiscount: number = 0,
  taxTotal: number = 0,
  amountPaid: number = 0,
  paymentMethod: string = 'CASH',
  paymentReference: string = ''
) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { error: 'Authentication required' }
  }

  try {
    // Process the invoice purchase using the dedicated RPC for atomic creation
    const { data: poId, error: rpcError } = await supabase.rpc('process_invoice_purchase', {
      p_store_id: storeId,
      p_supplier_id: supplierId,
      p_idempotency_key: idempotencyKey,
      p_items: items,
      p_invoice_discount: invoiceDiscount,
      p_additional_discount: additionalDiscount,
      p_tax_total: taxTotal,
      p_amount_paid: amountPaid,
      p_payment_method: paymentMethod,
      p_payment_reference: paymentReference || null
    })

    if (rpcError) {
      console.error('Invoice Purchase RPC Error:', rpcError)
      return { error: rpcError.message || 'Failed to create invoice purchase order' }
    }

    revalidatePath('/dashboard/purchases')
    revalidatePath('/dashboard/inventory')
    revalidatePath('/dashboard/products')
    revalidatePath('/dashboard/suppliers')
    
    return { success: true, poId }
  } catch (err: unknown) {
    console.error('Unexpected error in createInvoicePurchaseOrder:', err)
    return { error: 'An unexpected error occurred during invoice processing' }
  }
}

export async function recordSupplierPayment(
  storeId: string,
  supplierId: string,
  idempotencyKey: string,
  amount: number,
  method: string,
  reference: string,
  notes: string
) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { error: 'Authentication required' }
  }

  try {
    const { data: paymentId, error: rpcError } = await supabase.rpc('record_supplier_payment', {
      p_store_id: storeId,
      p_supplier_id: supplierId,
      p_idempotency_key: idempotencyKey,
      p_amount: amount,
      p_method: method,
      p_reference: reference || null,
      p_notes: notes || null
    })

    if (rpcError) {
      console.error('Record Supplier Payment RPC Error:', rpcError)
      return { error: rpcError.message || 'Failed to record supplier payment' }
    }

    revalidatePath('/dashboard/suppliers')
    
    return { success: true, paymentId }
  } catch (err: unknown) {
    console.error('Unexpected error in recordSupplierPayment:', err)
    return { error: 'An unexpected error occurred while recording payment' }
  }
}
