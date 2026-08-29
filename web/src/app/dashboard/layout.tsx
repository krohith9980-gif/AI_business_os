import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { logout } from '@/app/login/actions'

const navigation = [
  { name: 'Dashboard', href: '/dashboard' },
  { name: 'Intelligence', href: '/dashboard/intelligence' },
  { name: 'POS', href: '/dashboard/pos' },
  { name: 'Products', href: '/dashboard/products' },
  { name: 'Inventory', href: '/dashboard/inventory' },
  { name: 'Sales', href: '/dashboard/sales' },
  { name: 'Purchases', href: '/dashboard/purchases' },
  { name: 'Customers', href: '/dashboard/customers' },
  { name: 'Suppliers', href: '/dashboard/suppliers' },
  { name: 'Reports', href: '/dashboard/reports' },
  { name: 'Settings', href: '/dashboard/settings' },
]

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Check for active organization membership
  const { data: memberships } = await supabase
    .from('organization_members')
    .select('id')
    .eq('profile_id', user.id)
    .eq('is_active', true)
    .limit(1)

  if (!memberships || memberships.length === 0) {
    redirect('/setup')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-xl font-bold">AI Business OS</h1>
        </div>
        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto hidden md:block">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="group flex items-center px-2 py-2 text-sm font-medium rounded-md hover:bg-gray-800 hover:text-white transition-colors text-gray-300"
            >
              {item.name}
            </Link>
          ))}
        </nav>
        {/* Mobile Nav (horizontal scroll or simplified) */}
        <nav className="flex md:hidden overflow-x-auto p-2 space-x-2 border-b border-gray-800">
           {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="whitespace-nowrap px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-800 text-gray-300"
            >
              {item.name}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        {/* Top Header */}
        <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-4 sm:px-6 lg:px-8 shrink-0">
          <div className="flex-1"></div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600 truncate max-w-[200px] sm:max-w-xs">
              {user?.email}
            </span>
            <form action={logout}>
              <button
                type="submit"
                className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
              >
                Logout
              </button>
            </form>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
