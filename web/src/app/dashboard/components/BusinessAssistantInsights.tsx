'use client'

import React from 'react'
import { AIInsight } from '../dashboard.types'
import { Bot, AlertTriangle, ArrowRight, TrendingUp, Sparkles, AlertCircle } from 'lucide-react'
import Link from 'next/link'

interface BusinessAssistantInsightsProps {
  insights: AIInsight[]
}

export default function BusinessAssistantInsights({
  insights
}: BusinessAssistantInsightsProps) {
  if (!insights || insights.length === 0) return null

  const getInsightIcon = (type: AIInsight['type']) => {
    switch (type) {
      case 'positive':
        return <TrendingUp className="w-4 h-4 text-emerald-600" />
      case 'alert':
        return <AlertTriangle className="w-4 h-4 text-rose-600" />
      case 'warning':
        return <AlertCircle className="w-4 h-4 text-amber-600" />
      case 'opportunity':
        return <Sparkles className="w-4 h-4 text-teal-600" />
      default:
        return <Bot className="w-4 h-4 text-blue-600" />
    }
  }

  const getBorderColor = (type: AIInsight['type']) => {
    switch (type) {
      case 'positive':
        return 'border-emerald-200 bg-emerald-50/40'
      case 'alert':
        return 'border-rose-200 bg-rose-50/40'
      case 'warning':
        return 'border-amber-200 bg-amber-50/40'
      case 'opportunity':
        return 'border-teal-200 bg-teal-50/40'
      default:
        return 'border-blue-200 bg-blue-50/40'
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-100 text-indigo-800">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-gray-900">
              VyaparOS Business Assistant (వ్యాపార సహాయకుడు)
            </h2>
            <p className="text-xs text-gray-500">
              Deterministic operational intelligence for proactive shop management.
            </p>
          </div>
        </div>
        <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-full">
          AI Recommended Actions
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {insights.map((insight) => (
          <div
            key={insight.id}
            className={`rounded-xl border p-4 flex flex-col justify-between space-y-3 transition-all hover:shadow-xs ${getBorderColor(
              insight.type
            )}`}
          >
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                {getInsightIcon(insight.type)}
                <h3 className="text-xs sm:text-sm font-bold text-gray-900 leading-snug">
                  {insight.title}
                </h3>
              </div>
              {insight.titleTe && (
                <p className="text-[11px] font-medium text-emerald-800">
                  {insight.titleTe}
                </p>
              )}
              <p className="text-xs text-gray-700 leading-relaxed pt-1">
                {insight.description}
              </p>
            </div>

            {insight.actionLabel && insight.actionHref && (
              <div className="pt-2 border-t border-gray-200/60">
                <Link
                  href={insight.actionHref}
                  className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 hover:text-indigo-900 transition-colors"
                >
                  <span>{insight.actionLabel}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

