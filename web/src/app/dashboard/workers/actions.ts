'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function inviteWorker(formData: FormData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const name = formData.get('name') as string
  const phone = formData.get('phone') as string
  const role = formData.get('role') as string
  const storeId = formData.get('store_id') as string

  if (!name || !phone || !role || !storeId) {
    return { error: 'All fields are required.' }
  }

  try {
    const { data, error } = await supabase.rpc('invite_worker', {
      p_phone: phone,
      p_intended_name: name,
      p_role: role,
      p_store_id: storeId
    })

    if (error) {
      console.error('Invite worker error:', error)
      return { error: error.message || 'Failed to invite worker.' }
    }

    revalidatePath('/dashboard/workers')
    return { success: true }
  } catch (err: any) {
    return { error: err.message || 'An unexpected error occurred.' }
  }
}

export async function disableWorker(profileId: string, orgId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  try {
    const { error } = await supabase.rpc('revoke_worker', {
      p_profile_id: profileId,
      p_org_id: orgId
    })

    if (error) {
      return { error: error.message || 'Failed to disable worker.' }
    }

    revalidatePath('/dashboard/workers')
    return { success: true }
  } catch (err: any) {
    return { error: err.message || 'An unexpected error occurred.' }
  }
}
