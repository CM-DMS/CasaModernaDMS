import { NavLink } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { usePermissions } from '../../auth/PermissionsProvider'
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
  const { can } = usePermissions()

  const displayName = user?.full_name ?? user?.name ?? '—'
  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
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

        {(can('canSales') || can('canAdmin')) && (
          <NavGroup heading="Sales &amp; CRM">
            <NavItem to="/customers"                    icon="👥" label="Customers" />
            <NavItem to="/customers/registrations"      icon="📋" label="Registrations" />
            <NavItem to="/customers/reports"            icon="📝" label="Customer Reports" />
            <NavItem to="/sales/quotations"             icon="💬" label="Quotations" />
            <NavItem to="/sales/proformas"              icon="📃" label="Proformas" />
            <NavItem to="/sales/orders"                 icon="🛒" label="Sales Orders" />
            <NavItem to="/sales/invoices"               icon="🧾" label="Invoices" />
            <NavItem to="/sales/cash-sales"             icon="💵" label="Cash Sales" />
            <NavItem to="/sales/credit-notes"           icon="↩️" label="Credit Notes" />
            <NavItem to="/sales/receipts"               icon="💰" label="Receipts" />
          </NavGroup>
        )}

        <NavGroup heading="Products">
          <NavItem to="/products" icon="🏷️" label="Product Catalogue" />
        </NavGroup>

        <NavGroup heading="Tools">
          <NavItem to="/tools/tiles-calculator" icon="📐" label="Tiles Calculator" />
        </NavGroup>

        {(can('canManagePriceLists') || can('canAdmin')) && (
          <NavGroup heading="Pricing">
            <NavItem to="/admin/pricing-calculators" icon="🧮" label="Pricing Calculators" />
            <NavItem to="/admin/price-lists"         icon="💶" label="Price Lists" />
          </NavGroup>
        )}

        {(can('canPurchasing') || can('canAdmin')) && (
          <NavGroup heading="Purchasing">
            <NavItem to="/suppliers"                          icon="🏭" label="Suppliers" />
            <NavItem to="/purchases/cfg-tracker"              icon="🛋️" label="Special Orders" />
            <NavItem to="/purchases/orders"                   icon="📑" label="Purchase Orders" />
            <NavItem to="/purchases/grn"                      icon="📥" label="GRN" />
            <NavItem to="/sales/fulfillment-queue"      icon="✅" label="Fulfilment Review" />
            <NavItem to="/purchasing/items-to-order"          icon="📋" label="Purchase Planner" />
            <NavItem to="/purchases/procurement-dispatch"      icon="📤" label="Items to Source" />
            {can('canAutoPR') && (
              <NavItem to="/purchases/reorder-suggestions"    icon="🔔" label="Reorder Alerts" />
            )}
            <NavItem to="/purchases/freetext-reviews"         icon="📝" label="Free Text Reviews" />
            {can('canSupplierPerf') && (
              <NavItem to="/purchases/supplier-performance"   icon="📊" label="Supplier Performance" />
            )}
            <NavItem to="/configurator"                       icon="⚙️" label="Configurator Pricing" />
          </NavGroup>
        )}

        {(can('canWarehouse') || can('canSales') || can('canAdmin')) && (
          <NavGroup heading="Warehouse">
            <NavItem to="/sales/delivery-notes"        icon="📦" label="Delivery Notes" />
            {(can('canWarehouse') || can('canAdmin')) && (
              <>
                <NavItem to="/warehouse/delivery-prep"   icon="🚚" label="Delivery Prep" />
                <NavItem to="/warehouse/picking"         icon="📌" label="Stock Pull" />
                <NavItem to="/warehouse/pickup"          icon="📋" label="Pick List" />
              </>
            )}
            {(can('canStockAdmin') || can('canAdmin')) && (
              <>
                <NavItem to="/warehouse/stock-balances"  icon="📊" label="Stock Balances" />
                <NavItem to="/warehouse/stock-ledger"    icon="📒" label="Stock Ledger" />
                <NavItem to="/warehouse/adjustments"     icon="⚖️" label="Adjustments" />
                <NavItem to="/warehouse/transfers"       icon="🔄" label="Transfers" />
              </>
            )}
          </NavGroup>
        )}

        {(can('canVouchers') || can('canAuthorizeVouchers') || can('canAdmin')) && (
          <NavGroup heading="Vouchers">
            {(can('canVouchers') || can('canAdmin')) && (
              <NavItem to="/customers/vouchers"             icon="🎁" label="Gift Vouchers" />
            )}
            {(can('canVouchers') || can('canAdmin')) && (
              <NavItem to="/vouchers/redeem"                icon="💳" label="Redeem Voucher" />
            )}
            {(can('canAuthorizeVouchers') || can('canAdmin')) && (
              <NavItem to="/customers/vouchers/approvals"   icon="✅" label="Voucher Approvals" />
            )}
          </NavGroup>
        )}

        {(can('canService') || can('canAdmin')) && (
          <NavGroup heading="Service">
            <NavItem to="/service/job-cards"  icon="🔧" label="Job Cards" />
            <NavItem to="/service/warranties" icon="🛡️" label="Warranties" />
            <NavItem to="/service/providers"  icon="👷" label="Service Providers" />
          </NavGroup>
        )}

        {(can('canProjects') || can('canSales') || can('canAdmin')) && (
          <NavGroup heading="Projects">
            <NavItem to="/projects" icon="🏗️" label="Fit-Out Projects" />
          </NavGroup>
        )}

        {(can('canOperations') || can('canAdmin')) && (
          <NavGroup heading="Operations">
            <NavItem to="/operations/calendar"     icon="📅" label="Operations Calendar" />
            <NavItem to="/operations/appointments" icon="🗓️" label="Appointments" />
            <NavItem to="/operations/leave"        icon="🏖️" label="Leave Requests" />
            {can('canAdmin') && <NavItem to="/operations/sms-log" icon="📱" label="SMS Log" />}
          </NavGroup>
        )}

        {(can('canCashHandover') || can('canAdmin')) && (
          <NavGroup heading="Cash">
            <NavItem to="/finance/collections" icon="💳" label="Daily Collections" />
            <NavItem to="/finance/handover"    icon="🤝" label="Cash Handover" />
          </NavGroup>
        )}

        {(can('canFinance') || can('canFinanceAccounting') || can('canFinanceReports') || can('canAdmin')) && (
          <NavGroup heading="Finance">
            {(can('canFinanceAccounting') || can('canAdmin')) && (
              <NavItem to="/finance/journals"    icon="📔" label="Journal Entries" />
            )}
            {(can('canFinanceAccounting') || can('canAdmin')) && (
              <NavItem to="/finance/ap-due"      icon="⚠️" label="AP Due" />
            )}
            {(can('canFinance') || can('canAdmin')) && (
              <NavItem to="/finance/bills"       icon="🗂️" label="Bills" />
            )}
            {(can('canFinanceReports') || can('canAdmin')) && (
              <NavItem to="/finance/aged"        icon="📋" label="Aged Debtors / Creditors" />
            )}
            {(can('canFinanceAccounting') || can('canAdmin')) && (
              <NavItem to="/finance/bank-reconciliation" icon="🏦" label="Bank Reconciliation" />
            )}
            {(can('canFinanceReports') || can('canAdmin')) && (
              <NavItem to="/finance/reports"     icon="📈" label="Financial Reports" />
            )}
            {(can('canFinanceReports') || can('canAdmin')) && (
              <NavItem to="/finance/vat-return"  icon="🧾" label="VAT Return" />
            )}
          </NavGroup>
        )}

        {(can('canPriceSupervisor') || can('canConfirmSO')) && (
          <NavGroup heading="Management">
            {can('canConfirmSO') && (
              <NavItem to="/sales/queue" icon="⏳" label="Pending Confirmation" />
            )}
            {can('canPriceSupervisor') && (
              <NavItem to="/supervisor/price-overrides" icon="💲" label="Price Overrides" />
            )}
          </NavGroup>
        )}

        {can('canAdmin') && (
          <NavGroup heading="Admin">
            <NavItem to="/admin/users"               icon="🔑" label="Users &amp; Roles" />
            <NavItem to="/admin/permissions"         icon="🛂" label="Permissions" />
            <NavItem to="/admin/audit-log"           icon="🛡️" label="Audit Log" />
            <NavItem to="/admin/backup-restore"      icon="💾" label="Backup &amp; Restore" />
            <NavItem to="/admin/data-reset"          icon="🔄" label="Data Reset" />
            {user?.name === 'brian@casamoderna.mt' && (
              <a
                href="/app"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 px-3 py-1.5 rounded text-[13px] transition-colors mb-0.5 text-gray-300 hover:bg-gray-800 hover:text-white"
              >
                <span className="text-base leading-none w-5 text-center">⚙️</span>
                <span className="truncate">System Desk</span>
              </a>
            )}
          </NavGroup>
        )}
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
