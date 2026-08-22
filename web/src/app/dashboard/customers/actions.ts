'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function addCustomer(formData: FormData) {
  const supabase = await createClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { error: 'Authentication required' }
  }

  const name = formData.get('name') as string
  const email = formData.get('email') as string
  const phone = formData.get('phone') as string
  const village = formData.get('village') as string

  if (!name || name.trim() === '') {
    return { error: 'Name is required' }
  }

  try {
    // 1. Determine user's authorized organization securely on the server
    const { data: memberships, error: memError } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('profile_id', user.id)
      .eq('is_active', true)
      .limit(1)

    if (memError) {
      console.error('Membership fetch error:', memError)
      return { error: 'Failed to verify organization membership' }
    }
    
    if (!memberships || memberships.length === 0) {
      return { error: 'No active organization found for this user' }
    }

    const organization_id = memberships[0].organization_id

    // 2. Insert the customer using the securely determined organization_id
    const { error: insertError } = await supabase
      .from('customers')
      .insert({
        organization_id,
        name: name.trim(),
        email: email ? email.trim() : null,
        phone_number: phone ? phone.trim() : null,
        village: village ? village.trim() : null,
      })

    if (insertError) {
      console.error('Customer insert error:', insertError)
      // Check for unique constraint violation (e.g. phone number)
      if (insertError.code === '23505') {
          return { error: 'A customer with this phone number or email already exists in your organization.' }
      }
      return { error: insertError.message }
    }

    revalidatePath('/dashboard/customers')
    return { success: true }
  } catch (err: unknown) {
    console.error('Unexpected error in addCustomer:', err)
    return { error: 'An unexpected error occurred' }
  }
}
