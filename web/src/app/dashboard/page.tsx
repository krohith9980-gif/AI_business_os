import { createClient } from '@/utils/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()

  // 1. Get the authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return (
      <div className="text-red-600 p-4 bg-red-50 rounded-md">
        Authentication Error: {authError?.message || 'Not authenticated'}
      </div>
    )
  }

  // 2. Fetch the user's profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // 3. Fetch organizations the user belongs to and their roles
  // The existing RLS automatically restricts this to orgs they are members of.
  const { data: memberships, error: orgError } = await supabase
    .from('organization_members')
    .select(`
      role,
      organizations (
        id,
        name
      )
    `)
    .eq('profile_id', user.id)
    .eq('is_active', true)

  // 4. Fetch the specific stores the user is assigned to (useful for CASHIER role)
  const { data: userStores, error: storesError } = await supabase
    .from('user_stores')
    .select(`
      stores (
        id,
        name,
        location
      )
    `)
    .eq('profile_id', user.id)
    .eq('is_active', true)

  const hasErrors = profileError || orgError || storesError

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">
        Welcome back, {profile?.full_name || user.email}
      </h1>

      {hasErrors && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <h2 className="text-sm font-bold text-red-800 mb-2">Errors loading context:</h2>
          <ul className="text-sm text-red-700 list-disc list-inside">
            {profileError && <li>Profile: {profileError.message}</li>}
            {orgError && <li>Orgs: {orgError.message}</li>}
            {storesError && <li>Stores: {storesError.message}</li>}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Profile Card */}
        <div className="bg-white shadow rounded-lg border border-gray-100 overflow-hidden">
          <div className="px-4 py-5 sm:px-6 bg-gray-50 border-b border-gray-100">
            <h3 className="text-lg leading-6 font-medium text-gray-900">Your Profile</h3>
          </div>
          <div className="p-4 sm:p-6">
            <dl className="space-y-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">Email</dt>
                <dd className="mt-1 text-sm text-gray-900">{user.email}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Full Name</dt>
                <dd className="mt-1 text-sm text-gray-900">{profile?.full_name || 'Not set'}</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Organizations Card */}
        <div className="bg-white shadow rounded-lg border border-gray-100 overflow-hidden">
          <div className="px-4 py-5 sm:px-6 bg-gray-50 border-b border-gray-100">
            <h3 className="text-lg leading-6 font-medium text-gray-900">Your Organizations</h3>
          </div>
          <div className="p-4 sm:p-6">
            {memberships && memberships.length > 0 ? (
              <ul className="space-y-3">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {memberships.map((m: any, i: number) => (
                  <li key={i} className="flex justify-between items-center p-3 bg-gray-50 rounded-md">
                    <span className="text-sm font-medium text-gray-900">{m.organizations?.name}</span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {m.role}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">You do not belong to any organizations yet.</p>
            )}
          </div>
        </div>

        {/* Stores Card */}
        <div className="bg-white shadow rounded-lg border border-gray-100 overflow-hidden md:col-span-2">
          <div className="px-4 py-5 sm:px-6 bg-gray-50 border-b border-gray-100">
            <h3 className="text-lg leading-6 font-medium text-gray-900">Assigned Stores</h3>
          </div>
          <div className="p-4 sm:p-6">
            {userStores && userStores.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {userStores.map((us: any, i: number) => (
                  <div key={i} className="border border-gray-200 rounded-md p-4 bg-white hover:border-blue-300 transition-colors">
                    <h4 className="font-medium text-gray-900">{us.stores?.name}</h4>
                    {us.stores?.location && (
                      <p className="text-sm text-gray-500 mt-1">{us.stores.location}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">You are not explicitly assigned to any specific stores. (Owners/Managers may still have access via org roles depending on specific feature RLS policies).</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
