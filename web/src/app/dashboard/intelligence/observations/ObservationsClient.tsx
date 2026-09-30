'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Database } from '@/types/database.types';

type Source = Database['public']['Tables']['agri_intelligence_sources']['Row'];
type Observation = Database['public']['Tables']['agri_observations']['Row'];

export default function ObservationsClient({ organizationId }: { organizationId: string }) {
  const supabase = createClient();
  const [sources, setSources] = useState<Source[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [organizationId]);

  async function fetchData() {
    setLoading(true);
    const { data: sourceData, error: sError } = await supabase
      .from('agri_intelligence_sources')
      .select('*')
      .eq('organization_id', organizationId)
      .order('name');
      
    const { data: obsData, error: oError } = await supabase
      .from('agri_observations')
      .select('*')
      .eq('organization_id', organizationId)
      .order('observation_date', { ascending: false });

    if (sError) console.error(sError);
    if (oError) console.error(oError);

    setSources(sourceData || []);
    setObservations(obsData || []);
    setLoading(false);
  }

  async function handleAddObservation(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    
    const newObs = {
      organization_id: organizationId,
      source_id: fd.get('source_id') as string,
      observation_date: fd.get('observation_date') as string,
      publication_date: fd.get('publication_date') as string,
      season: fd.get('season') as string,
      geographic_level: fd.get('geographic_level') as any,
      region: fd.get('region') as string,
      crop_name: fd.get('crop_name') as string,
      crop_stage: fd.get('crop_stage') as string,
      progress_status: fd.get('progress_status') as string,
      advisory_notes: fd.get('advisory_notes') as string,
      observed_text: fd.get('observed_text') as string,
      source_reference_url: fd.get('source_reference_url') as string,
      confidence_score: parseFloat(fd.get('confidence_score') as string),
      freshness_status: fd.get('freshness_status') as any,
    };

    const { error: insErr } = await supabase.from('agri_observations').insert(newObs);
    if (insErr) {
      setError(insErr.message);
    } else {
      await fetchData();
      (e.target as HTMLFormElement).reset();
    }
    setSubmitting(false);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Form */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h2 className="text-xl font-semibold mb-4">Add Observation</h2>
        {error && <div className="p-3 bg-red-50 text-red-700 rounded mb-4">{error}</div>}
        <form onSubmit={handleAddObservation} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Source</label>
              <select name="source_id" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border">
                <option value="">Select a source...</option>
                {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Crop Name</label>
              <input type="text" name="crop_name" required placeholder="e.g., Cotton" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Observation Date</label>
              <input type="date" name="observation_date" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Publication Date</label>
              <input type="date" name="publication_date" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Season</label>
              <input type="text" name="season" required placeholder="Kharif" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Level</label>
              <select name="geographic_level" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border">
                <option value="STATE">State</option>
                <option value="DISTRICT">District</option>
                <option value="MANDAL">Mandal</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Region Name</label>
              <input type="text" name="region" required placeholder="Telangana State" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Crop Stage</label>
              <input type="text" name="crop_stage" required placeholder="Flowering" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Progress</label>
              <select name="progress_status" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border">
                <option value="NORMAL">Normal</option>
                <option value="EARLY">Early</option>
                <option value="DELAYED">Delayed</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Freshness</label>
              <select name="freshness_status" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border">
                <option value="FRESH">Fresh</option>
                <option value="AGING">Aging</option>
                <option value="STALE">Stale</option>
                <option value="CRITICAL">Critical</option>
                <option value="UNAVAILABLE">Unavailable</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div>
              <label className="block text-sm font-medium text-gray-700">Confidence (0-1)</label>
              <input type="number" step="0.1" max="1" min="0" name="confidence_score" defaultValue="0.9" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" />
            </div>
             <div>
              <label className="block text-sm font-medium text-gray-700">Source URL</label>
              <input type="url" name="source_reference_url" placeholder="https://..." className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Observed Text / Excerpt</label>
            <textarea name="observed_text" rows={2} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"></textarea>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Advisory Notes</label>
            <textarea name="advisory_notes" rows={2} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"></textarea>
          </div>

          <button type="submit" disabled={submitting} className="w-full bg-blue-600 text-white p-2 rounded-md hover:bg-blue-700 disabled:opacity-50">
            {submitting ? 'Saving...' : 'Save Observation'}
          </button>
        </form>
      </div>

      {/* List */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 overflow-y-auto max-h-[800px]">
        <h2 className="text-xl font-semibold mb-4">Recent Observations</h2>
        {loading ? <p>Loading...</p> : (
          <div className="space-y-4">
            {observations.length === 0 ? <p className="text-gray-500">No observations found.</p> : null}
            {observations.map(obs => (
              <div key={obs.id} className="p-4 border rounded-md">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-semibold text-lg">{obs.crop_name} - {obs.crop_stage}</h3>
                    <p className="text-sm text-gray-500">{obs.region} ({obs.geographic_level})</p>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    obs.freshness_status === 'FRESH' ? 'bg-green-100 text-green-800' :
                    obs.freshness_status === 'AGING' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {obs.freshness_status}
                  </span>
                </div>
                <div className="text-sm text-gray-700 mb-2">
                  <span className="font-medium">Status:</span> {obs.progress_status}
                </div>
                {obs.advisory_notes && (
                  <div className="text-sm bg-gray-50 p-2 rounded text-gray-600 mb-2">
                    {obs.advisory_notes}
                  </div>
                )}
                <div className="text-xs text-gray-400 mt-2 flex justify-between">
                  <span>Observed: {obs.observation_date}</span>
                  <span>Confidence: {obs.confidence_score}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
