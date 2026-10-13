'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { AlertCircle, Package, Send, Check, ChevronDown, HelpCircle, Search, Sprout, X } from 'lucide-react';

const CROP_OPTIONS = [
  { value: 'Cotton', label: 'Cotton (పత్తి)', icon: '🌱' },
  { value: 'Paddy', label: 'Paddy / Rice (వరి)', icon: '🌾' },
  { value: 'Chilli', label: 'Chilli (మిరప)', icon: '🌶️' },
  { value: 'Maize', label: 'Maize (మొక్కజొన్న)', icon: '🌽' },
  { value: 'Red Gram', label: 'Red Gram / Pigeon Pea (కంది)', icon: '🌿' },
  { value: 'Bengal Gram', label: 'Bengal Gram / Chickpea (శనగ)', icon: '🌱' },
  { value: 'Groundnut', label: 'Groundnut (వేరుశెనగ)', icon: '🥜' },
  { value: 'Soybean', label: 'Soybean (సోయాబీన్)', icon: '🌱' },
  { value: 'Sugarcane', label: 'Sugarcane (చెరకు)', icon: '🎋' },
  { value: 'Turmeric', label: 'Turmeric (పసుపు)', icon: '🌿' },
  { value: 'Tomato', label: 'Tomato (టమాట)', icon: '🍅' },
  { value: 'Onion', label: 'Onion (ఉల్లి)', icon: '🧅' },
  { value: 'Vegetables', label: 'Vegetables (కూరగాయలు)', icon: '🥬' },
  { value: 'Wheat', label: 'Wheat (గోధుమ)', icon: '🌾' }
];

const POPULAR_CROPS = [
  { value: 'Cotton', label: 'Cotton / పత్తి' },
  { value: 'Paddy', label: 'Paddy / వరి' },
  { value: 'Chilli', label: 'Chilli / మిరప' },
  { value: 'Maize', label: 'Maize / మొక్కజొన్న' },
  { value: 'Groundnut', label: 'Groundnut / వేరుశెనగ' }
];

