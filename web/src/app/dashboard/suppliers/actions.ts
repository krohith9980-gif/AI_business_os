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
  const storeId = formData.get('storeId') as string
  const openingBalanceStr = formData.get('openingBalance') as string
  const openingBalance = openingBalanceStr ? parseFloat(openingBalanceStr) : 0
  
  const attributes = formData.get('attributes') as string
  let parsedAttributes = {}
  try {
    if (attributes) parsedAttributes = JSON.parse(attributes)
  } catch (e) {}

  if (!name || name.trim() === '') {
    return { error: 'Name is required' }
  }
  
  if (openingBalance < 0) {
    return { error: 'Opening balance cannot be negative' }
  }

  try {
    const { data: supplierId, error: rpcError } = await supabase.rpc('create_supplier_with_opening_balance', {
      p_name: name.trim(),
      p_attributes: parsedAttributes,
      p_store_id: storeId || null,
      p_opening_balance: openingBalance
    })

    if (rpcError) {
      console.error('Supplier creation RPC error:', rpcError)
      return { error: rpcError.message || 'Failed to create supplier' }
    }

    revalidatePath('/dashboard/suppliers')
    return { success: true, id: supplierId }
  } catch (err: unknown) {
    console.error('Unexpected error in addSupplier:', err)
    return { error: 'An unexpected error occurred' }
  }
}

export async function editSupplier(formData: FormData) {
  const supabase = await createClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { error: 'Authentication required' }

  const id = formData.get('id') as string
  const name = formData.get('name') as string
  const isActive = formData.get('is_active') === 'true'
  const attributes = formData.get('attributes') as string
  
  let parsedAttributes = {}
  try {
    if (attributes) parsedAttributes = JSON.parse(attributes)
  } catch (e) {}

  if (!id || !name || name.trim() === '') {
    return { error: 'ID and Name are required' }
  }

  try {
    const { data: memberships, error: memError } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('profile_id', user.id)
      .eq('is_active', true)
      .limit(1)

    if (memError || !memberships || memberships.length === 0) {
      return { error: 'Failed to verify organization membership' }
    }
    
    const { organization_id, role } = memberships[0]
    if (role !== 'OWNER' && role !== 'MANAGER') {
      return { error: 'Unauthorized: Only Managers and Owners can edit suppliers.' }
    }

    console.log('Executing editSupplier for id:', id, 'organization_id:', organization_id);
    const { data: updatedRows, error: updateError } = await supabase
      .from('suppliers')
      .update({
        name: name.trim(),
        is_active: isActive,
        attributes: parsedAttributes
      })
      .eq('id', id)
      .eq('organization_id', organization_id)
      .select()

    console.log('Update result:', { updatedRows, updateError });

    if (updateError) {
      console.error('Supplier update error:', updateError)
      if (updateError.code === '23505') {
          return { error: 'A supplier with this name already exists in your organization.' }
      }
      return { error: updateError.message }
    }

    if (!updatedRows || updatedRows.length === 0) {
      console.error('Supplier update failed: No rows matched id and organization_id');
      return { error: 'Update failed: Supplier not found or you lack permission to update it.' }
    }

    revalidatePath('/dashboard/suppliers')
    return { success: true }
  } catch (err: unknown) {
    console.error('Unexpected error in editSupplier:', err)
    return { error: 'An unexpected error occurred' }
  }
}

export async function getSupplierLedger(supplierId: string) {
  const supabase = await createClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { error: 'Authentication required' }

  try {
    const { data: ledger, error } = await supabase
      .from('supplier_ledger')
      .select(`
        id,
        transaction_type,
        amount,
        balance_after,
        reference_id,
        notes,
        created_at
      `)
      .eq('supplier_id', supplierId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Ledger fetch error:', error)
      return { error: 'Failed to fetch ledger' }
    }

    return { success: true, ledger }
  } catch (err: unknown) {
    console.error('Unexpected error in getSupplierLedger:', err)
    return { error: 'An unexpected error occurred' }
  }
}
