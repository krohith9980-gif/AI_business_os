'use client'

import React from 'react'
import { FinancialMetrics } from '../dashboard.types'
import {
  TrendingUp,
  Percent,
  Package,
  Users,
  Truck,
  Landmark,
  Coins,
  Lock,
  Info,
  Scale
} from 'lucide-react'

interface FinancialOverviewCardsProps {
  metrics: FinancialMetrics
  comparisonLabel?: string
  periodDisplayLabel?: string
}

export default function FinancialOverviewCards({
  metrics,
  comparisonLabel,
  periodDisplayLabel
}: FinancialOverviewCardsProps) {
  const formatCurrency = (val: number | null) => {
    if (val === null || val === undefined) return null
    return `₹${val.toLocaleString('en-IN')}`
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2">
            <span>Financial Health (ఆర్థిక నివేదిక)</span>
          </h2>
          {periodDisplayLabel && (
            <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded">
              {periodDisplayLabel}
            </span>
          )}
          {comparisonLabel && (
            <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
              {comparisonLabel}
            </span>
          )}
        </div>
        <span className="text-xs text-gray-400">
          *GST collected is statutory and strictly excluded from business profit
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Net Sales Revenue */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5 hover:border-emerald-300 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-gray-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">
                Net Product Revenue
              </span>
              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-gray-900">
              ₹{metrics.totalSales.toLocaleString('en-IN')}
            </div>
            <div className="text-xs font-medium text-emerald-700 mt-0.5">
              నికర అమ్మకాలు (పన్ను రహితం)
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-gray-100 text-[11px] text-gray-500 flex justify-between items-center">
            <span>GST Collected (Separate):</span>
            <span className="font-semibold text-gray-700">₹{metrics.totalTaxCollected.toLocaleString('en-IN')}</span>
          </div>
        </div>

        {/* Card 2: Gross Profit & Margin */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5 hover:border-teal-300 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-gray-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">
                Gross Profit & Margin
              </span>
              <div className="p-2 rounded-lg bg-teal-50 text-teal-700">
                <Percent className="w-4 h-4" />
              </div>
            </div>
            {metrics.grossProfit !== null ? (
              <>
                <div className="text-2xl font-black text-teal-800">
                  {formatCurrency(metrics.grossProfit)}
                </div>
                <div className="text-xs font-semibold text-teal-600 mt-0.5 flex items-center gap-1.5">
                  <span>స్థూల లాభం</span>
                  <span className="bg-teal-100 text-teal-800 px-1.5 py-0.2 rounded text-[10px]">
                    {metrics.grossProfitMargin !== null ? `${metrics.grossProfitMargin.toFixed(1)}% margin` : ''}
                  </span>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 text-gray-400 py-1">
                <Lock className="w-4 h-4" />
                <span className="text-sm font-medium">Owner confidential</span>
              </div>
            )}
          </div>
          <div className="mt-3 pt-2.5 border-t border-gray-100 text-[11px] text-gray-500">
            Calculated as: Net Revenue minus Historical COGS
          </div>
        </div>

        {/* Card 3: Stock Value at Cost */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5 hover:border-blue-300 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-gray-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">
                Stock Value (at Cost)
              </span>
              <div className="p-2 rounded-lg bg-blue-50 text-blue-700">
                <Package className="w-4 h-4" />
              </div>
            </div>
            {metrics.currentStockValue !== null ? (
              <>
                <div className="text-2xl font-black text-blue-900">
                  {formatCurrency(metrics.currentStockValue)}
                </div>
                <div className="text-xs font-medium text-blue-700 mt-0.5">
                  సరుకు నిల్వల విలువ (కొనుగోలు ధర)
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 text-gray-400 py-1">
                <Lock className="w-4 h-4" />
                <span className="text-sm font-medium">Restricted view</span>
              </div>
            )}
          </div>
          <div className="mt-3 pt-2.5 border-t border-gray-100 text-[11px] text-gray-500">
            {metrics.uncostedBatchCount > 0 ? (
              <span className="text-amber-600 font-medium">
                *Excludes {metrics.uncostedBatchCount} uncosted batches (unavailable)
              </span>
            ) : (
              <span>Verified 1-to-1 batch valuation</span>
            )}
          </div>
        </div>

        {/* Card 4: Customer Receivables */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5 hover:border-amber-300 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-gray-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">
                Customer Receivables
              </span>
              <div className="p-2 rounded-lg bg-amber-50 text-amber-700">
                <Users className="w-4 h-4" />
              </div>
            </div>
            {metrics.customerOutstanding !== null ? (
              <>
                <div className="text-2xl font-black text-amber-900">
                  {formatCurrency(metrics.customerOutstanding)}
                </div>
                <div className="text-xs font-medium text-amber-700 mt-0.5">
                  రైతుల నుంచి రావలసిన బాకీలు
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 text-gray-400 py-1">
                <Lock className="w-4 h-4" />
                <span className="text-sm font-medium">Restricted view</span>
              </div>
            )}
          </div>
          <div className="mt-3 pt-2.5 border-t border-gray-100 text-[11px] text-gray-500">
            Authoritative outstanding customer balance
          </div>
        </div>

        {/* Card 5: Supplier Payables */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5 hover:border-rose-300 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-gray-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">
                Supplier Payables
              </span>
              <div className="p-2 rounded-lg bg-rose-50 text-rose-700">
                <Truck className="w-4 h-4" />
              </div>
            </div>
            {metrics.supplierOutstanding !== null ? (
              <>
                <div className="text-2xl font-black text-rose-900">
                  {formatCurrency(metrics.supplierOutstanding)}
                </div>
                <div className="text-xs font-medium text-rose-700 mt-0.5">
                  సరఫరాదారులకు చెల్లించవలసిన బాకీలు
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 text-gray-400 py-1">
                <Lock className="w-4 h-4" />
                <span className="text-sm font-medium">Owner confidential</span>
              </div>
            )}
          </div>
          <div className="mt-3 pt-2.5 border-t border-gray-100 text-[11px] text-gray-500">
            Owed to fertilizer & seed manufacturers
          </div>
        </div>

        {/* Card 6: Net Business Profit */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5 hover:border-purple-300 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-gray-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">
                Net Profit
              </span>
              <div className="p-2 rounded-lg bg-purple-50 text-purple-700">
                <Scale className="w-4 h-4" />
              </div>
            </div>
            {metrics.netProfit !== null ? (
              <>
                <div className="text-2xl font-black text-purple-900">
                  {formatCurrency(metrics.netProfit)}
                </div>
                <div className="text-xs font-medium text-purple-700 mt-0.5 flex items-center gap-1">
                  <span>నికర లాభం (ఆపరేటింగ్ ఖర్చులు రికార్డు కాలేదు)</span>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 text-gray-400 py-1">
                <Lock className="w-4 h-4" />
                <span className="text-sm font-medium">Owner confidential</span>
              </div>
            )}
          </div>
          <div className="mt-3 pt-2.5 border-t border-gray-100 text-[11px] text-amber-700 flex items-center gap-1 bg-amber-50/50 p-1 rounded">
            <Info className="w-3 h-3 shrink-0" />
            <span>Operating expenses not yet recorded</span>
          </div>
        </div>

        {/* Card 7: Cash & Bank Book */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5 hover:border-gray-300 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-gray-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">
                Cash & Bank Books
              </span>
              <div className="p-2 rounded-lg bg-gray-100 text-gray-600">
                <Landmark className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-400">
              --
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              బ్యాంక్ మరియు నగదు నిల్వలు
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-gray-100 text-[11px] text-gray-400 flex items-center gap-1">
            <Info className="w-3 h-3" />
            <span>Not recorded in system</span>
          </div>
        </div>

        {/* Card 8: Owner Capital Account */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5 hover:border-gray-300 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-gray-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">
                Owner Capital
              </span>
              <div className="p-2 rounded-lg bg-gray-100 text-gray-600">
                <Coins className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-400">
              --
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              యజమాని మూలధనం
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-gray-100 text-[11px] text-gray-400 flex items-center gap-1">
            <Info className="w-3 h-3" />
            <span>Not recorded in system</span>
          </div>
        </div>
      </div>
    </div>
  )
}

