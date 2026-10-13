import { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import { Sprout, ShoppingCart, ArrowRight } from 'lucide-react';
import IntelligenceDashboardClient from './IntelligenceDashboardClient';

export const metadata: Metadata = {
  title: 'Intelligence Hub | AI Business OS',
};

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
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
      {/* Top Header & Sub-Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Intelligence Hub</h1>
          <p className="text-sm text-gray-500 mt-1">
            Predictive demand and stock recommendations powered by sales velocity and regional agricultural intelligence.
          </p>
        </div>

        {/* Sub-Navigation Tabs */}
        <div className="flex items-center bg-gray-100 p-1 rounded-xl self-start sm:self-auto">
          <Link
            href="/dashboard/intelligence"
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-white text-gray-900 shadow-sm transition-all"
          >
            Purchasing Intelligence
          </Link>
          <Link
            href="/dashboard/intelligence/agri-recommendations"
            className="px-4 py-2 text-sm font-medium rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-200/60 transition-all flex items-center gap-1.5"
          >
            <Sprout className="w-4 h-4 text-emerald-600" />
            Agricultural Intelligence
          </Link>
        </div>
      </div>

      {/* AREA B: Agricultural Intelligence Spotlight */}
      <section className="bg-gradient-to-r from-emerald-50 via-teal-50/40 to-white rounded-2xl border border-emerald-200 p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                <Sprout className="w-3.5 h-3.5 text-emerald-600" />
                Agricultural Intelligence • వ్యవసాయ ఇంటెలిజెన్స్
              </span>
              <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                Phase 2
              </span>
            </div>

            <div>
              <h2 className="text-lg font-bold text-gray-900">
                Crop-Stage & Problem-Driven Stock Recommendations
              </h2>
              <p className="text-sm text-gray-700 mt-1 max-w-3xl leading-relaxed">
                Recommendations use real-world <strong className="font-semibold text-emerald-950">agricultural observations</strong> (crop stages, pest & weed pressures) + product <strong className="font-semibold text-emerald-950">Agricultural Use</strong> classifications + shop <strong className="font-semibold text-emerald-950">sales and inventory</strong> to calculate targeted restock quantities before regional demand spikes.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-emerald-900 font-medium">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/90 border border-emerald-200 shadow-2xs">
                🌱 Agricultural Observations (సస్యరక్షణ పరిశీలనలు)
              </span>
              <span className="text-emerald-400 font-bold">+</span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/90 border border-emerald-200 shadow-2xs">
                🏷️ Product Agricultural Use (ఉపయోగ వర్గీకరణ)
              </span>
              <span className="text-emerald-400 font-bold">+</span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/90 border border-emerald-200 shadow-2xs">
                📦 Shop Sales & Current Stock (విక్రయాలు & నిల్వలు)
              </span>
            </div>
          </div>

          <div className="flex shrink-0">
            <Link
              href="/dashboard/intelligence/agri-recommendations"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
            >
              <span>Open Agricultural Recommendations</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* AREA A: Purchasing Intelligence Section */}
      <section className="space-y-4 pt-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-gray-200 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                <ShoppingCart className="w-3.5 h-3.5" />
                Purchasing Intelligence • కొనుగోలు ఇంటెలిజెన్స్
              </span>
            </div>
            <h2 className="text-lg font-bold text-gray-900 mt-2">
              Sales-Velocity & Reorder Point Recommendations
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Data-driven purchasing recommendations based on historical sales velocity, current stock levels, and supplier lead times.
            </p>
          </div>
        </div>

        {/* Existing Purchasing Intelligence Table & KPIs (Unchanged) */}
        <IntelligenceDashboardClient 
          initialData={intelligenceData || []} 
          organizationId={activeOrgId} 
        />
      </section>
    </div>
  );
}
