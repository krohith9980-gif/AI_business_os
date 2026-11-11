'use client'

import React from 'react'
import { AgriSeasonData } from '../dashboard.types'
import { Sprout, MapPin, Calendar, ShieldAlert, ArrowRight, Sparkles } from 'lucide-react'
import Link from 'next/link'

interface AgriSeasonOverviewProps {
  agri: AgriSeasonData
}

export default function AgriSeasonOverview({
  agri
}: AgriSeasonOverviewProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-gray-100 gap-2">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
              <Sprout className="w-5 h-5" />
            </div>
            <h2 className="text-base sm:text-lg font-bold text-gray-900">
              Agricultural Season & Regional Crop Hub (వ్యవసాయ సీజన్ నివేదిక)
            </h2>
            <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-emerald-600" />
              {agri.season}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
            <span className="flex items-center gap-1 font-medium text-gray-700">
              <MapPin className="w-3.5 h-3.5 text-gray-400" />
              {agri.region}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1 text-gray-400">
              <Calendar className="w-3.5 h-3.5" />
              Updated: {agri.lastUpdated}
            </span>
          </p>
        </div>

        <Link
          href="/dashboard/intelligence/agri-recommendations"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 font-bold text-xs transition-colors"
        >
          <span>Agri Intelligence Advisor</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Safety Notice */}
      <div className="bg-blue-50/70 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 flex items-start gap-2.5">
        <ShieldAlert className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">Agronomic Safety Notice: </span>
          <span>
            Inputs listed reflect general regional crop stage requirements (PJTSAU / Telangana Agri Dept). Specific chemical formulations, brand recommendations, and safety dosages require complete crop inspection via the Agri Intelligence module.
          </span>
        </div>
      </div>

      {/* Crops Cards Grid or Truthful Empty State */}
      {agri.isAvailable && agri.crops.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {agri.crops.map((crop, idx) => (
            <div
              key={idx}
              className="bg-gray-50/80 rounded-xl border border-gray-200 p-4 space-y-3 flex flex-col justify-between hover:border-emerald-300 transition-all"
            >
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-900">
                    {crop.cropName}
                  </h3>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-white border border-gray-200 px-1.5 py-0.5 rounded text-gray-600">
                    {crop.status}
                  </span>
                </div>

                <div className="mt-2">
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                    Current Growth Stage
                  </span>
                  <p className="text-xs font-bold text-emerald-800">
                    {crop.cropStage}
                  </p>
                </div>

                {crop.advisoryNotes && (
                  <div className="mt-2 pt-2 border-t border-gray-200/60">
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                      Advisory (సలహా)
                    </span>
                    <p className="text-xs text-gray-700 mt-0.5 leading-relaxed">
                      {crop.advisoryNotes}
                    </p>
                  </div>
                )}
              </div>

              {/* Recommended Input Categories */}
              {crop.inputs && crop.inputs.length > 0 && (
                <div className="pt-2 border-t border-gray-200">
                  <span className="text-[10px] font-semibold text-gray-500 block mb-1">
                    Demand Inputs:
                  </span>
                  <div className="space-y-1">
                    {crop.inputs.map((inp, i) => (
                      <div
                        key={i}
                        className="text-[11px] bg-white p-1.5 rounded border border-gray-200 flex items-center justify-between"
                      >
                        <span className="font-medium text-gray-800 truncate pr-1">
                          {inp.category}
                        </span>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.2 rounded shrink-0 ${
                            inp.urgency === 'HIGH'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {inp.urgency}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center space-y-2">
          <Sprout className="w-8 h-8 text-gray-400 mx-auto" />
          <h4 className="text-sm font-bold text-gray-800">
            No Live Agricultural Observations Recorded
          </h4>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            Seasonal crop stage observations and advisories for {agri.region} will appear here once published by the regional agricultural extension authority.
          </p>
        </div>
      )}
    </div>
  )
}

