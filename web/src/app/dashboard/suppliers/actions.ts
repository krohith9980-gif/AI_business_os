'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function addSupplier(formData: FormData) {
  const supabase = await createClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { error: 'Authentication required' }
  }

  const name = formData.get('name') as string

  if (!name || name.trim() === '') {
    return { error: 'Name is required' }
  }

  try {
    // 1. Determine user's authorized organization securely on the server
    const { data: memberships, error: memError } = await supabase
      .from('organization_members')
      .select('organization_id, role')
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

    const { organization_id, role } = memberships[0]

    if (role !== 'OWNER' && role !== 'MANAGER') {
      return { error: 'Unauthorized: Only Managers and Owners can add suppliers.' }
    }

    // 2. Insert the supplier using the securely determined organization_id
    const { error: insertError } = await supabase
      .from('suppliers')
      .insert({
        organization_id,
        name: name.trim(),
        is_active: true
      })

    if (insertError) {
      console.error('Supplier insert error:', insertError)
      if (insertError.code === '23505') {
          return { error: 'A supplier with this name already exists in your organization.' }
      }
      return { error: insertError.message }
    }

    revalidatePath('/dashboard/suppliers')
    return { success: true }
  } catch (err: unknown) {
    console.error('Unexpected error in addSupplier:', err)
    return { error: 'An unexpected error occurred' }
  }
}
