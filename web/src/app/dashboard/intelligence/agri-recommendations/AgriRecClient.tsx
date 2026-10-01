'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { AlertCircle, Package, Send, Check } from 'lucide-react';

export default function AgriRecClient({ organizationId }: { organizationId: string }) {
  const supabase = createClient();
  const [stores, setStores] = useState<any[]>([]);
  const [selectedStore, setSelectedStore] = useState('');
  const [region, setRegion] = useState('');
  const [crop, setCrop] = useState('');
  
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [suppliers, setSuppliers] = useState<any[]>([]);

  // State for actions
  const [actionStates, setActionStates] = useState<Record<string, {
    quantity: number;
    supplierId: string;
    status: 'PENDING_CONFIRMATION' | 'PO_CREATED' | 'IGNORED';
    poId?: string;
    waUrl?: string;
    waError?: string;
    idempotencyKey: string;
  }>>({});

  useEffect(() => {
    fetchData();
  }, [organizationId]);

  async function fetchData() {
    const { data: storeData } = await supabase.from('stores').select('*').eq('organization_id', organizationId);
    setStores(storeData || []);
    if (storeData && storeData.length > 0) {
      setSelectedStore(storeData[0].id);
    }

    const { data: suppData } = await supabase.from('suppliers').select('*').eq('organization_id', organizationId);
    setSuppliers(suppData || []);
  }

  async function handleGetRecommendations(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStore || !region || !crop) {
      setError('Please fill in all fields');
      return;
    }
    setLoading(true);
    setError(null);
    setRecommendations([]);

    const { data, error: rpcErr } = await supabase.rpc('calculate_stock_recommendations', {
      p_organization_id: organizationId,
      p_store_id: selectedStore,
      p_region: region,
      p_crop_name: crop
    });

    if (rpcErr) {
      setError(rpcErr.message);
    } else {
      setRecommendations(data || []);
      // Initialize action states
      const initialStates: any = {};
      (data || []).forEach((r: any) => {
        initialStates[r.variant_id] = {
          quantity: r.recommended_reorder_quantity || 0,
          supplierId: '',
          status: 'PENDING_CONFIRMATION',
          idempotencyKey: `req_${Date.now()}_${r.variant_id}`
        };
      });
      setActionStates(initialStates);
    }
    setLoading(false);
  }

  const updateState = (variantId: string, updates: any) => {
    setActionStates(prev => ({
      ...prev,
      [variantId]: { ...prev[variantId], ...updates }
    }));
  };

  async function handleConfirm(rec: any) {
    const state = actionStates[rec.variant_id];
    if (state.quantity <= 0) {
      alert('Quantity must be greater than 0');
      return;
    }

    const { data: poData, error: poErr } = await supabase.rpc('process_purchase_order', {
      p_store_id: selectedStore,
      p_organization_id: organizationId,
      p_idempotency_key: state.idempotencyKey,
      p_supplier_id: state.supplierId || null,
      p_items: [{
        variant_id: rec.variant_id,
        quantity: state.quantity,
        unit_price: 0 // Will default to last cost in real scenario, but UI might want to ask
      }]
    });

    if (poErr) {
      alert('Failed to create PO: ' + poErr.message);
      return;
    }

    // Prepare WA link if supplier has phone
    let waUrl = '';
    let waError = '';
    
    if (state.supplierId) {
      const supplier = suppliers.find(s => s.id === state.supplierId);
      if (supplier && supplier.phone) {
        // Strip non-digits except maybe + (or strict digit only per instructions)
        const cleanPhone = supplier.phone.replace(/\D/g, '');
        if (cleanPhone) {
          const msg = encodeURIComponent(`Hello, I would like to place an order for ${state.quantity} of ${rec.product_name} (${rec.sku || ''}). PO Reference: ${poData}`);
          waUrl = `https://wa.me/${cleanPhone}?text=${msg}`;
        } else {
          waError = 'Supplier phone is invalid.';
        }
      } else {
        waError = 'Supplier does not have a phone number.';
      }
    }

    updateState(rec.variant_id, {
      status: 'PO_CREATED',
      poId: poData,
      waUrl,
      waError
    });
  }

  function handleIgnore(variantId: string) {
    updateState(variantId, { status: 'IGNORED' });
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h2 className="text-xl font-semibold mb-4">Query Recommendations</h2>
        <form onSubmit={handleGetRecommendations} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700">Store</label>
            <select value={selectedStore} onChange={e => setSelectedStore(e.target.value)} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border">
              <option value="">Select a store...</option>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Region (e.g., Khammam)</label>
            <input type="text" value={region} onChange={e => setRegion(e.target.value)} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Crop (e.g., Cotton)</label>
            <input type="text" value={crop} onChange={e => setCrop(e.target.value)} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" />
          </div>
          <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white p-2 rounded-md hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'Searching...' : 'Get Recommendations'}
          </button>
        </form>
        {error && <div className="mt-4 p-3 bg-red-50 text-red-700 rounded">{error}</div>}
      </div>

      {recommendations.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Actionable Stock Recommendations</h2>
          {recommendations.map(rec => {
            const state = actionStates[rec.variant_id];
            if (!state) return null;
            if (state.status === 'IGNORED') return null;

            return (
              <div key={rec.variant_id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-6">
                <div className="flex-1 space-y-3">
                  <div>
                    <h3 className="text-lg font-bold">{rec.product_name} <span className="text-sm font-normal text-gray-500">({rec.sku})</span></h3>
                    <p className="text-sm text-green-700 bg-green-50 inline-block px-2 py-1 rounded">
                      Agri Relevance: {rec.input_category} | {rec.crop_stage} | {rec.progress_status}
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm bg-gray-50 p-3 rounded">
                    <div>
                      <span className="block text-gray-500">Recent Sales (30d)</span>
                      <span className="font-semibold">{rec.recent_sales_30d}</span>
                    </div>
                    <div>
                      <span className="block text-gray-500">Current Stock</span>
                      <span className="font-semibold">{rec.current_stock}</span>
                    </div>
                    <div>
                      <span className="block text-gray-500">Reserved</span>
                      <span className="font-semibold">{rec.reserved_stock}</span>
                    </div>
                    <div>
                      <span className="block text-gray-500">Available</span>
                      <span className="font-semibold">{rec.available_stock}</span>
                    </div>
                  </div>

                  <div className="text-sm">
                    <span className="block font-semibold">Reasoning:</span>
                    <span className="text-gray-700 italic">{rec.calculation_reasoning}</span>
                  </div>
                  
                  {rec.recommended_reorder_quantity === null && (
                    <div className="text-sm text-yellow-700 bg-yellow-50 p-2 rounded flex items-center gap-2">
                      <AlertCircle size={16} /> 
                      Insufficient sales history or stale agricultural evidence to generate a firm recommendation.
                    </div>
                  )}
                </div>

                <div className="w-full md:w-72 bg-gray-50 p-4 rounded-xl border flex flex-col justify-between">
                  {state.status === 'PENDING_CONFIRMATION' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Order Quantity</label>
                        <input 
                          type="number" 
                          value={state.quantity} 
                          onChange={e => updateState(rec.variant_id, { quantity: parseInt(e.target.value) || 0 })}
                          className="mt-1 block w-full rounded border p-2 text-lg font-bold"
                        />
                        {rec.recommended_reorder_quantity !== null && (
                          <span className="text-xs text-gray-500">Recommended: {rec.recommended_reorder_quantity}</span>
                        )}
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Supplier (Optional)</label>
                        <select 
                          value={state.supplierId} 
                          onChange={e => updateState(rec.variant_id, { supplierId: e.target.value })}
                          className="mt-1 block w-full rounded border p-2 text-sm"
                        >
                          <option value="">No specific supplier</option>
                          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>

                      <div className="flex gap-2">
                        <button onClick={() => handleConfirm(rec)} className="flex-1 bg-green-600 text-white py-2 rounded font-medium hover:bg-green-700 text-sm">
                          Confirm PO
                        </button>
                        <button onClick={() => handleIgnore(rec.variant_id)} className="px-4 bg-gray-200 text-gray-700 py-2 rounded font-medium hover:bg-gray-300 text-sm">
                          Ignore
                        </button>
                      </div>
                    </div>
                  )}

                  {state.status === 'PO_CREATED' && (
                    <div className="space-y-4 text-center h-full flex flex-col justify-center">
                      <div className="text-green-600 font-bold flex items-center justify-center gap-2">
                        <Check size={20} /> PO Created
                      </div>
                      <p className="text-xs text-gray-500">PO ID: {state.poId}</p>
                      
                      {state.waUrl ? (
                        <a href={state.waUrl} target="_blank" rel="noopener noreferrer" className="mt-2 w-full flex items-center justify-center gap-2 bg-[#25D366] text-white py-2 rounded font-medium hover:bg-[#128C7E] text-sm">
                          <Send size={16} /> Place Order & Open WhatsApp
                        </a>
                      ) : (
                        <div className="mt-2 text-xs text-yellow-700 bg-yellow-50 p-2 rounded">
                          {state.waError}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
