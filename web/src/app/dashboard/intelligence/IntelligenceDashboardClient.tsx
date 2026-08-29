'use client';

import React, { useState, useMemo } from 'react';
import { 
  AlertCircle, TrendingUp, TrendingDown, Minus, 
  Package, Calendar, HelpCircle, Leaf, Search, ShoppingCart
} from 'lucide-react';
export interface IntelligenceRecord {
  product_id: string;
  product_name: string;
  variant_id: string;
  variant_sku: string;
  item_size: number;
  unit_of_measure: string;
  purchase_packaging_type: string;
  purchase_units_per_pack: number;
  current_stock: number;
  incoming_stock: number;
  avg_daily_sales: number;
  days_of_stock: number;
  supplier_lead_time_days: number;
  classification: string;
  trend_status: string;
  confidence_score: number;
  reorder_point: number;
  safety_stock: number;
  forecast_demand_30d: number;
  recommended_purchase_base_units: number;
  last_calculated_at: string;
  village_signal: string | null;
}

import IntelligenceDetailPanel from '@/components/intelligence/IntelligenceDetailPanel';
import { convertBaseToPackages } from '@/utils/intelligence';

export default function IntelligenceDashboardClient({ initialData, organizationId }: { initialData: IntelligenceRecord[], organizationId: string }) {
  const [activeTab, setActiveTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<IntelligenceRecord | null>(null);

  // Formatting helpers
  const formatINR = (val: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(val || 0);
  const formatNum = (val: number) => Number(val).toLocaleString('en-IN', { maximumFractionDigits: 2 });

  // Formatting product size correctly (e.g., 500 ML, 1 KG)
  const formatSize = (row: IntelligenceRecord) => {
    if (row.unit_of_measure === 'PCS') return 'PCS';
    return `${formatNum(row.item_size)} ${row.unit_of_measure}`;
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 80) return 'bg-green-100 text-green-800';
    if (score >= 50) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  // KPIs
  const kpis = useMemo(() => {
    return {
      restockCount: initialData.filter(d => d.classification === 'BUY_MORE').length,
      watchCount: initialData.filter(d => d.classification === 'WATCH').length,
      deadCount: initialData.filter(d => d.classification === 'DEAD_STOCK').length,
      seasonalCount: initialData.filter(d => d.trend_status === 'SEASONAL').length,
      newCount: initialData.filter(d => d.classification === 'NEW_PRODUCT').length,
    };
  }, [initialData]);

  // Filters
  const filteredData = useMemo(() => {
    let data = initialData;
    if (activeTab !== 'ALL') {
      if (activeTab === 'SEASONAL') data = data.filter(d => d.trend_status === 'SEASONAL');
      else data = data.filter(d => d.classification === activeTab);
    }
    if (search.trim() !== '') {
      const s = search.toLowerCase();
      data = data.filter(d => 
        d.product_name?.toLowerCase().includes(s) || 
        d.variant_sku?.toLowerCase().includes(s)
      );
    }
    return data;
  }, [initialData, activeTab, search]);

  const tabs = ['ALL', 'BUY_MORE', 'NORMAL', 'WATCH', 'SEASONAL', 'DEAD_STOCK', 'NEW_PRODUCT'];

  const getClassificationBadge = (cls: string) => {
    switch(cls) {
      case 'BUY_MORE': return <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-semibold uppercase">🔴 Buy More</span>;
      case 'WATCH': return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs font-semibold uppercase">🟡 Watch</span>;
      case 'DEAD_STOCK': return <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs font-semibold uppercase">⚫ Dead/Slow</span>;
      case 'NEW_PRODUCT': return <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-semibold uppercase">🆕 New</span>;
      case 'NORMAL': return <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-semibold uppercase">🟢 Normal</span>;
      default: return <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs uppercase">{cls}</span>;
    }
  };

  const getTrendIcon = (trend: string) => {
    switch(trend) {
      case 'GROWING': return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'DECLINING': return <TrendingDown className="w-4 h-4 text-red-500" />;
      case 'SPIKE': return <TrendingUp className="w-4 h-4 text-orange-500" />;
      case 'SEASONAL': return <Leaf className="w-4 h-4 text-green-600" />;
      default: return <Minus className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-xl border border-red-100 shadow-sm flex flex-col">
          <span className="text-sm font-medium text-red-600 mb-1 flex items-center gap-1"><AlertCircle className="w-4 h-4"/> Restock</span>
          <span className="text-3xl font-bold text-gray-900">{kpis.restockCount}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-yellow-100 shadow-sm flex flex-col">
          <span className="text-sm font-medium text-yellow-600 mb-1 flex items-center gap-1"><HelpCircle className="w-4 h-4"/> Watch</span>
          <span className="text-3xl font-bold text-gray-900">{kpis.watchCount}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-green-100 shadow-sm flex flex-col">
          <span className="text-sm font-medium text-green-600 mb-1 flex items-center gap-1"><Leaf className="w-4 h-4"/> Seasonal</span>
          <span className="text-3xl font-bold text-gray-900">{kpis.seasonalCount}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col">
          <span className="text-sm font-medium text-gray-600 mb-1 flex items-center gap-1"><Package className="w-4 h-4"/> Dead Stock</span>
          <span className="text-3xl font-bold text-gray-900">{kpis.deadCount}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-blue-100 shadow-sm flex flex-col">
          <span className="text-sm font-medium text-blue-600 mb-1 flex items-center gap-1"><Calendar className="w-4 h-4"/> New</span>
          <span className="text-3xl font-bold text-gray-900">{kpis.newCount}</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <div className="flex flex-wrap gap-2">
          {tabs.map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${activeTab === tab ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              {tab.replace('_', ' ')}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search products..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500 font-semibold">
                <th className="p-4">Product</th>
                <th className="p-4 text-right">Current</th>
                <th className="p-4 text-right">Incoming</th>
                <th className="p-4 text-right">ADS</th>
                <th className="p-4 text-right">Stock Days</th>
                <th className="p-4 text-center">Trend</th>
                <th className="p-4 text-center">Confidence</th>
                <th className="p-4">Classification</th>
                <th className="p-4 text-right">Purchase Recommendation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-gray-500">
                    No intelligence data matches your filters.
                  </td>
                </tr>
              ) : filteredData.map((row) => {
                const isBuyMore = row.classification === 'BUY_MORE';
                const { physicalItems, purchasePackages } = convertBaseToPackages(
                  row.recommended_purchase_base_units, 
                  row.item_size, 
                  row.purchase_units_per_pack
                );

                return (
                  <tr 
                    key={row.variant_id} 
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => setSelectedProduct(row)}
                  >
                    <td className="p-4">
                      <div className="font-medium text-gray-900">{row.product_name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{formatSize(row)} • {row.variant_sku}</div>
                    </td>
                    <td className="p-4 text-right font-medium text-gray-700">
                      {formatNum(row.current_stock)}
                    </td>
                    <td className="p-4 text-right text-gray-600">
                      {row.incoming_stock > 0 ? (
                        <span className="text-blue-600 font-medium">+{formatNum(row.incoming_stock)}</span>
                      ) : '-'}
                    </td>
                    <td className="p-4 text-right text-gray-700">
                      {formatNum(row.avg_daily_sales)}
                    </td>
                    <td className="p-4 text-right">
                      <span className={`font-medium ${row.days_of_stock < 10 ? 'text-red-600' : 'text-gray-700'}`}>
                        {formatNum(row.days_of_stock)}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-1.5">
                        {getTrendIcon(row.trend_status)}
                        <span className="text-xs text-gray-600">{row.trend_status}</span>
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${getConfidenceColor(row.confidence_score)}`}>
                        {formatNum(row.confidence_score)}%
                      </span>
                    </td>
                    <td className="p-4">
                      {getClassificationBadge(row.classification)}
                    </td>
                    <td className="p-4 text-right">
                      {isBuyMore && row.recommended_purchase_base_units > 0 ? (
                        <div className="flex flex-col items-end">
                          <span className="font-bold text-red-600 flex items-center gap-1">
                            <ShoppingCart className="w-4 h-4"/> 
                            {formatNum(purchasePackages)} {row.purchase_packaging_type || 'UNIT'}S
                          </span>
                          <span className="text-xs text-gray-500">
                            ({formatNum(physicalItems)} physical)
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedProduct && (
        <IntelligenceDetailPanel 
          product={selectedProduct} 
          onClose={() => setSelectedProduct(null)} 
        />
      )}
    </div>
  );
}
