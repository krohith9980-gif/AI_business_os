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
        <div className="text-xs text-emerald-300 font-medium">
          Real-time POS & Register Sync
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Metric 1: Today's Total Sales */}
        <div className="bg-white/5 hover:bg-white/10 transition-colors p-3 rounded-lg border border-white/10">
          <div className="flex items-center justify-between text-emerald-300 text-xs mb-1">
            <span>Today's Sales</span>
            <IndianRupee className="w-3.5 h-3.5" />
          </div>
          <div className="text-lg sm:text-xl font-extrabold text-white">
            ₹{today.todaySales.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-emerald-300/80 mt-0.5">
            ఈరోజు మొత్తం అమ్మకాలు
          </div>
        </div>

        {/* Metric 2: Today's Bill Count */}
        <div className="bg-white/5 hover:bg-white/10 transition-colors p-3 rounded-lg border border-white/10">
          <div className="flex items-center justify-between text-teal-300 text-xs mb-1">
            <span>Bills Count</span>
            <ReceiptText className="w-3.5 h-3.5" />
          </div>
          <div className="text-lg sm:text-xl font-extrabold text-white">
            {today.todayBillCount}
          </div>
          <div className="text-[11px] text-teal-300/80 mt-0.5">
            ఈరోజు బిల్లుల సంఖ్య
          </div>
        </div>

        {/* Metric 3: Cash vs Credit Split */}
        <div className="bg-white/5 hover:bg-white/10 transition-colors p-3 rounded-lg border border-white/10 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-blue-300 text-xs mb-1">
            <span>Cash vs Credit</span>
            <Split className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-baseline gap-1 text-xs sm:text-sm font-bold text-white">
            <span className="text-emerald-400">₹{today.todayCashSales.toLocaleString('en-IN')}</span>
            <span className="text-gray-400">/</span>
            <span className="text-amber-400">₹{today.todayCreditSales.toLocaleString('en-IN')}</span>
          </div>
          <div className="text-[11px] text-gray-300 mt-0.5 flex justify-between">
            <span className="text-emerald-300/90">నగదు</span>
            <span className="text-amber-300/90">అరువు</span>
          </div>
        </div>

        {/* Metric 4: Collections Today */}
        <div className="bg-white/5 hover:bg-white/10 transition-colors p-3 rounded-lg border border-white/10">
          <div className="flex items-center justify-between text-emerald-300 text-xs mb-1">
            <span>Customer Collections</span>
            <ArrowDownRight className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-lg sm:text-xl font-extrabold text-emerald-300">
            ₹{today.todayCollections.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-emerald-200/80 mt-0.5">
            రైతుల నుంచి వసూళ్లు
          </div>
        </div>

        {/* Metric 5: Supplier Disbursements Today (Owner Only) */}
        {today.todaySupplierDisbursements !== null ? (
          <div className="bg-white/5 hover:bg-white/10 transition-colors p-3 rounded-lg border border-white/10">
            <div className="flex items-center justify-between text-rose-300 text-xs mb-1">
              <span>Supplier Paid</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-rose-400" />
            </div>
            <div className="text-lg sm:text-xl font-extrabold text-rose-300">
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
    </div>
  )
}

