'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function receiveStockAction(formData: FormData) {
  const supabase = await createClient()

  const storeId = formData.get('store_id') as string
  const variantId = formData.get('variant_id') as string
  const quantityStr = formData.get('quantity') as string
  const notes = formData.get('notes') as string | null

  if (!storeId || !variantId || !quantityStr) {
    return { error: 'Missing required fields' }
  }

  const quantity = parseInt(quantityStr, 10)
  if (isNaN(quantity) || quantity <= 0) {
    return { error: 'Quantity must be a positive integer' }
  }

  const { error } = await supabase.rpc('record_inventory_movement', {
    p_store_id: storeId,
    p_variant_id: variantId,
    p_movement_type: 'purchase_received',
    p_quantity: quantity,
    p_notes: notes || null,
  })

  if (error) {
    console.error('Error receiving stock:', error)
    return { error: error.message }
  }

  revalidatePath('/dashboard/inventory')
  return { success: true }
}

export async function adjustStockAction(formData: FormData) {
  const supabase = await createClient()

  const storeId = formData.get('store_id') as string
  const variantId = formData.get('variant_id') as string
  const movementType = formData.get('movement_type') as string
  const quantityStr = formData.get('quantity') as string
  const notes = formData.get('notes') as string | null

  if (!storeId || !variantId || !movementType || !quantityStr) {
    return { error: 'Missing required fields' }
  }

  const validTypes = ['opening_stock', 'adjustment', 'correction', 'damage']
  if (!validTypes.includes(movementType)) {
    return { error: 'Invalid or unsupported movement type' }
  }

  const quantity = parseInt(quantityStr, 10)
  if (isNaN(quantity) || quantity <= 0) {
    return { error: 'Quantity must be a positive integer' }
  }

  const { error } = await supabase.rpc('record_inventory_movement', {
    p_store_id: storeId,
    p_variant_id: variantId,
    p_movement_type: movementType,
    p_quantity: quantity,
    p_notes: notes || null,
  })

  if (error) {
    console.error('Error adjusting stock:', error)
    return { error: error.message }
  }

  revalidatePath('/dashboard/inventory')
  return { success: true }
}
