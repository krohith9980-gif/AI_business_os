'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';

export default function MappingsClient({ organizationId }: { organizationId: string }) {
  const supabase = createClient();
  const [mappings, setMappings] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [organizationId]);

  async function fetchData() {
    setLoading(true);
    const { data: mapData, error: mError } = await supabase
      .from('agri_input_category_mappings')
      .select('*, products(name)')
      .eq('organization_id', organizationId)
      .order('input_category');
      
    const { data: prodData, error: pError } = await supabase
      .from('products')
      .select('id, name')
      .eq('organization_id', organizationId)
      .order('name');

    if (mError) console.error(mError);
    if (pError) console.error(pError);

    setMappings(mapData || []);
    setProducts(prodData || []);
    setLoading(false);
  }

  async function handleAddMapping(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    
    const newMapping = {
      organization_id: organizationId,
      input_category: fd.get('input_category') as string,
      mapping_type: 'PRODUCT',
      product_id: fd.get('product_id') as string,
      reasoning: fd.get('reasoning') as string,
      confidence_score: parseFloat(fd.get('confidence_score') as string) || 1.0,
      is_active: true
    };

    const { error: insErr } = await supabase.from('agri_input_category_mappings').insert(newMapping);
    if (insErr) {
      setError(insErr.message);
    } else {
      await fetchData();
      (e.target as HTMLFormElement).reset();
    }
    setSubmitting(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to remove this mapping?')) return;
    const { error: delErr } = await supabase.from('agri_input_category_mappings').delete().eq('id', id);
    if (delErr) {
      alert(delErr.message);
    } else {
      await fetchData();
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Form */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h2 className="text-xl font-semibold mb-4">Add Mapping</h2>
        {error && <div className="p-3 bg-red-50 text-red-700 rounded mb-4">{error}</div>}
        <form onSubmit={handleAddMapping} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Agricultural Input Category</label>
            <input type="text" name="input_category" required placeholder="e.g., Urea" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Mapped Product</label>
            <select name="product_id" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border">
              <option value="">Select a product...</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Reasoning</label>
            <input type="text" name="reasoning" placeholder="e.g., Recommended standard for Urea" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Confidence Score (0.0 - 1.0)</label>
            <input type="number" step="0.01" max="1" min="0" name="confidence_score" defaultValue="1.0" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" />
          </div>
          
          <button type="submit" disabled={submitting} className="w-full bg-blue-600 text-white p-2 rounded-md hover:bg-blue-700 disabled:opacity-50">
            {submitting ? 'Saving...' : 'Save Mapping'}
          </button>
        </form>
      </div>

      {/* List */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h2 className="text-xl font-semibold mb-4">Active Mappings</h2>
        {loading ? (
          <p>Loading...</p>
        ) : mappings.length === 0 ? (
          <p className="text-gray-500">No mappings found.</p>
        ) : (
          <div className="space-y-4">
            {mappings.map(m => (
              <div key={m.id} className="p-4 border rounded-lg bg-gray-50 flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-lg">{m.input_category}</h3>
                  <p className="text-sm text-gray-600">→ {m.products?.name}</p>
                  {m.reasoning && <p className="text-xs text-gray-500 mt-1 italic">"{m.reasoning}" (Conf: {m.confidence_score})</p>}
                </div>
                <button onClick={() => handleDelete(m.id)} className="text-red-500 hover:text-red-700 text-sm">
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
