'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function completeSale(payload: {
  storeId: string
  customerId: string | null
  items: {
    variant_id: string
    display_quantity: number
    sale_unit: string
    discount_amount: number
  }[]
  payments: {
    method: 'CASH' | 'UPI' | 'CARD' | 'SPLIT' | 'CREDIT'
    amount: number
  }[]
}) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { error: 'Authentication required' }
  }

  // Basic validation
  if (!payload.storeId) {
    return { error: 'Store ID is required' }
  }

  if (!payload.items || payload.items.length === 0) {
    return { error: 'Cart is empty' }
  }

  if ((!payload.payments || payload.payments.length === 0) && !payload.customerId) {
    return { error: 'Payment is required for walk-in customers' }
  }

  try {
    // 1. Determine user's authorized organization and role
    const { data: memberships, error: memError } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('profile_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)

    if (memError || !memberships || memberships.length === 0) {
      return { error: 'No active organization found for this user' }
    }

    const { organization_id, role } = memberships[0]

    // 2. Verify user is authorized for this store
    // The RPC does this internally, but doing it here prevents unnecessary RPC calls
    const { data: store, error: storeError } = await supabase
      .from('stores')
      .select('id, organization_id')
      .eq('id', payload.storeId)
      .eq('organization_id', organization_id)
      .single()

    if (storeError || !store) {
      return { error: 'Unauthorized: Store access denied or store not found' }
    }
    
    // For Cashiers, verify they are explicitly assigned to this store
    if (role !== 'OWNER' && role !== 'MANAGER') {
      const { data: userStore, error: usError } = await supabase
        .from('user_stores')
        .select('store_id')
        .eq('profile_id', user.id)
        .eq('store_id', payload.storeId)
        .single()
        
      if (usError || !userStore) {
         return { error: 'Unauthorized: You are not assigned to this store' }
      }
    }

    // 3. Call the authoritative process_sale RPC
    const { data: saleId, error: rpcError } = await supabase.rpc('process_sale', {
      p_store_id: payload.storeId,
      p_customer_id: payload.customerId || null,
      p_items: payload.items,
      p_payments: payload.payments
    })

    if (rpcError) {
      console.error('Sale RPC error:', rpcError)
      return { error: rpcError.message }
    }

    revalidatePath('/dashboard/pos')
    // We should also revalidate paths that might be affected by the sale
    revalidatePath('/dashboard/inventory')
    
    return { success: true, saleId }
  } catch (err: unknown) {
    console.error('Unexpected error in completeSale:', err)
    return { error: err instanceof Error ? err.message : 'An unexpected error occurred' }
  }
}

export async function createCustomerFromPOS(name: string, phone: string, village: string) {
  const supabase = await createClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { error: 'Authentication required' }
  }

  if (!name || name.trim() === '') {
    return { error: 'Name is required' }
  }
  if (!phone || phone.trim() === '') {
    return { error: 'Phone is required' }
  }
  if (!village || village.trim() === '') {
    return { error: 'Village is required' }
  }

  try {
    const { data: memberships, error: memError } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('profile_id', user.id)
      .eq('is_active', true)
      .limit(1)

    if (memError || !memberships || memberships.length === 0) {
      return { error: 'No active organization found' }
    }

    const organization_id = memberships[0].organization_id

    const { data, error: insertError } = await supabase
      .from('customers')
      .insert({
        organization_id,
        name: name.trim(),
        phone_number: phone.trim(),
        village: village.trim(),
        is_active: true
      })
      .select('id, name, phone_number, email, village')
      .single()

    if (insertError) {
      if (insertError.code === '23505') {
        return { error: 'A customer with this phone number already exists.' }
      }
      return { error: insertError.message }
    }

    return { success: true, customer: data }
  } catch (err: unknown) {
    console.error('Create customer error:', err)
    return { error: 'An unexpected error occurred while creating the customer' }
  }
}
