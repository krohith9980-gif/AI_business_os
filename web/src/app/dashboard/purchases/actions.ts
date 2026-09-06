'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createPurchaseOrder(
  storeId: string,
  supplierId: string,
  idempotencyKey: string,
  items: { variant_id: string; quantity: number; purchase_cost: number }[]
) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { error: 'Authentication required' }
  }

  try {
    // Rely on the RPC process_purchase_order for full transactional integrity, idempotency, and RBAC
    const { data: poId, error: rpcError } = await supabase.rpc('process_purchase_order', {
      p_store_id: storeId,
      p_supplier_id: supplierId,
      p_idempotency_key: idempotencyKey,
      p_items: items // Supabase JS will automatically stringify to JSONB
    })

    if (rpcError) {
      console.error('Purchase RPC Error:', rpcError)
      return { error: rpcError.message || 'Failed to create purchase order' }
    }

    revalidatePath('/dashboard/purchases')
    revalidatePath('/dashboard/inventory') // Assuming inventory page exists
    return { success: true, poId }
  } catch (err: unknown) {
    console.error('Unexpected error in createPurchaseOrder:', err)
    return { error: 'An unexpected error occurred' }
  }
}
