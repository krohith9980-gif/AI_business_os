import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import IntelligenceDashboardClient from './IntelligenceDashboardClient';

export default async function IntelligenceDashboardPage() {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect('/auth/login');
  }

  // Get current user's active organization from memberships
  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('profile_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1);

  const activeOrgId = memberships?.[0]?.organization_id;

  if (!activeOrgId) {
    redirect('/dashboard');
  }

  // Fetch the secure dashboard view
  const { data: intelligenceData, error } = await supabase
    .rpc('get_intelligence_dashboard', { p_org_id: activeOrgId });

  if (error) {
    console.error('Error fetching intelligence dashboard:', error);
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Purchasing Intelligence</h1>
          <p className="text-sm text-gray-500 mt-1">
            Data-driven purchasing recommendations based on your historical sales.
          </p>
        </div>
      </div>
      
      <IntelligenceDashboardClient 
        initialData={intelligenceData || []} 
        organizationId={activeOrgId} 
      />
    </div>
  );
}
