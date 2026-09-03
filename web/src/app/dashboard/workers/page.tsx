import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import WorkersClient from './WorkersClient'

export default async function WorkersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return redirect('/login')
  }

  // Get current user's organization
  const { data: orgMember } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('profile_id', user.id)
    .eq('is_active', true)
    .single()

  if (!orgMember || orgMember.role !== 'OWNER') {
    // Only owners can view/manage workers
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Workers</h1>
        <div className="bg-red-50 p-4 rounded-md border border-red-200 text-red-700">
          Access Denied. Only Organization Owners can manage staff.
        </div>
      </div>
    )
  }

  // Fetch Stores for the dropdown
  const { data: stores } = await supabase
    .from('stores')
    .select('id, name')
    .eq('organization_id', orgMember.organization_id)
    .eq('is_active', true)

  // Fetch Active Members
  const { data: members, error: memError } = await supabase
    .from('organization_members')
    .select(`
      profile_id,
      role,
      is_active,
      profiles ( 
        full_name,
        user_stores ( store_id, is_active, stores ( name ) ) 
      )
    `)
    .eq('organization_id', orgMember.organization_id)

  // Fetch Pending Invitations
  const { data: invitations, error: invError } = await supabase
    .from('worker_invitations')
    .select(`
      id,
      phone_number,
      intended_name,
      role,
      status,
      store_id,
      stores ( name )
    `)
    .eq('organization_id', orgMember.organization_id)
    .in('status', ['PENDING'])

  const unifiedList = []

  if (members) {
    for (const m of members) {
      if (m.profile_id === user.id) continue; // Skip self

      const activeUserStore = (m.profiles as any)?.user_stores?.find((us: any) => us.is_active)

      unifiedList.push({
        id: m.profile_id,
        type: 'MEMBER' as const,
        name: (m.profiles as any)?.full_name || 'Unknown',
        phone: 'Registered User',
        role: m.role,
        storeName: (activeUserStore as any)?.stores?.name || 'No Store',
        storeId: activeUserStore?.store_id || null,
        status: m.is_active ? 'ACTIVE' : 'DISABLED'
      })
    }
  }

  if (invitations) {
    for (const inv of invitations) {
      unifiedList.push({
        id: inv.id,
        type: 'INVITATION' as const,
        name: inv.intended_name,
        phone: inv.phone_number,
        role: inv.role,
        storeName: (inv.stores as any)?.name || 'Unknown Store',
        storeId: inv.store_id || null,
        status: inv.status
      })
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <WorkersClient
        workers={unifiedList}
        stores={stores || []}
        orgId={orgMember.organization_id}
      />
    </div>
  )
}
