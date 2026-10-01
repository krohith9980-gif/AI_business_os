import React from 'react'
import Link from 'next/link'

export const metadata = {
  title: 'Agricultural Mappings | AI Business OS',
}

export default function MappingsRedirectPage() {
  return (
    <div className="p-8 max-w-4xl mx-auto mt-10 text-center bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="mb-6 flex justify-center">
        <div className="h-20 w-20 bg-green-100 rounded-full flex items-center justify-center text-green-600">
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </div>
      <h1 className="text-3xl font-bold text-gray-900 mb-4">Mappings Simplified!</h1>
      <p className="text-lg text-gray-600 mb-8">
        You no longer need to manually map intelligence categories to products on a separate screen. 
        Instead, you can now directly assign "Agricultural Uses" (Crop, Pest, Disease) to products when you create or edit them.
      </p>
      <div className="flex justify-center gap-4">
        <Link 
          href="/dashboard/products" 
          className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
        >
          Go to Products
        </Link>
        <Link 
          href="/dashboard/intelligence/agri-recommendations" 
          className="inline-flex items-center px-6 py-3 border border-gray-300 text-base font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
        >
          View Recommendations
        </Link>
      </div>
    </div>
  )
}
