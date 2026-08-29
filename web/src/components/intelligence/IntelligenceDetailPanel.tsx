'use client';

import React, { useState } from 'react';
import { X, Bot, AlertTriangle, CheckCircle, Leaf, MapPin, Package, Clock, ShieldAlert } from 'lucide-react';
import { convertBaseToPackages } from '@/utils/intelligence';
import type { IntelligenceRecord } from '@/app/dashboard/intelligence/IntelligenceDashboardClient';

export default function IntelligenceDetailPanel({ product, onClose }: { product: IntelligenceRecord, onClose: () => void }) {
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const formatNum = (val: number) => Number(val || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  
  const { physicalItems, purchasePackages } = convertBaseToPackages(
    product.recommended_purchase_base_units, 
    product.item_size, 
    product.purchase_units_per_pack
  );

  const handleExplain = async () => {
    setLoadingAi(true);
    setAiError(null);
    try {
      const facts = {
        product: product.product_name,
        current_stock: product.current_stock,
        incoming_stock: product.incoming_stock,
        avg_daily_sales: product.avg_daily_sales,
        days_of_stock: product.days_of_stock,
        supplier_lead_time_days: product.supplier_lead_time_days,
        safety_stock: product.safety_stock,
        reorder_point: product.reorder_point,
        forecast_demand_30d: product.forecast_demand_30d,
        recommended_purchase_base_units: product.recommended_purchase_base_units,
        recommended_physical_items: physicalItems,
        recommended_packages: purchasePackages,
        trend: product.trend_status,
        confidence: product.confidence_score,
        classification: product.classification,
        seasonality: product.trend_status === 'SEASONAL' ? 'Yes' : 'No',
        village_signal: product.village_signal
      };

      const res = await fetch('/api/intelligence/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facts })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to explain');
      
      setAiExplanation(data.explanation);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setAiError(err.message);
      } else {
        setAiError('An unknown error occurred');
      }
    } finally {
      setLoadingAi(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-gray-50 h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
        
        <div className="flex justify-between items-center px-6 py-4 bg-white border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{product.product_name}</h2>
            <p className="text-sm text-gray-500">{product.variant_sku} • Last calculated: {new Date(product.last_calculated_at).toLocaleString()}</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Action Header */}
          {product.classification === 'BUY_MORE' && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6">
              <h3 className="text-red-800 font-bold text-lg mb-2 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                ACTION REQUIRED: RESTOCK
              </h3>
              <p className="text-red-700 text-sm mb-4">
                This product has fallen below its safety reorder point. Purchasing is recommended.
              </p>
              <div className="bg-white rounded-lg border border-red-100 p-4 flex flex-col sm:flex-row justify-between items-center">
                <div>
                  <div className="text-sm text-gray-500">Recommended Purchase</div>
                  <div className="text-2xl font-black text-gray-900">
                    {formatNum(purchasePackages)} {product.purchase_packaging_type || 'UNIT'}S
                  </div>
                </div>
                <div className="text-right mt-2 sm:mt-0">
                  <div className="text-sm text-gray-500">Underlying Base Recommendation</div>
                  <div className="font-semibold text-gray-700">{formatNum(product.recommended_purchase_base_units)} {product.unit_of_measure}</div>
                  <div className="text-xs text-gray-400">Converted to {formatNum(physicalItems)} physical items</div>
                </div>
              </div>
            </div>
          )}

          {product.classification === 'NEW_PRODUCT' && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
              <h3 className="text-blue-800 font-bold text-lg mb-2 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5" />
                NEW PRODUCT / INSUFFICIENT DATA
              </h3>
              <p className="text-blue-700 text-sm">
                There is not enough historical data (less than 14 active days) to make a confident purchasing recommendation. Ensure you have manual oversight.
              </p>
            </div>
          )}

          {product.classification === 'DEAD_STOCK' && (
            <div className="bg-gray-100 border border-gray-300 rounded-xl p-6">
              <h3 className="text-gray-800 font-bold text-lg mb-2 flex items-center gap-2">
                <Package className="w-5 h-5" />
                DEAD / SLOW STOCK
              </h3>
              <p className="text-gray-600 text-sm">
                This product is moving extremely slowly. Purchasing more may not be advisable. Focus on clearing existing inventory.
              </p>
            </div>
          )}

          {/* AI Explainer */}
          <div className="bg-white border border-indigo-100 shadow-sm rounded-xl overflow-hidden">
            <div className="bg-indigo-50 px-6 py-4 border-b border-indigo-100 flex justify-between items-center">
              <h3 className="font-bold text-indigo-900 flex items-center gap-2">
                <Bot className="w-5 h-5" />
                Why this recommendation?
              </h3>
              {!aiExplanation && !loadingAi && (
                <button 
                  onClick={handleExplain}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
                >
                  Generate AI Explanation
                </button>
              )}
            </div>
            <div className="p-6">
              {loadingAi && <div className="text-indigo-600 text-sm animate-pulse flex items-center gap-2">Analyzing deterministic facts...</div>}
              {aiError && (
                <div className="text-sm text-red-600 bg-red-50 p-4 rounded-lg flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <strong>AI Explainer Unavailable:</strong> {aiError}
                    <p className="mt-1 text-xs text-red-500">The dashboard and recommendations continue to function normally based on the deterministic engine.</p>
                  </div>
                </div>
              )}
              {aiExplanation && (
                <div className="text-gray-800 text-sm leading-relaxed whitespace-pre-wrap">
                  {aiExplanation}
                </div>
              )}
              {!aiExplanation && !loadingAi && !aiError && (
                <div className="text-sm text-gray-500 italic">
                  Click the button above to generate a plain-text explanation of the deterministic facts underlying this recommendation.
                </div>
              )}
            </div>
          </div>

          {/* Signals */}
          {(product.trend_status === 'SEASONAL' || product.village_signal) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {product.trend_status === 'SEASONAL' && (
                <div className="bg-green-50 border border-green-200 p-4 rounded-xl">
                  <h4 className="text-green-800 font-bold text-sm mb-1 flex items-center gap-1.5"><Leaf className="w-4 h-4"/> Seasonal Demand</h4>
                  <p className="text-green-700 text-xs">Demand for this product is historically higher during this period. The forecast has been adjusted upwards.</p>
                </div>
              )}
              {product.village_signal && (
                <div className="bg-purple-50 border border-purple-200 p-4 rounded-xl">
                  <h4 className="text-purple-800 font-bold text-sm mb-1 flex items-center gap-1.5"><MapPin className="w-4 h-4"/> Village Demand Signal</h4>
                  <p className="text-purple-700 text-xs font-semibold mb-1">{JSON.parse(product.village_signal || '{}').village_name}</p>
                  <p className="text-purple-600 text-xs">Recent sales are concentrated in this village. This is supporting context and does not alter the mathematical recommendation.</p>
                </div>
              )}
            </div>
          )}

          {/* Deterministic Facts */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="font-bold text-gray-900">Deterministic Engine Facts</h3>
              <p className="text-xs text-gray-500 mt-1">Direct from the Stage 1 intelligence cache. These values drive the AI explanation.</p>
            </div>
            <div className="p-0">
              <table className="w-full text-left text-sm">
                <tbody className="divide-y divide-gray-100">
                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-gray-500">Current Stock</td>
                    <td className="px-6 py-3 font-medium text-gray-900 text-right">{formatNum(product.current_stock)}</td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-gray-500">Incoming Stock</td>
                    <td className="px-6 py-3 font-medium text-gray-900 text-right">{formatNum(product.incoming_stock)}</td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-gray-500">Average Daily Sales (ADS)</td>
                    <td className="px-6 py-3 font-medium text-gray-900 text-right">{formatNum(product.avg_daily_sales)} / day</td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-gray-500">Days of Stock</td>
                    <td className="px-6 py-3 font-medium text-gray-900 text-right">{formatNum(product.days_of_stock)} days</td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-gray-500 flex items-center gap-1">
                      Supplier Lead Time
                      {product.confidence_score < 80 && <span className="text-yellow-600 text-xs ml-1">(Assumed)</span>}
                    </td>
                    <td className="px-6 py-3 font-medium text-gray-900 text-right">{product.supplier_lead_time_days} days</td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-gray-500">Safety Stock</td>
                    <td className="px-6 py-3 font-medium text-gray-900 text-right">{formatNum(product.safety_stock)} {product.unit_of_measure}</td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-gray-500">Reorder Point</td>
                    <td className="px-6 py-3 font-medium text-gray-900 text-right">{formatNum(product.reorder_point)} {product.unit_of_measure}</td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-gray-500">Forecast Demand (30d)</td>
                    <td className="px-6 py-3 font-medium text-gray-900 text-right">{formatNum(product.forecast_demand_30d)} {product.unit_of_measure}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
