'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { 
  AlertCircle, Package, Send, Check, CheckCircle2, ChevronDown, 
  HelpCircle, Info, Loader2, Search, Sprout, X, ArrowRight 
} from 'lucide-react';

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

interface AgriNeedRow {
  observation_id?: string;
  crop_name?: string;
  crop_stage?: string;
  input_category: string;
  problem_name?: string;
  urgency?: string;
  matched_products?: Array<{
    product_id: string;
    variant_id: string;
    product_name: string;
    sku: string;
    current_stock: number;
    available_stock: number;
  }>;
}

interface EmptyResultDiagnosis {
  category: 'NO_OBSERVATIONS' | 'NO_MATCHING_PRODUCTS' | 'SUFFICIENT_STOCK';
  title: string;
  description: string;
  inputDetails?: string[];
  actionLink?: { href: string; label: string };
}

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
  const [hasSearched, setHasSearched] = useState(false);
  const [emptyDiagnosis, setEmptyDiagnosis] = useState<EmptyResultDiagnosis | null>(null);
  const [searchedParams, setSearchedParams] = useState<{ storeName: string; region: string; crop: string } | null>(null);

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
    if (loading) return;
    if (!selectedStore || !region.trim() || !crop.trim()) {
      setError('Please fill in all required fields (Store, Region, and Crop).');
      return;
    }

    const storeObj = stores.find(s => s.id === selectedStore);
    const storeName = storeObj?.name || 'Selected Store';

    setLoading(true);
    setError(null);
    setRecommendations([]);
    setEmptyDiagnosis(null);
    setHasSearched(false);
    setSearchedParams({ storeName, region: region.trim(), crop: crop.trim() });

    try {
      const { data, error: rpcErr } = await supabase.rpc('calculate_stock_recommendations', {
        p_organization_id: organizationId,
        p_store_id: selectedStore,
        p_region: region.trim(),
        p_crop_name: crop.trim()
      });

      if (rpcErr) {
        setError(rpcErr.message || 'Failed to calculate stock recommendations.');
        setHasSearched(true);
        setLoading(false);
        return;
      }

      const recs = data || [];
      if (recs.length > 0) {
        setRecommendations(recs);
        // Initialize action states
        const initialStates: any = {};
        recs.forEach((r: any) => {
          initialStates[r.variant_id] = {
            quantity: r.recommended_reorder_quantity || 0,
            supplierId: '',
            status: 'PENDING_CONFIRMATION',
            idempotencyKey: `req_${Date.now()}_${r.variant_id}`
          };
        });
        setActionStates(initialStates);
      } else {
        // Zero recommendations returned - diagnose underlying reason to give helpful feedback
        const { data: agriNeeds, error: needsErr } = await supabase.rpc('resolve_agri_input_needs', {
          p_organization_id: organizationId,
          p_region: region.trim(),
          p_crop_name: crop.trim()
        });

        if (needsErr) {
          setEmptyDiagnosis({
            category: 'NO_OBSERVATIONS',
            title: `No Recommendations Available for ${crop} in ${region}`,
            description: 'No active recommendations could be generated for this query at this time.'
          });
        } else if (!agriNeeds || agriNeeds.length === 0) {
          // Case A: No agricultural observations found in this region
          setEmptyDiagnosis({
            category: 'NO_OBSERVATIONS',
            title: `No Agricultural Observations Found for ${crop} in ${region}`,
            description: `There are currently no active field observations or advisory notices recorded for ${crop} in ${region} (or at state level). Stock recommendations will appear automatically once agricultural observations (crop stages, pest alerts, or disease advisories) are recorded.`
          });
        } else {
          // agriNeeds returned items! Check if shop catalog has matching products
          const typedNeeds = agriNeeds as unknown as AgriNeedRow[];
          const hasMatchedProducts = typedNeeds.some((n: AgriNeedRow) => n.matched_products && n.matched_products.length > 0);
          if (!hasMatchedProducts) {
            // Case B: Agricultural inputs identified, but shop catalog has no matching products
            const neededInputs = typedNeeds.map((n: AgriNeedRow) => 
              `${n.input_category} (${n.crop_stage || 'General'} stage, Urgency: ${n.urgency || 'MEDIUM'})`
            );
            setEmptyDiagnosis({
              category: 'NO_MATCHING_PRODUCTS',
              title: `Agricultural Demand Identified, but No Matching Products in Catalog`,
              description: `Field observations for ${crop} in ${region} indicate demand for the inputs listed below. However, your store catalog currently has no products tagged with this Agricultural Use.`,
              inputDetails: neededInputs,
              actionLink: {
                href: '/dashboard/products',
                label: 'Go to Products to Assign Agricultural Use →'
              }
            });
          } else {
            // Case C/D: Products exist, but current stock covers demand or 0 sales velocity
            setEmptyDiagnosis({
              category: 'SUFFICIENT_STOCK',
              title: `No Reorder Needed for ${crop} in ${region}`,
              description: `Products matching current agricultural conditions were found in your catalog, but no reorder is needed because current available stock already covers forecast demand, or recent sales velocity is zero.`
            });
          }
        }
      }
      setHasSearched(true);
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred while fetching recommendations.');
      setHasSearched(true);
    } finally {
      setLoading(false);
    }
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
        unit_price: 0
      }]
    });

    if (poErr) {
      alert('Failed to create PO: ' + poErr.message);
      return;
    }

    let waUrl = '';
    let waError = '';
    
    if (state.supplierId) {
      const supplier = suppliers.find(s => s.id === state.supplierId);
      if (supplier && supplier.phone) {
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
      {/* Query Form Card */}
      <div className="bg-white p-6 sm:p-7 rounded-2xl shadow-sm border border-gray-200 space-y-6">
        <div className="border-b border-gray-100 pb-4">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Sprout className="w-5 h-5 text-emerald-600 shrink-0" />
            Query Agricultural Recommendations
          </h2>
          <p className="text-sm text-slate-700 mt-1 font-medium">
            Calculate proactive purchase order recommendations for your shop based on seasonal crop conditions and regional pest alerts.
          </p>
        </div>

        <form onSubmit={handleGetRecommendations} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Store Selection */}
            <div>
              <label htmlFor="store-select" className="block text-sm font-semibold text-slate-900">
                Store
              </label>
              <p className="text-xs text-slate-700 mt-0.5 font-medium">
                Select shop branch for inventory calculation
              </p>
              <select
                id="store-select"
                value={selectedStore}
                onChange={e => setSelectedStore(e.target.value)}
                disabled={loading}
                required
                className="mt-2 block w-full rounded-lg border-gray-300 shadow-sm p-2.5 border text-sm font-medium text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                <option value="">Select a store...</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <p className="text-xs text-slate-700 mt-2 flex items-start gap-1 leading-relaxed">
                <HelpCircle className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                <span>Used to determine current stock, reserved units, and store sales velocity.</span>
              </p>
            </div>

            {/* Region Input */}
            <div>
              <label htmlFor="region-input" className="block text-sm font-semibold text-slate-900">
                Region
              </label>
              <p className="text-xs text-slate-700 mt-0.5 font-medium">
                Target district or mandal (e.g., Suryapet, Khammam)
              </p>
              <input
                id="region-input"
                type="text"
                value={region}
                onChange={e => setRegion(e.target.value)}
                disabled={loading}
                placeholder="e.g., Suryapet"
                required
                className="mt-2 block w-full rounded-lg border-gray-300 shadow-sm p-2.5 border text-sm font-medium text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
              <p className="text-xs text-slate-700 mt-2 flex items-start gap-1 leading-relaxed">
                <HelpCircle className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                <span>Used to find the most relevant local agricultural observations and advisories.</span>
              </p>
            </div>

            {/* Crop Control */}
            <div ref={cropRef} className="relative">
              <label htmlFor="crop-input" className="block text-sm font-semibold text-slate-900">
                Crop
              </label>
              <p className="text-xs text-slate-700 mt-0.5 font-medium">
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
                  disabled={loading}
                  placeholder="Select or search crop (e.g., Cotton)"
                  required
                  autoComplete="off"
                  className="block w-full rounded-lg border-gray-300 shadow-sm p-2.5 pr-16 border text-sm font-medium text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-2 gap-1">
                  {crop && !loading && (
                    <button
                      type="button"
                      onClick={() => setCrop('')}
                      className="text-slate-500 hover:text-slate-800 p-1"
                      aria-label="Clear crop input"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsCropDropdownOpen(prev => !prev)}
                    disabled={loading}
                    className="text-slate-500 hover:text-slate-800 p-1 disabled:opacity-50"
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
                          <span className="font-semibold text-slate-900">{c.label}</span>
                        </span>
                        {crop.toLowerCase() === c.value.toLowerCase() && (
                          <Check className="w-4 h-4 text-emerald-600 font-bold" />
                        )}
                      </button>
                    ))}
                    {CROP_OPTIONS.filter(c =>
                      c.label.toLowerCase().includes(crop.toLowerCase()) ||
                      c.value.toLowerCase().includes(crop.toLowerCase())
                    ).length === 0 && (
                      <div className="p-3 text-sm text-slate-700">
                        <p>No standard preset matching &quot;{crop}&quot;.</p>
                        <button
                          type="button"
                          onClick={() => setIsCropDropdownOpen(false)}
                          className="mt-1 text-xs text-emerald-700 font-bold hover:underline block"
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
                <span className="text-xs text-slate-700 font-semibold">Quick Pick:</span>
                {POPULAR_CROPS.map(p => (
                  <button
                    key={p.value}
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      setCrop(p.value);
                      setIsCropDropdownOpen(false);
                    }}
                    className={`px-2.5 py-1 text-xs rounded-full border transition-all ${
                      crop.toLowerCase() === p.value.toLowerCase()
                        ? 'bg-emerald-100 text-emerald-900 border-emerald-400 font-bold shadow-xs'
                        : 'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Helper text required by Requirement 3 */}
              <p className="text-xs text-slate-700 mt-2 flex items-start gap-1 leading-relaxed">
                <HelpCircle className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                <span>Used to identify relevant crop-stage conditions and agricultural inputs before calculating the shop's stock recommendation.</span>
              </p>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-slate-700 font-medium">
              * Store, Region, and Crop are required inputs for agricultural resolution.
            </p>
            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Getting Recommendations...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>Get Recommendations</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* ERROR STATE */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 shadow-sm">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-red-900">Failed to Calculate Recommendations</h4>
            <p className="text-sm text-red-800 font-medium">{error}</p>
          </div>
        </div>
      )}

      {/* LOADING STATE CARD */}
      {loading && (
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-emerald-100 flex flex-col items-center justify-center text-center space-y-3">
          <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
          <h3 className="text-base font-bold text-slate-900">
            Analyzing Agricultural Intelligence...
          </h3>
          <p className="text-sm text-slate-700 max-w-md font-medium">
            Querying local field observations, checking crop-stage input requirements, and calculating store stock depletion...
          </p>
        </div>
      )}

      {/* EMPTY RESULT STATE WITH CATEGORIZED DIAGNOSIS */}
      {!loading && hasSearched && recommendations.length === 0 && !error && emptyDiagnosis && (
        <div className={`p-6 rounded-2xl border shadow-sm ${
          emptyDiagnosis.category === 'NO_MATCHING_PRODUCTS'
            ? 'bg-blue-50/60 border-blue-200'
            : emptyDiagnosis.category === 'SUFFICIENT_STOCK'
            ? 'bg-emerald-50/50 border-emerald-200'
            : 'bg-amber-50/60 border-amber-200'
        }`}>
          <div className="flex items-start gap-4">
            <div className={`p-2.5 rounded-xl shrink-0 ${
              emptyDiagnosis.category === 'NO_MATCHING_PRODUCTS'
                ? 'bg-blue-100 text-blue-700'
                : emptyDiagnosis.category === 'SUFFICIENT_STOCK'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-amber-100 text-amber-700'
            }`}>
              {emptyDiagnosis.category === 'NO_MATCHING_PRODUCTS' ? (
                <Package className="w-6 h-6" />
              ) : emptyDiagnosis.category === 'SUFFICIENT_STOCK' ? (
                <CheckCircle2 className="w-6 h-6" />
              ) : (
                <AlertCircle className="w-6 h-6" />
              )}
            </div>

            <div className="space-y-3 flex-1">
              <div>
                <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider mb-1 ${
                  emptyDiagnosis.category === 'NO_MATCHING_PRODUCTS'
                    ? 'bg-blue-200/80 text-blue-900'
                    : emptyDiagnosis.category === 'SUFFICIENT_STOCK'
                    ? 'bg-emerald-200/80 text-emerald-900'
                    : 'bg-amber-200/80 text-amber-900'
                }`}>
                  {emptyDiagnosis.category === 'NO_MATCHING_PRODUCTS'
                    ? 'Catalog Gap Identified'
                    : emptyDiagnosis.category === 'SUFFICIENT_STOCK'
                    ? 'Stock Sufficient'
                    : 'No Observations'}
                </span>
                <h3 className="text-lg font-bold text-slate-900">
                  {emptyDiagnosis.title}
                </h3>
              </div>

              <p className="text-sm text-slate-800 leading-relaxed font-medium">
                {emptyDiagnosis.description}
              </p>

              {/* If specific inputs were identified, list them clearly */}
              {emptyDiagnosis.inputDetails && emptyDiagnosis.inputDetails.length > 0 && (
                <div className="bg-white/80 border border-blue-200 rounded-xl p-3.5 space-y-1.5">
                  <span className="text-xs font-bold text-slate-900 block">
                    Target Inputs Identified from Field Observations:
                  </span>
                  <ul className="list-disc list-inside text-xs text-slate-800 space-y-1 font-medium">
                    {emptyDiagnosis.inputDetails.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Action link if applicable */}
              {emptyDiagnosis.actionLink && (
                <div className="pt-1">
                  <Link
                    href={emptyDiagnosis.actionLink.href}
                    className="inline-flex items-center gap-1.5 text-sm font-bold text-blue-700 hover:text-blue-900 hover:underline"
                  >
                    <span>{emptyDiagnosis.actionLink.label}</span>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* RECOMMENDATIONS RESULTS LIST */}
      {!loading && recommendations.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900">Actionable Stock Recommendations</h2>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              {recommendations.length} {recommendations.length === 1 ? 'Recommendation' : 'Recommendations'} Found
            </span>
          </div>

          {recommendations.map(rec => {
            const state = actionStates[rec.variant_id];
            if (!state) return null;
            if (state.status === 'IGNORED') return null;

            return (
              <div key={rec.variant_id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-col md:flex-row gap-6">
                <div className="flex-1 space-y-3">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">{rec.product_name} <span className="text-sm font-normal text-slate-600">({rec.sku})</span></h3>
                    <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 inline-block px-2.5 py-1 rounded-md font-semibold mt-1">
                      Agri Relevance: {rec.input_category} | {rec.crop_stage} | {rec.progress_status}
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm bg-slate-50 border border-slate-200 p-3 rounded-xl">
                    <div>
                      <span className="block text-slate-700 font-medium">Recent Sales (30d)</span>
                      <span className="font-bold text-slate-900 text-base">{rec.recent_sales_30d}</span>
                    </div>
                    <div>
                      <span className="block text-slate-700 font-medium">Current Stock</span>
                      <span className="font-bold text-slate-900 text-base">{rec.current_stock}</span>
                    </div>
                    <div>
                      <span className="block text-slate-700 font-medium">Reserved</span>
                      <span className="font-bold text-slate-900 text-base">{rec.reserved_stock}</span>
                    </div>
                    <div>
                      <span className="block text-slate-700 font-medium">Available</span>
                      <span className="font-bold text-slate-900 text-base">{rec.available_stock}</span>
                    </div>
                  </div>

                  <div className="text-sm">
                    <span className="block font-bold text-slate-900">Reasoning:</span>
                    <span className="text-slate-800 italic">{rec.calculation_reasoning}</span>
                  </div>
                  
                  {rec.recommended_reorder_quantity === null && (
                    <div className="text-sm text-amber-900 bg-amber-50 border border-amber-200 p-2.5 rounded-lg flex items-center gap-2 font-medium">
                      <AlertCircle size={16} className="text-amber-700 shrink-0" /> 
                      Insufficient sales history or stale agricultural evidence to generate a firm recommendation.
                    </div>
                  )}
                </div>

                <div className="w-full md:w-72 bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between">
                  {state.status === 'PENDING_CONFIRMATION' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-bold text-slate-900">Order Quantity</label>
                        <input 
                          type="number" 
                          value={state.quantity} 
                          onChange={e => updateState(rec.variant_id, { quantity: parseInt(e.target.value) || 0 })}
                          className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm p-2 text-lg font-bold text-slate-900 border"
                        />
                        {rec.recommended_reorder_quantity !== null && (
                          <span className="text-xs text-slate-700 font-medium">Recommended: {rec.recommended_reorder_quantity}</span>
                        )}
                      </div>
                      
                      <div>
                        <label className="block text-sm font-bold text-slate-900">Supplier (Optional)</label>
                        <select 
                          value={state.supplierId} 
                          onChange={e => updateState(rec.variant_id, { supplierId: e.target.value })}
                          className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm p-2 text-sm text-slate-900 border bg-white"
                        >
                          <option value="">No specific supplier</option>
                          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>

                      <div className="flex gap-2">
                        <button onClick={() => handleConfirm(rec)} className="flex-1 bg-emerald-600 text-white py-2 rounded-lg font-semibold hover:bg-emerald-700 text-sm shadow-sm transition-colors">
                          Confirm PO
                        </button>
                        <button onClick={() => handleIgnore(rec.variant_id)} className="px-4 bg-slate-200 text-slate-800 py-2 rounded-lg font-semibold hover:bg-slate-300 text-sm transition-colors">
                          Ignore
                        </button>
                      </div>
                    </div>
                  )}

                  {state.status === 'PO_CREATED' && (
                    <div className="space-y-4 text-center h-full flex flex-col justify-center">
                      <div className="text-emerald-700 font-bold flex items-center justify-center gap-2">
                        <Check size={20} /> PO Created
                      </div>
                      <p className="text-xs text-slate-700 font-medium">PO ID: {state.poId}</p>
                      
                      {state.waUrl ? (
                        <a href={state.waUrl} target="_blank" rel="noopener noreferrer" className="mt-2 w-full flex items-center justify-center gap-2 bg-[#25D366] text-white py-2 rounded-lg font-semibold hover:bg-[#128C7E] text-sm shadow-sm">
                          <Send size={16} /> Place Order & Open WhatsApp
                        </a>
                      ) : (
                        <div className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 p-2 rounded-lg font-medium">
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
