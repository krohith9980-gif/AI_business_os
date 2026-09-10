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
  items: InvoicePurchaseItem[]
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
      p_items: items
    })

    if (rpcError) {
      console.error('Invoice Purchase RPC Error:', rpcError)
      return { error: rpcError.message || 'Failed to create invoice purchase order' }
    }

    revalidatePath('/dashboard/purchases')
    revalidatePath('/dashboard/inventory')
    revalidatePath('/dashboard/products')
    
    return { success: true, poId }
  } catch (err: unknown) {
    console.error('Unexpected error in createInvoicePurchaseOrder:', err)
    return { error: 'An unexpected error occurred during invoice processing' }
  }
}
