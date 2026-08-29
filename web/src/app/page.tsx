import { Metadata } from 'next';
import Link from 'next/link';
import Script from 'next/script';

export const metadata: Metadata = {
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: 'https://vyaparos.co.in/',
  },
  openGraph: {
    title: 'VyaparOS — AI-Powered Business Management for Modern Shops',
    description: 'VyaparOS is a business management and POS platform with inventory, customer ledger, purchasing, and AI-powered business intelligence.',
    url: 'https://vyaparos.co.in/',
    siteName: 'VyaparOS',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VyaparOS — AI-Powered Business Management & Inventory Intelligence',
    description: 'VyaparOS is a business management and POS platform with inventory, customer ledger, purchasing, and AI-powered business intelligence.',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      name: 'VyaparOS',
      url: 'https://vyaparos.co.in/',
      logo: 'https://vyaparos.co.in/window.svg',
    },
    {
      '@type': 'WebSite',
      name: 'VyaparOS',
      url: 'https://vyaparos.co.in/',
    }
  ]
};

export default function Home() {
  return (
    <main className="min-h-screen bg-white">
      <Script
        id="schema-org"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      
      {/* Hero Section */}
      <section className="bg-gray-50 border-b border-gray-200 px-6 py-24 sm:py-32 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
            VyaparOS &mdash; AI-Powered Business Management for Modern Shops
          </h1>
          <p className="mt-6 text-lg leading-8 text-gray-600">
            A comprehensive POS platform with inventory tracking, customer ledger management, automated purchasing, and AI-driven seasonal demand intelligence.
          </p>
          <div className="mt-10 flex items-center justify-center gap-x-6">
            <Link
              href="/login"
              className="rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              Login
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="px-6 py-24 sm:py-32 lg:px-8 mx-auto max-w-7xl">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">POS & Billing</h2>
            <p className="text-gray-600">
              Streamline your checkout process with a lightning-fast Point of Sale system designed for rapid item entry, dynamic pricing, and automated receipts.
            </p>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Inventory Management</h2>
            <p className="text-gray-600">
              Track stock levels with precision, manage packaging and physical units seamlessly, and prevent stockouts before they affect your bottom line.
            </p>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Customer Ledger & Credit</h2>
            <p className="text-gray-600">
              Maintain detailed customer profiles, track outstanding balances, and effortlessly manage credit limits to ensure healthy cash flow.
            </p>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Purchase Management</h2>
            <p className="text-gray-600">
              Automatically generate purchase orders, track supplier deliveries, and seamlessly restock items directly into your inventory.
            </p>
          </div>
          <div className="md:col-span-2 lg:col-span-2">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">AI Business Intelligence</h2>
            <p className="text-gray-600">
              Leverage the deterministic engine and Seasonal Demand Profiles to gain predictive purchasing recommendations. VyaparOS analyzes your transaction history to provide intelligent insights on when and how much to buy.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
