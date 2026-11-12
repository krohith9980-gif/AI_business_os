'use client'

import React from 'react'
import { SalesPerformance } from '../dashboard.types'
import { TrendingUp, TrendingDown, Award, BarChart3, Wallet, Split, ReceiptText, IndianRupee } from 'lucide-react'

interface SalesPerformanceSectionProps {
  performance: SalesPerformance
}

export default function SalesPerformanceSection({
  performance
}: SalesPerformanceSectionProps) {
  const maxDailySale = Math.max(...performance.dailyTrend.map(d => d.sales), 1)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Column 1 & 2: Fair MTD Comparison & 7-Day Trend */}
      <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-gray-100 gap-2">
          <div>
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-700" />
              <span>Sales Performance & Fair Comparison (అమ్మకాల పోలిక)</span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {performance.comparisonLabel}
            </p>
          </div>

          {/* Comparison Badges */}
          <div className="flex items-center gap-2">
            {performance.percentageChange !== null ? (
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                  performance.percentageChange >= 0
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-rose-100 text-rose-800'
                }`}
              >
                {performance.percentageChange >= 0 ? (
                  <TrendingUp className="w-3.5 h-3.5" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5" />
                )}
                <span>
                  {performance.percentageChange >= 0 ? '+' : ''}
                  {performance.percentageChange.toFixed(1)}% sales
                </span>
              </span>
            ) : (
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                No prior data
              </span>
            )}

            {performance.profitPercentageChange !== null && (
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                  performance.profitPercentageChange >= 0
                    ? 'bg-teal-100 text-teal-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                <span>
                  {performance.profitPercentageChange >= 0 ? '+' : ''}
                  {performance.profitPercentageChange.toFixed(1)}% profit
                </span>
              </span>
            )}
          </div>
        </div>

        {/* Comparison Values Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50 p-3.5 rounded-lg border border-gray-200">
          <div>
            <div className="text-[11px] text-gray-500">Current Period Sales</div>
            <div className="text-base font-black text-gray-900">
              ₹{performance.currentSales.toLocaleString('en-IN')}
            </div>
            <div className="text-[10px] text-emerald-700">ప్రస్తుత కాలం</div>
          </div>
          <div>
            <div className="text-[11px] text-gray-500">Prior Period Elapsed</div>
            <div className="text-base font-bold text-gray-700">
              ₹{performance.previousSales.toLocaleString('en-IN')}
            </div>
            <div className="text-[10px] text-gray-500">గత నెల సమాన కాలం</div>
          </div>
          <div>
            <div className="text-[11px] text-gray-500">Current Gross Profit</div>
            <div className="text-base font-bold text-teal-800">
              {performance.currentGrossProfit !== null ? `₹${performance.currentGrossProfit.toLocaleString('en-IN')}` : '--'}
            </div>
            <div className="text-[10px] text-teal-700">ప్రస్తుత స్థూల లాభం</div>
          </div>
          <div>
            <div className="text-[11px] text-gray-500">Prior Gross Profit</div>
            <div className="text-base font-bold text-gray-600">
              {performance.previousGrossProfit !== null ? `₹${performance.previousGrossProfit.toLocaleString('en-IN')}` : '--'}
            </div>
            <div className="text-[10px] text-gray-500">గత స్థూల లాభం</div>
          </div>
        </div>

        {/* Cash vs Credit Sales Breakdown for Selected Reporting Period */}
        <div className="bg-gradient-to-br from-emerald-50/60 via-teal-50/40 to-slate-50 border border-emerald-200/80 rounded-xl p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-2 border-b border-emerald-100">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-emerald-700" />
              <h4 className="font-bold text-sm text-gray-900">
                Cash vs Credit Breakdown (నగదు vs బాకీ అమ్మకాలు)
              </h4>
              <span className="text-[11px] font-semibold text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-300">
                {performance.periodDisplayLabel}
              </span>
            </div>
            <span className="text-[11px] text-gray-500">
              *Invoice checkout allocations
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* 1. Total Sales */}
            <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-2xs">
              <div className="text-[11px] font-semibold text-gray-500 flex items-center justify-between">
                <span>Total Sales</span>
                <IndianRupee className="w-3.5 h-3.5 text-gray-400" />
              </div>
              <div className="text-base sm:text-lg font-black text-gray-900 mt-1">
                ₹{performance.periodTotalSales.toLocaleString('en-IN')}
              </div>
              <div className="text-[10px] text-gray-600 font-medium mt-0.5">మొత్తం అమ్మకాలు</div>
            </div>

            {/* 2. Cash Sales */}
            <div className="bg-white p-3 rounded-lg border border-emerald-200 shadow-2xs">
              <div className="text-[11px] font-semibold text-emerald-700 flex items-center justify-between">
                <span>Cash Sales</span>
                <Wallet className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <div className="text-base sm:text-lg font-black text-emerald-800 mt-1">
                ₹{performance.periodCashSales.toLocaleString('en-IN')}
              </div>
              <div className="text-[10px] text-emerald-600 font-medium mt-0.5">నగదు అమ్మకాలు</div>
            </div>

            {/* 3. Credit Sales */}
            <div className="bg-white p-3 rounded-lg border border-amber-200 shadow-2xs">
              <div className="text-[11px] font-semibold text-amber-700 flex items-center justify-between">
                <span>Credit Sales</span>
                <Split className="w-3.5 h-3.5 text-amber-600" />
              </div>
              <div className="text-base sm:text-lg font-black text-amber-800 mt-1">
                ₹{performance.periodCreditSales.toLocaleString('en-IN')}
              </div>
              <div className="text-[10px] text-amber-600 font-medium mt-0.5">బాకీ అమ్మకాలు</div>
            </div>

            {/* 4. Number of Bills */}
            <div className="bg-white p-3 rounded-lg border border-teal-200 shadow-2xs">
              <div className="text-[11px] font-semibold text-teal-700 flex items-center justify-between">
                <span>Bills Count</span>
                <ReceiptText className="w-3.5 h-3.5 text-teal-600" />
              </div>
              <div className="text-base sm:text-lg font-black text-teal-900 mt-1">
                {performance.periodBillCount}
              </div>
              <div className="text-[10px] text-teal-600 font-medium mt-0.5">బిల్లులు</div>
            </div>
          </div>

          {/* Visual Ratio Bar */}
          {performance.periodTotalSales > 0 && (
            <div className="space-y-1 pt-1">
              <div className="flex justify-between text-[11px] font-semibold">
                <span className="text-emerald-800">
                  నగదు (Cash): {Math.round((performance.periodCashSales / performance.periodTotalSales) * 100)}% (₹{performance.periodCashSales.toLocaleString('en-IN')})
                </span>
                <span className="text-amber-800">
                  బాకీ (Credit): {Math.round((performance.periodCreditSales / performance.periodTotalSales) * 100)}% (₹{performance.periodCreditSales.toLocaleString('en-IN')})
                </span>
              </div>
              <div className="w-full bg-amber-200 rounded-full h-2 overflow-hidden flex">
                <div
                  style={{ width: `${Math.round((performance.periodCashSales / performance.periodTotalSales) * 100)}%` }}
                  className="bg-emerald-600 h-full transition-all duration-300"
                />
              </div>
            </div>
          )}
        </div>

        {/* 7-Day Trend Bars */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs text-gray-500 font-medium">
            <span>Daily Sales Trend (గత 7 రోజుల రోజువారీ అమ్మకాలు)</span>
            <span>Peak Day: ₹{maxDailySale.toLocaleString('en-IN')}</span>
          </div>

          <div className="grid grid-cols-7 gap-2 pt-3 h-36 items-end">
            {performance.dailyTrend.map((day, idx) => {
              const heightPercent = Math.max(8, Math.round((day.sales / maxDailySale) * 100))
              const isPeak = day.sales === maxDailySale && day.sales > 0

              return (
                <div key={idx} className="flex flex-col items-center gap-1.5 h-full justify-end group">
                  <div className="text-[10px] font-bold text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity">
                    ₹{day.sales > 1000 ? `${(day.sales / 1000).toFixed(1)}k` : day.sales}
                  </div>
                  <div className="w-full bg-gray-100 rounded-t-md h-full flex items-end overflow-hidden">
                    <div
                      style={{ height: `${heightPercent}%` }}
                      className={`w-full transition-all duration-500 rounded-t-md ${
                        isPeak
                          ? 'bg-emerald-600 shadow-sm'
                          : 'bg-emerald-400 group-hover:bg-emerald-500'
                      }`}
                    />
                  </div>
                  <div className="text-[10px] font-semibold text-gray-600 text-center truncate w-full">
                    {day.label}
                  </div>
                  <div className="text-[9px] text-gray-400">
                    {day.count} bills
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Column 3: Top 5 Bestsellers */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-amber-600" />
              <span>Top 5 Bestsellers (అత్యధిక అమ్మకాలు)</span>
            </h3>
            <span className="text-xs text-gray-400">By Revenue</span>
          </div>

          <div className="divide-y divide-gray-100 mt-2">
            {performance.bestSellers.length > 0 ? (
              performance.bestSellers.map((item, i) => (
                <div key={i} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-black flex items-center justify-center">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-semibold text-gray-900 truncate">
                        {item.name}
                      </p>
                      <p className="text-[10px] text-gray-400 font-mono truncate">
                        SKU: {item.sku}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs sm:text-sm font-bold text-gray-900">
                      ₹{item.revenue.toLocaleString('en-IN')}
                    </div>
                    <div className="text-[10px] text-gray-500">
                      {item.quantity} units sold
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-xs text-gray-400">
                No product sales recorded in this period
              </div>
            )}
          </div>
        </div>

        <div className="bg-emerald-50/50 p-2.5 rounded-lg border border-emerald-100 text-[11px] text-emerald-800 flex items-center justify-between">
          <span>Priority Reorder Tip:</span>
          <span className="font-semibold">Maintain stock for top items</span>
        </div>
      </div>
    </div>
  )
}

