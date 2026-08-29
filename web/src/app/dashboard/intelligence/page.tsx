import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import IntelligenceDashboardClient from './IntelligenceDashboardClient';

export default async function IntelligenceDashboardPage() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    redirect('/auth/login');
  }

  // Get current user's profile to find organization_id
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', session.user.id)
    .single();

  if (!profile?.organization_id) {
    redirect('/dashboard');
  }

  // Fetch the secure dashboard view
  const { data: intelligenceData, error } = await supabase
    .rpc('get_intelligence_dashboard', { p_org_id: profile.organization_id });

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
        organizationId={profile.organization_id} 
      />
    </div>
  );
}
