import { NavLink } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import type { ReactNode } from 'react'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2.5 px-3 py-1.5 rounded text-[13px] transition-colors mb-0.5 ${
    isActive
      ? 'bg-cm-green text-white font-medium'
      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
  }`

function NavGroup({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div className="mb-1">
      <div className="px-3 mt-4 mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">
        {heading}
      </div>
      {children}
    </div>
  )
}

function NavItem({ to, icon, label }: { to: string; icon: string; label: string }) {
  return (
    <NavLink to={to} className={linkClass}>
      <span className="text-base leading-none w-5 text-center">{icon}</span>
      <span className="truncate">{label}</span>
    </NavLink>
  )
}

export function Sidebar() {
  const { user } = useAuth()

  const displayName = user?.full_name ?? user?.name ?? '—'
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <aside className="bg-gray-900 text-gray-100 flex-shrink-0 h-screen flex flex-col w-64 border-r border-gray-800">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-4 border-b border-gray-800">
        <div className="w-7 h-7 rounded-sm bg-cm-green flex items-center justify-center text-white font-bold text-sm">
          CM
        </div>
        <span className="font-semibold text-sm tracking-tight text-white">
          CasaModerna DMS
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        <NavGroup heading="Overview">
          <NavItem to="/dashboard" icon="📊" label="Dashboard" />
        </NavGroup>

        <NavGroup heading="Sales">
          <NavItem to="/customers" icon="👥" label="Customers" />
          <NavItem to="/sales/quotations" icon="📋" label="Quotations" />
          <NavItem to="/sales/orders" icon="📦" label="Sales Orders" />
          <NavItem to="/sales/invoices" icon="🧾" label="Invoices" />
          <NavItem to="/sales/receipts" icon="💳" label="Receipts" />
          <NavItem to="/sales/delivery-notes" icon="🚚" label="Delivery Notes" />
        </NavGroup>

        <NavGroup heading="Purchases">
          <NavItem to="/purchases/orders" icon="🛒" label="Purchase Orders" />
          <NavItem to="/purchases/grn" icon="📥" label="Purchase Receipts" />
        </NavGroup>

        <NavGroup heading="Warehouse">
          <NavItem to="/warehouse/stock-balances" icon="📊" label="Stock Balances" />
          <NavItem to="/warehouse/stock-ledger" icon="📒" label="Stock Ledger" />
        </NavGroup>

        <NavGroup heading="Finance">
          <NavItem to="/finance/aged" icon="📅" label="Aged AR / AP" />
        </NavGroup>

        <NavGroup heading="Catalogue">
          <NavItem to="/products" icon="🪑" label="Products" />
          <NavItem to="/suppliers" icon="🏭" label="Suppliers" />
          <NavItem to="/configurator" icon="⚙️" label="Configurator Pricing" />
        </NavGroup>
      </nav>

      {/* User footer */}
      <div className="px-3 py-3 border-t border-gray-800 flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-xs font-semibold">
          {initials}
        </div>
        <span className="text-xs text-gray-400 truncate flex-1">{displayName}</span>
      </div>
    </aside>
  )
}
