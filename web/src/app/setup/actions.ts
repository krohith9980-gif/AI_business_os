'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export async function setupOrganization(formData: FormData) {
  const supabase = await createClient()

  // Verify authentication first
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) {
    redirect('/login')
  }

  const businessName = formData.get('businessName') as string
  const ownerName = formData.get('ownerName') as string
  const phone = formData.get('phone') as string
  const address = formData.get('address') as string
  const village = formData.get('village') as string
  const businessType = formData.get('businessType') as string

  // The RPC creates the org, member, and store in a transaction
  const { data: orgId, error } = await supabase.rpc('create_organization_and_store', {
    p_org_name: businessName,
    p_store_name: `${businessName} (Main Store)`,
    p_business_type: businessType,
    p_owner_name: ownerName,
    p_phone: phone,
    p_address: address,
    p_village: village
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}
