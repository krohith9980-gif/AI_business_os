'use client'

import React from 'react'
import { TodaySnapshot } from '../dashboard.types'
import { IndianRupee, ReceiptText, ArrowDownRight, ArrowUpRight, Split, Lock } from 'lucide-react'

interface TodaySnapshotBarProps {
  today: TodaySnapshot
}

export default function TodaySnapshotBar({ today }: TodaySnapshotBarProps) {
  return (
    <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white rounded-xl shadow-md p-4 sm:p-5 border border-emerald-800">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-3 border-b border-white/10 gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <h2 className="text-sm sm:text-base font-bold tracking-wide uppercase text-emerald-200">
            Today's Business Pulse (ఈరోజు వ్యాపార సారాంశం)
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-emerald-200 font-medium bg-emerald-800/70 border border-emerald-500/40 px-2.5 py-0.5 rounded-full shadow-2xs">
            Live Today ({today.snapshotDateIST || 'IST'}) • Independent of period filter
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* Metric 1: Today's Total Sales */}
        <div className="bg-white/5 hover:bg-white/10 transition-colors p-3 rounded-lg border border-white/10">
          <div className="flex items-center justify-between text-emerald-300 text-xs mb-1">
            <span>Total Sales</span>
            <IndianRupee className="w-3.5 h-3.5" />
          </div>
          <div className="text-base sm:text-lg font-extrabold text-white">
            ₹{today.todaySales.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-emerald-300/80 mt-0.5">
            మొత్తం అమ్మకాలు
          </div>
        </div>

        {/* Metric 2: Today's Cash Sales */}
        <div className="bg-white/5 hover:bg-white/10 transition-colors p-3 rounded-lg border border-white/10">
          <div className="flex items-center justify-between text-emerald-300 text-xs mb-1">
            <span>Cash Sales</span>
            <IndianRupee className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-base sm:text-lg font-extrabold text-emerald-300">
            ₹{today.todayCashSales.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-emerald-200/80 mt-0.5">
            నగదు అమ్మకాలు
          </div>
        </div>

        {/* Metric 3: Today's Credit Sales */}
        <div className="bg-white/5 hover:bg-white/10 transition-colors p-3 rounded-lg border border-white/10">
          <div className="flex items-center justify-between text-amber-300 text-xs mb-1">
            <span>Credit Sales</span>
            <IndianRupee className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-base sm:text-lg font-extrabold text-amber-300">
            ₹{today.todayCreditSales.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-amber-200/80 mt-0.5">
            బాకీ అమ్మకాలు
          </div>
        </div>

        {/* Metric 4: Today's Bill Count */}
        <div className="bg-white/5 hover:bg-white/10 transition-colors p-3 rounded-lg border border-white/10">
          <div className="flex items-center justify-between text-teal-300 text-xs mb-1">
            <span>Bills Count</span>
            <ReceiptText className="w-3.5 h-3.5" />
          </div>
          <div className="text-base sm:text-lg font-extrabold text-white">
            {today.todayBillCount}
          </div>
          <div className="text-[11px] text-teal-300/80 mt-0.5">
            బిల్లులు
          </div>
        </div>

        {/* Metric 5: Collections Today */}
        <div className="bg-white/5 hover:bg-white/10 transition-colors p-3 rounded-lg border border-white/10">
          <div className="flex items-center justify-between text-cyan-300 text-xs mb-1">
            <span>Collections</span>
            <ArrowDownRight className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-base sm:text-lg font-extrabold text-cyan-300">
            ₹{today.todayCollections.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-cyan-200/80 mt-0.5">
            రైతుల వసూళ్లు
          </div>
        </div>

        {/* Metric 6: Supplier Disbursements Today (Owner Only) */}
        {today.todaySupplierDisbursements !== null ? (
          <div className="bg-white/5 hover:bg-white/10 transition-colors p-3 rounded-lg border border-white/10">
            <div className="flex items-center justify-between text-rose-300 text-xs mb-1">
              <span>Supplier Paid</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-rose-400" />
            </div>
            <div className="text-base sm:text-lg font-extrabold text-rose-300">
              ₹{today.todaySupplierDisbursements.toLocaleString('en-IN')}
            </div>
            <div className="text-[11px] text-rose-200/80 mt-0.5">
              సరఫరాదారులకు చెల్లింపులు
            </div>
          </div>
        ) : (
          <div className="bg-white/5 p-3 rounded-lg border border-white/10 flex flex-col justify-between opacity-60">
            <div className="flex items-center justify-between text-gray-400 text-xs mb-1">
              <span>Supplier Paid</span>
              <Lock className="w-3.5 h-3.5 text-gray-400" />
            </div>
            <div className="text-sm font-bold text-gray-300">
              Restricted
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5">
              Owner confidential
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 pt-2.5 border-t border-white/10 flex flex-wrap items-center justify-between text-[11px] text-emerald-200/80 gap-1">
        <span>⚡ <strong>Live Snapshot:</strong> Reflects real-time transactions for today ({today.snapshotDateIST || 'IST'}).</span>
        <span className="text-emerald-300/80">Filter selections below adjust Financial Health, Comparisons, and Trends.</span>
      </div>
    </div>
  )
}

