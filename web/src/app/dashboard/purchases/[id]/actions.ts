'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function recordSupplierResponse(poId: string, status: 'SUPPLIER_CONFIRMED' | 'REJECTED' | 'CANCELLED') {
  const supabase = await createClient()

  const { error } = await supabase.rpc('record_supplier_response', {
    p_po_id: poId,
    p_status: status
  })

  if (error) {
    console.error('recordSupplierResponse error:', error)
    return { error: error.message }
  }

  revalidatePath(`/dashboard/purchases/${poId}`)
  revalidatePath('/dashboard/purchases')
  return { success: true }
}

export async function recordGoodsReceipt(
  poId: string, 
  idempotencyKey: string,
  items: Array<{ po_item_id: string, quantity_received: number, batch_number: string, mfg_date: string | null, expiry_date: string | null }>
) {
  const supabase = await createClient()

  const { error } = await supabase.rpc('record_goods_receipt', {
    p_po_id: poId,
    p_idempotency_key: idempotencyKey,
    p_items: items
  })

  if (error) {
    console.error('recordGoodsReceipt error:', error)
    return { error: error.message }
  }

  revalidatePath(`/dashboard/purchases/${poId}`)
  revalidatePath('/dashboard/purchases')
  revalidatePath('/dashboard/inventory')
  return { success: true }
}