export default function AgriRecClient({ organizationId }: { organizationId: string }) {
  const supabase = createClient();
  const [stores, setStores] = useState<any[]>([]);
  const [selectedStore, setSelectedStore] = useState('');
  const [region, setRegion] = useState('');
  const [crop, setCrop] = useState('');
  const [isCropDropdownOpen, setIsCropDropdownOpen] = useState(false);
  const cropRef = useRef<HTMLDivElement>(null);
  
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

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (cropRef.current && !cropRef.current.contains(event.target as Node)) {
        setIsCropDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

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
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-6">
        <div className="border-b border-gray-100 pb-4">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Sprout className="w-5 h-5 text-emerald-600" />
            Query Agricultural Recommendations
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Calculate proactive purchase order recommendations for your shop based on seasonal crop conditions and regional pest alerts.
          </p>
        </div>

        <form onSubmit={handleGetRecommendations} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Store Selection */}
            <div>
              <label htmlFor="store-select" className="block text-sm font-semibold text-gray-900">
                Store
              </label>
              <p className="text-xs text-gray-500 mt-0.5">
                Select shop branch for inventory calculation
              </p>
              <select
                id="store-select"
                value={selectedStore}
                onChange={e => setSelectedStore(e.target.value)}
                required
                className="mt-2 block w-full rounded-lg border-gray-300 shadow-sm p-2.5 border text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
              >
                <option value="">Select a store...</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <p className="text-xs text-gray-500 mt-2 flex items-start gap-1">
                <HelpCircle className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                <span>Used to determine current stock, reserved units, and store sales velocity.</span>
              </p>
            </div>

            {/* Region Input */}
            <div>
              <label htmlFor="region-input" className="block text-sm font-semibold text-gray-900">
                Region
              </label>
              <p className="text-xs text-gray-500 mt-0.5">
                Target district or mandal (e.g., Suryapet, Khammam)
              </p>
              <input
                id="region-input"
                type="text"
                value={region}
                onChange={e => setRegion(e.target.value)}
                placeholder="e.g., Suryapet"
                required
                className="mt-2 block w-full rounded-lg border-gray-300 shadow-sm p-2.5 border text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
              <p className="text-xs text-gray-500 mt-2 flex items-start gap-1">
                <HelpCircle className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                <span>Used to find the most relevant local agricultural observations and advisories.</span>
              </p>
            </div>

            {/* Crop Control */}
            <div ref={cropRef} className="relative">
              <label htmlFor="crop-input" className="block text-sm font-semibold text-gray-900">
                Crop
              </label>
              <p className="text-xs text-gray-500 mt-0.5">
                Which crop are farmers currently growing in this region?
              </p>
              
              <div className="relative mt-2">
                <input
                  id="crop-input"
                  type="text"
                  value={crop}
                  onChange={e => {
                    setCrop(e.target.value);
                    setIsCropDropdownOpen(true);
                  }}
                  onFocus={() => setIsCropDropdownOpen(true)}
                  placeholder="Select or search crop (e.g., Cotton)"
                  required
                  autoComplete="off"
                  className="block w-full rounded-lg border-gray-300 shadow-sm p-2.5 pr-16 border text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-2 gap-1">
                  {crop && (
                    <button
                      type="button"
                      onClick={() => setCrop('')}
                      className="text-gray-400 hover:text-gray-600 p-1"
                      aria-label="Clear crop input"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsCropDropdownOpen(prev => !prev)}
                    className="text-gray-400 hover:text-gray-600 p-1"
                    aria-label="Toggle crop dropdown"
                  >
                    <ChevronDown className={`w-4 h-4 transition-transform ${isCropDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                {/* Searchable Dropdown Menu */}
                {isCropDropdownOpen && (
                  <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto divide-y divide-gray-100">
                    {CROP_OPTIONS.filter(c =>
                      c.label.toLowerCase().includes(crop.toLowerCase()) ||
                      c.value.toLowerCase().includes(crop.toLowerCase())
                    ).map(c => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => {
                          setCrop(c.value);
                          setIsCropDropdownOpen(false);
                        }}
                        className="w-full text-left px-3 py-2.5 text-sm hover:bg-emerald-50 hover:text-emerald-900 flex items-center justify-between transition-colors"
                      >
                        <span className="flex items-center gap-2">
                          <span className="text-base">{c.icon}</span>
                          <span className="font-medium text-gray-900">{c.label}</span>
                        </span>
                        {crop.toLowerCase() === c.value.toLowerCase() && (
                          <Check className="w-4 h-4 text-emerald-600" />
                        )}
                      </button>
                    ))}
                    {CROP_OPTIONS.filter(c =>
                      c.label.toLowerCase().includes(crop.toLowerCase()) ||
                      c.value.toLowerCase().includes(crop.toLowerCase())
                    ).length === 0 && (
                      <div className="p-3 text-sm text-gray-500">
                        <p>No standard crop matching &quot;{crop}&quot;.</p>
                        <button
                          type="button"
                          onClick={() => setIsCropDropdownOpen(false)}
                          className="mt-1 text-xs text-emerald-600 font-semibold hover:underline block"
                        >
                          Use &quot;{crop}&quot; as custom crop
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Popular Crop Quick-Pick Chips */}
              <div className="flex flex-wrap items-center gap-1.5 pt-2">
                <span className="text-xs text-gray-400 font-medium">Quick Pick:</span>
                {POPULAR_CROPS.map(p => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => {
                      setCrop(p.value);
                      setIsCropDropdownOpen(false);
                    }}
                    className={`px-2.5 py-0.5 text-xs rounded-full border transition-all ${
                      crop.toLowerCase() === p.value.toLowerCase()
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold shadow-2xs'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Helper text required by Requirement 3 */}
              <p className="text-xs text-gray-500 mt-2 flex items-start gap-1">
                <HelpCircle className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                <span>Used to identify relevant crop-stage conditions and agricultural inputs before calculating the shop's stock recommendation.</span>
              </p>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              * Store, Region, and Crop are required inputs for agricultural resolution.
            </p>
            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
            >
              <Search className="w-4 h-4" />
              {loading ? 'Searching...' : 'Get Recommendations'}
            </button>
          </div>
        </form>
        {error && <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
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
