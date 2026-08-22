'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export async function register(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const fullName = formData.get('fullName') as string

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback`,
      data: {
        full_name: fullName,
      }
    }
  })

  if (error) {
    if (error.message.toLowerCase().includes('rate limit')) {
      return { error: 'Too many signup emails were requested. Please wait and try again later.' }
    }
    return { error: error.message }
  }

  if (!data.session && data.user) {
    return { requiresConfirmation: true }
  }

  // After registration, the trigger creates a profile.
  // The user should have no organization, so we redirect to /setup.
  
  revalidatePath('/', 'layout')
  redirect('/setup')
}
