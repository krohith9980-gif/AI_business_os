import React from 'react'

export const metadata = {
  title: 'Reports | AI Business OS',
  description: 'View business reports and analytics',
}

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <div className="flex items-center space-x-2">
           <select className="px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-gray-700 bg-white">
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="year">This Year</option>
            <option value="custom">Custom Range</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Metric Cards */}
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-6 flex items-center justify-center h-32">
          <div className="text-center">
             <p className="text-sm font-medium text-gray-500">Total Revenue</p>
             <p className="mt-1 text-xl font-semibold text-gray-400">---</p>
          </div>
        </div>
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-6 flex items-center justify-center h-32">
          <div className="text-center">
             <p className="text-sm font-medium text-gray-500">Total Profit</p>
             <p className="mt-1 text-xl font-semibold text-gray-400">---</p>
          </div>
        </div>
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-6 flex items-center justify-center h-32">
          <div className="text-center">
             <p className="text-sm font-medium text-gray-500">Sales Volume</p>
             <p className="mt-1 text-xl font-semibold text-gray-400">---</p>
          </div>
        </div>
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-6 flex items-center justify-center h-32">
          <div className="text-center">
             <p className="text-sm font-medium text-gray-500">Inventory Value</p>
             <p className="mt-1 text-xl font-semibold text-gray-400">---</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 flex flex-col h-96">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Sales Trend</h2>
          </div>
          <div className="flex-1 flex items-center justify-center p-6 text-gray-400 text-sm">
            Not enough data to display sales trend
          </div>
        </div>

        <div className="bg-white shadow-sm rounded-lg border border-gray-200 flex flex-col h-96">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Top Products</h2>
          </div>
          <div className="flex-1 flex items-center justify-center p-6 text-gray-400 text-sm">
            No sales data available
          </div>
        </div>
      </div>
    </div>
  )
}
