'use client'

import React from 'react'
import { TodaySnapshot } from '../dashboard.types'
import {
  TrendingUp,
  Percent,
  CheckCircle2,
  IndianRupee,
  ReceiptText,
  ArrowDownRight,
  ArrowUpRight,
  Lock
} from 'lucide-react'

interface TodaySnapshotBarProps {
  today: TodaySnapshot
}

export default function TodaySnapshotBar({ today }: TodaySnapshotBarProps) {
  return (
    <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white rounded-xl shadow-md p-4 sm:p-5 border border-emerald-800">
      {/* Header: Title & Active Period Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-4 border-b border-white/10 gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <h2 className="text-sm sm:text-base font-bold tracking-wide uppercase text-emerald-200">
            BUSINESS PULSE (వ్యాపార సారాంశం)
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-emerald-200 font-semibold bg-emerald-800/70 border border-emerald-500/40 px-3 py-1 rounded-full shadow-2xs">
            {today.snapshotDateIST || 'Selected Period'}
          </span>
        </div>
      </div>

      {/* Prominent Row: Total Sales & Gross Profit */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-3 sm:mb-4">
        {/* Metric 1: Total Sales Revenue (Prominent) */}
        <div className="bg-white/10 hover:bg-white/15 transition-all p-4 rounded-xl border border-white/20 shadow-inner flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-emerald-300 text-xs font-semibold tracking-wide uppercase mb-1.5">
              <span className="flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span>Total Sales Revenue</span>
              </span>
              <span className="bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-[10px] px-2 py-0.5 rounded-full font-medium">
                Period Total
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              ₹{today.todaySales.toLocaleString('en-IN')}
            </div>
            <div className="text-xs text-emerald-200/90 font-medium mt-1">
              మొత్తం అమ్మకాలు (పన్ను రహితం)
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-white/10 text-[11px] text-emerald-200/70 flex justify-between items-center">
            <span>Net product revenue (excl. GST)</span>
            <span>
              {today.todayTotalTaxCollected !== undefined && today.todayTotalTaxCollected > 0
                ? `+₹${today.todayTotalTaxCollected.toLocaleString('en-IN')} GST`
                : `${today.todayBillCount} ${today.todayBillCount === 1 ? 'bill' : 'bills'}`}
            </span>
          </div>
        </div>

        {/* Metric 2: Gross Profit & Margin (Prominent - Owner Confidential) */}
        <div className="bg-white/10 hover:bg-white/15 transition-all p-4 rounded-xl border border-white/20 shadow-inner flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-teal-300 text-xs font-semibold tracking-wide uppercase mb-1.5">
              <span className="flex items-center gap-1.5">
                <Percent className="w-4 h-4 text-teal-400" />
                <span>Gross Profit & Margin</span>
              </span>
              {today.todayGrossProfit !== null && today.todayGrossProfitMargin !== null && (
                <span className="bg-teal-500/20 text-teal-200 border border-teal-400/30 text-[10px] px-2 py-0.5 rounded-full font-semibold">
                  {today.todayGrossProfitMargin.toFixed(1)}% margin
                </span>
              )}
            </div>
            {today.todayGrossProfit !== null ? (
              <>
                <div className="text-2xl sm:text-3xl font-black text-emerald-300 tracking-tight flex items-baseline gap-2">
                  <span>₹{today.todayGrossProfit.toLocaleString('en-IN')}</span>
                  {Boolean(today.uncostedItemsCount && today.uncostedItemsCount > 0) && (
                    <span className="text-xs font-normal text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded border border-amber-400/30">
                      *{today.uncostedItemsCount} uncosted
                    </span>
                  )}
                </div>
                <div className="text-xs text-teal-200/90 font-medium mt-1">
                  స్థూల లాభం (అమ్మకాలు − కొనుగోలు ఖర్చు)
                </div>
              </>
            ) : (
              <div className="py-2 flex items-center gap-2 text-gray-300">
                <Lock className="w-5 h-5 text-gray-400" />
                <span className="text-base font-bold text-gray-200">Owner Confidential</span>
              </div>
            )}
          </div>
          <div className="mt-3 pt-2 border-t border-white/10 text-[11px] text-teal-200/70">
            {today.todayGrossProfit !== null
              ? (today.uncostedItemsCount && today.uncostedItemsCount > 0
                  ? `*Estimated: ${today.uncostedItemsCount} sold item(s) had missing purchase cost`
                  : 'Calculated from historical item purchase costs')
              : 'Restricted to owner account'}
          </div>
        </div>
      </div>

      {/* 5 Operational Register Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Metric 3: Paid Sales */}
        <div className="bg-white/5 hover:bg-white/10 transition-colors p-3 rounded-lg border border-white/10">
          <div className="flex items-center justify-between text-emerald-300 text-xs mb-1">
            <span className="font-semibold">Paid Sales (Net)</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-base sm:text-lg font-extrabold text-emerald-300">
            ₹{(today.todayPaidSales ?? today.todayCashSales).toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-emerald-200/80 mt-0.5">
            వసూలైన నికర అమ్మకాలు
          </div>
          <div className="mt-2 pt-1.5 border-t border-white/10 text-[10px] text-emerald-300/70 flex flex-wrap gap-x-2">
            {today.todayPaidCash !== undefined && today.todayPaidCash > 0 && <span>Cash: ₹{today.todayPaidCash.toLocaleString('en-IN')}</span>}
            {today.todayPaidUpi !== undefined && today.todayPaidUpi > 0 && <span>UPI: ₹{today.todayPaidUpi.toLocaleString('en-IN')}</span>}
            {today.todayPaidCard !== undefined && today.todayPaidCard > 0 && <span>Card: ₹{today.todayPaidCard.toLocaleString('en-IN')}</span>}
            {(!today.todayPaidCash && !today.todayPaidUpi && !today.todayPaidCard) && <span>Allocated net revenue</span>}
          </div>
        </div>

        {/* Metric 4: Credit Sales */}
        <div className="bg-white/5 hover:bg-white/10 transition-colors p-3 rounded-lg border border-white/10">
          <div className="flex items-center justify-between text-amber-300 text-xs mb-1">
            <span className="font-semibold">Credit Sales (Net)</span>
            <IndianRupee className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-base sm:text-lg font-extrabold text-amber-300">
            ₹{today.todayCreditSales.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-amber-200/80 mt-0.5">
            బాకీ నికర అమ్మకాలు
          </div>
          <div className="mt-2 pt-1.5 border-t border-white/10 text-[10px] text-amber-300/70">
            Unpaid revenue balance
          </div>
        </div>

        {/* Metric 5: Bills Count */}
        <div className="bg-white/5 hover:bg-white/10 transition-colors p-3 rounded-lg border border-white/10">
          <div className="flex items-center justify-between text-teal-300 text-xs mb-1">
            <span className="font-semibold">Bills Count</span>
            <ReceiptText className="w-3.5 h-3.5 text-teal-400" />
          </div>
          <div className="text-base sm:text-lg font-extrabold text-white">
            {today.todayBillCount}
          </div>
          <div className="text-[11px] text-teal-300/80 mt-0.5">
            బిల్లులు
          </div>
          <div className="mt-2 pt-1.5 border-t border-white/10 text-[10px] text-teal-300/70">
            Completed invoices
          </div>
        </div>

        {/* Metric 6: Customer Collections */}
        <div className="bg-white/5 hover:bg-white/10 transition-colors p-3 rounded-lg border border-white/10">
          <div className="flex items-center justify-between text-cyan-300 text-xs mb-1">
            <span className="font-semibold">Collections</span>
            <ArrowDownRight className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-base sm:text-lg font-extrabold text-cyan-300">
            ₹{today.todayCollections.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-cyan-200/80 mt-0.5">
            రైతుల వసూళ్లు
          </div>
          <div className="mt-2 pt-1.5 border-t border-white/10 text-[10px] text-cyan-300/70">
            Account ledger receipts
          </div>
        </div>

        {/* Metric 7: Supplier Payments (Owner Only) */}
        {today.todaySupplierDisbursements !== null ? (
          <div className="bg-white/5 hover:bg-white/10 transition-colors p-3 rounded-lg border border-white/10">
            <div className="flex items-center justify-between text-rose-300 text-xs mb-1">
              <span className="font-semibold">Supplier Paid</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-rose-400" />
            </div>
            <div className="text-base sm:text-lg font-extrabold text-rose-300">
              ₹{today.todaySupplierDisbursements.toLocaleString('en-IN')}
            </div>
            <div className="text-[11px] text-rose-200/80 mt-0.5">
              సరఫరాదారులకు చెల్లింపులు
            </div>
            <div className="mt-2 pt-1.5 border-t border-white/10 text-[10px] text-rose-300/70">
              Settled disbursements
            </div>
          </div>
        ) : (
          <div className="bg-white/5 p-3 rounded-lg border border-white/10 flex flex-col justify-between opacity-60">
            <div className="flex items-center justify-between text-gray-400 text-xs mb-1">
              <span className="font-semibold">Supplier Paid</span>
              <Lock className="w-3.5 h-3.5 text-gray-400" />
            </div>
            <div className="text-sm font-bold text-gray-300">
              Restricted
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5">
              సరఫరాదారుల చెల్లింపులు
            </div>
            <div className="mt-2 pt-1.5 border-t border-white/10 text-[10px] text-gray-400">
              Owner confidential
            </div>
          </div>
        )}
      </div>

      {/* Footer Subtext */}
      <div className="mt-3 pt-2.5 border-t border-white/10 flex flex-wrap items-center justify-between text-[11px] text-emerald-200/80 gap-1">
        <span>⚡ <strong>Business Pulse:</strong> Metrics reflect tax-exclusive operational revenue (<strong>Paid Sales + Credit Sales = Total Sales</strong>).</span>
        <span className="text-emerald-300/80">
          {today.todayTotalTaxCollected !== undefined && today.todayTotalTaxCollected > 0
            ? `Billed with GST: ₹${(today.todayTotalBilledWithTax ?? (today.todaySales + today.todayTotalTaxCollected)).toLocaleString('en-IN')} (Statutory GST excluded from revenue)`
            : 'Statutory GST excluded from revenue'}
        </span>
      </div>
    </div>
  )
}
