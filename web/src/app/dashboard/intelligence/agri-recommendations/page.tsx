import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import AgriRecClient from './AgriRecClient';

export default async function AgriRecPage() {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect('/auth/login');
  }

  // Get current user's active organization from memberships
  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('profile_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1);

  const activeOrgId = memberships?.[0]?.organization_id;
  const role = memberships?.[0]?.role;

  if (!activeOrgId) {
    redirect('/dashboard');
  }

  if (role !== 'OWNER' && role !== 'MANAGER') {
    return (
      <div className="container mx-auto p-8">
        <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
        <p className="mt-2 text-gray-700">You must be an owner or manager to view Agricultural Stock Recommendations.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agri-Intelligence Stock Recommendations</h1>
          <p className="text-sm text-gray-500 mt-1">
            Data-driven purchasing recommendations based on real-world agricultural observations and your shop's recent sales.
          </p>
        </div>
      </div>
      
      <AgriRecClient organizationId={activeOrgId} />
    </div>
  );
}
