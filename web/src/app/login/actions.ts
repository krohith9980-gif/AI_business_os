'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export async function login(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { error: error.message }
  }

  // Check for active organization membership
  const { data: memberships } = await supabase
    .from('organization_members')
    .select('id')
    .eq('profile_id', data.user.id)
    .eq('is_active', true)
    .limit(1)

  revalidatePath('/', 'layout')

  if (memberships && memberships.length > 0) {
    redirect('/dashboard')
  } else {
    redirect('/setup')
  }
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
