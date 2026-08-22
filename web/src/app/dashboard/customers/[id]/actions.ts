'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function recordCustomerPayment(formData: FormData) {
  const supabase = await createClient()
  
  const customerId = formData.get('customer_id') as string
  const amount = parseFloat(formData.get('amount') as string)
  const method = formData.get('method') as string
  const notes = formData.get('notes') as string
  const storeId = formData.get('store_id') as string

  if (!customerId || isNaN(amount) || amount <= 0 || !method || !storeId) {
    return { error: 'Invalid input. Make sure to provide amount and select a valid store.' }
  }

  const { error } = await supabase.rpc('record_customer_payment', {
    p_store_id: storeId,
    p_customer_id: customerId,
    p_amount: amount,
    p_method: method,
    p_notes: notes || null
  })

  if (error) {
    console.error('Payment error:', error)
    return { error: error.message }
  }

  revalidatePath(`/dashboard/customers/${customerId}`)
  return { success: true }
}
