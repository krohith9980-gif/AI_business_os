'use client'

import React from 'react'
import { InventoryHealth } from '../dashboard.types'
import { Package, Clock, AlertTriangle, AlertCircle, CheckCircle, Flame } from 'lucide-react'

interface InventoryHealthSectionProps {
  inventory: InventoryHealth
}

export default function InventoryHealthSection({
  inventory
}: InventoryHealthSectionProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-gray-100 gap-2">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-700" />
            <span>Inventory Health & Batch Expiry (సరుకు నిల్వలు & గడువు స్థితి)</span>
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Cartesian-safe batch tracking. Prioritize FIFO sales for near-expiry products.
          </p>
        </div>

        {/* Quick Inventory Counts */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="bg-blue-50 text-blue-800 font-semibold px-2.5 py-1 rounded-lg border border-blue-200">
            {inventory.totalAvailableStock} Total Units On Hand
          </span>
          {inventory.lowStockCount > 0 && (
            <span className="bg-amber-50 text-amber-800 font-semibold px-2.5 py-1 rounded-lg border border-amber-200">
              {inventory.lowStockCount} Low Stock
            </span>
          )}
          {inventory.outOfStockCount > 0 && (
            <span className="bg-red-50 text-red-800 font-semibold px-2.5 py-1 rounded-lg border border-red-200">
              {inventory.outOfStockCount} Out of Stock
            </span>
          )}
        </div>
      </div>

      {/* Main Alerts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Sub-card 1: Near Expiry Batches (<90 Days) */}
        <div className="bg-amber-50/40 border border-amber-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-700" />
              <h3 className="text-sm font-bold text-amber-950">
                Near Expiry Batches (&lt; 90 Days)
              </h3>
            </div>
            <span className="text-xs font-black bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full">
              {inventory.nearExpiryCount} Batches
            </span>
          </div>
          <p className="text-xs text-amber-800">
            గడువు సమీపిస్తున్న బ్యాచ్‌లు – త్వరగా అమ్మండి (Prioritize FIFO sales)
          </p>

          <div className="divide-y divide-amber-100 max-h-56 overflow-y-auto">
            {inventory.nearExpiryBatches.length > 0 ? (
              inventory.nearExpiryBatches.map((b, i) => (
                <div key={i} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <p className="font-semibold text-gray-900">{b.name}</p>
                    <p className="text-[10px] text-gray-500 font-mono">
                      Batch: {b.batchNumber} • Expiry: {new Date(b.expiryDate).toLocaleDateString('en-IN')}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-amber-900 block">{b.onHand} units</span>
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                      <Flame className="w-3 h-3 text-amber-600" />
                      {b.daysRemaining} days left
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-6 text-center text-xs text-amber-800 flex items-center justify-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span>No batches expiring within 90 days. Stock is fresh.</span>
              </div>
            )}
          </div>
        </div>

        {/* Sub-card 2: Expired Batches (Write-off / Capital Loss) */}
        <div className="bg-red-50/40 border border-red-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-700" />
              <h3 className="text-sm font-bold text-red-950">
                Expired Stock Risk (గడువు ముగిసిన సరుకు)
              </h3>
            </div>
            <span className="text-xs font-black bg-red-200 text-red-900 px-2 py-0.5 rounded-full">
              {inventory.expiredStockCount} Batches
            </span>
          </div>
          <p className="text-xs text-red-800">
            Excluded from active sellable inventory. Coordinate return with suppliers.
          </p>

          <div className="divide-y divide-red-100 max-h-56 overflow-y-auto">
            {inventory.expiredBatches.length > 0 ? (
              inventory.expiredBatches.map((b, i) => (
                <div key={i} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <p className="font-semibold text-gray-900">{b.name}</p>
                    <p className="text-[10px] text-gray-500 font-mono">
                      Batch: {b.batchNumber} • Expired: {new Date(b.expiryDate).toLocaleDateString('en-IN')}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-red-900 block">{b.onHand} units</span>
                    <span className="text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">
                      Expired {b.daysExpired} days ago
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-6 text-center text-xs text-emerald-800 flex items-center justify-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span>Zero expired stock. Excellent shelf life management.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Low Stock & Slow Moving Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
        {/* Low Stock Items */}
        <div className="border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs sm:text-sm font-bold text-gray-900 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              <span>Low Stock Items (&le; 10 units)</span>
            </h4>
            <span className="text-xs text-gray-500">
              అవసరమైన సరుకు ఆర్డర్ చేయండి
            </span>
          </div>

          <div className="divide-y divide-gray-100 max-h-44 overflow-y-auto">
            {inventory.lowStockItems.length > 0 ? (
              inventory.lowStockItems.map((item) => (
                <div key={item.id} className="py-2 flex items-center justify-between text-xs">
                  <div>
                    <p className="font-medium text-gray-900">{item.name}</p>
                    <p className="text-[10px] text-gray-400 font-mono">SKU: {item.sku}</p>
                  </div>
                  <span className="font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                    {item.onHand} on hand
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-gray-400 py-4 text-center">
                All inventory items are adequately stocked.
              </p>
            )}
          </div>
        </div>

        {/* Slow Moving & Uncosted Summary */}
        <div className="border border-gray-200 rounded-xl p-4 space-y-3 flex flex-col justify-between">
          <div>
            <h4 className="text-xs sm:text-sm font-bold text-gray-900">
              Inventory Integrity & Slow Moving Items
            </h4>
            <p className="text-xs text-gray-500 mt-0.5">
              Non-moving inventory and uncosted batch auditing.
            </p>

            <div className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between items-center p-2.5 bg-gray-50 rounded-lg">
                <span className="text-gray-700">Slow-Moving Products (&gt;10 units, 0 sales):</span>
                <span className="font-bold text-gray-900">{inventory.slowMovingCount} items</span>
              </div>
              <div className="flex justify-between items-center p-2.5 bg-gray-50 rounded-lg">
                <span className="text-gray-700">Batches with Unavailable Cost:</span>
                <span className={`font-bold ${inventory.uncostedBatchCount > 0 ? 'text-amber-700' : 'text-gray-900'}`}>
                  {inventory.uncostedBatchCount} batches
                </span>
              </div>
            </div>
          </div>

          {inventory.uncostedBatchCount > 0 && (
            <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
              *Uncosted batches are reported in unit counts but excluded from stock valuation until purchase invoices are recorded.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
