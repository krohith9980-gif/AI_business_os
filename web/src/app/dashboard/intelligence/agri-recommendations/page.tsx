import { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import { ArrowLeft, ShoppingCart, Sprout } from 'lucide-react';
import AgriRecClient from './AgriRecClient';

export const metadata: Metadata = {
  title: 'Agricultural Intelligence | AI Business OS',
};

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
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Header & Sub-Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500 mb-1">
            <Link 
              href="/dashboard/intelligence" 
              className="inline-flex items-center gap-1 text-gray-500 hover:text-indigo-600 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Intelligence Hub
            </Link>
            <span>/</span>
            <span className="text-emerald-700 font-semibold">Agricultural Recommendations</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            Agricultural Intelligence Stock Recommendations
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Proactive recommendations combining real-world agricultural observations + product Agricultural Use + shop sales and inventory.
          </p>
        </div>

        {/* Sub-Navigation Tabs */}
        <div className="flex items-center bg-gray-100 p-1 rounded-xl self-start sm:self-auto">
          <Link
            href="/dashboard/intelligence"
            className="px-4 py-2 text-sm font-medium rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-200/60 transition-all flex items-center gap-1.5"
          >
            <ShoppingCart className="w-4 h-4 text-indigo-600" />
            Purchasing Intelligence
          </Link>
          <Link
            href="/dashboard/intelligence/agri-recommendations"
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-white text-gray-900 shadow-sm transition-all flex items-center gap-1.5"
          >
            <Sprout className="w-4 h-4 text-emerald-600" />
            Agricultural Intelligence
          </Link>
        </div>
      </div>
      
      <AgriRecClient organizationId={activeOrgId} />
    </div>
  );
}
