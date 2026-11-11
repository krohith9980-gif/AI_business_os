'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function recordCustomerPaymentAction(formData: FormData) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'Unauthorized: User is not authenticated' }
    }

    // RBAC: Verify user role. Cashiers are strictly forbidden from customer debt management
    const { data: member } = await supabase
      .from('organization_members')
      .select('role')
      .eq('profile_id', user.id)
      .eq('is_active', true)
      .limit(1)
      .single()

    const role = (member?.role as string) || 'CASHIER'
    if (role !== 'OWNER' && role !== 'MANAGER') {
      return {
        success: false,
        error: 'Forbidden: Cashiers are not authorized to record customer credit payments.'
      }
    }

    const customerId = formData.get('customerId') as string
    const storeId = formData.get('storeId') as string
    const amountStr = formData.get('amount') as string
    const method = (formData.get('method') as string) || 'CASH'
    const notes = formData.get('notes') as string | null

    if (!customerId) return { success: false, error: 'Customer is required' }
    if (!storeId) return { success: false, error: 'Store selection is required' }
    
    const amount = parseFloat(amountStr)
    if (isNaN(amount) || amount <= 0) {
      return { success: false, error: 'Valid positive payment amount is required' }
    }

    if (!['CASH', 'UPI', 'CARD'].includes(method)) {
      return { success: false, error: 'Invalid payment method. Allowed: CASH, UPI, CARD' }
    }

    // Call the authoritative record_customer_payment RPC
    const { data: paymentId, error: rpcError } = await supabase.rpc('record_customer_payment', {
      p_store_id: storeId,
      p_customer_id: customerId,
      p_amount: amount,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      p_method: method as any,
      p_notes: notes || undefined
    })

    if (rpcError) {
      console.error('RPC record_customer_payment error:', rpcError)
      return { success: false, error: rpcError.message }
    }

    revalidatePath('/dashboard')
    return { success: true, paymentId }
  } catch (err: any) {
    console.error('Unexpected error in recordCustomerPaymentAction:', err)
    return { success: false, error: err.message || 'Failed to record customer payment' }
  }
}

