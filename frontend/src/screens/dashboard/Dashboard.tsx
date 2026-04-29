import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ShoppingCart, FileText, TrendingUp, Wallet, ReceiptText,
  Users, Package, ArrowUpRight, ArrowDownRight, CalendarDays,
  BarChart3, Bell,
} from 'lucide-react'
import { frappe } from '../../api/frappe'
import { usePermissions } from '../../auth/PermissionsProvider'
import { CMSection, CMButton } from '../../components/ui/CMComponents'

// ─── types ────────────────────────────────────────────────────────────────────

interface DashboardData {
  today_order_count: number
  today_order_value: number
  today_invoiced: number
  receivables: number
  pending_so_value: number
  mtd_order_count: number
  mtd_order_value: number
  mtd_invoiced: number
  mtd_quotation_count: number
  mtd_quotation_value: number
  ytd_order_value: number
  last_month_value: number
  open_so_count: number
  open_po_count: number
  low_stock_count: number
  draft_doc_count: number
  sales_trend: Array<{ day: string; total: number }>
  top_products: Array<{ item_code: string; item_name: string; total_sales: number }>
  top_customers: Array<{ customer_name: string; order_count: number; total_value: number }>
  recent_orders: Array<{ name: string; customer_name: string; transaction_date: string; grand_total: number; status: string }>
  latest_products: Array<{ name: string; item_name: string; cm_given_name: string | null; cm_supplier_name: string | null; creation: string }>
}

interface NotifRow {
  name: string
  subject: string
  document_type: string
  document_name: string
  read: 0 | 1
  creation: string
  from_user: string
}

interface NotifData {
  notifications: NotifRow[]
  unread_count: number
}

interface FunnelData {
  quotations: number
  sales_orders: number
  delivery_notes: number
  invoices: number
  qt_to_so_rate: number
  so_to_dn_rate: number
  dn_to_inv_rate: number
  overall_rate: number
}

interface LeagueRow {
  sales_person: string
  total_ex_vat: number
  share_pct: number
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmt(value: number | null | undefined, decimals = 0) {
  if (value == null) return '—'
  return Number(value).toLocaleString('en-MT', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return '—'
  return `€${n.toLocaleString('en-MT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtMoneyK(n: number | null | undefined): string {
  if (n == null) return '—'
  if (Math.abs(n) >= 1000) {
    return `€${(n / 1000).toLocaleString('en-MT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}k`
  }
  return `€${n.toLocaleString('en-MT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function fmtDate(d: string): string {
  if (!d) return '—'
  const parts = d.split('-')
  if (parts.length !== 3) return d
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diffMs / 60000)
  if (m < 2)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d === 1) return 'yesterday'
  if (d < 7)  return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-MT', { day: 'numeric', month: 'short' })
}

function notifLink(docType: string, docName: string): string | null {
  const enc = encodeURIComponent(docName)
  if (docType === 'Sales Order')    return `/sales/orders/${enc}`
  if (docType === 'Sales Invoice')  return `/sales/invoices/${enc}`
  if (docType === 'Quotation')      return `/sales/quotations/${enc}`
  if (docType === 'Purchase Order') return `/purchases/orders/${enc}`
  if (docType === 'CM Customer Appointment') return `/operations/appointments/${enc}/edit`
  if (docType === 'CM Leave Request')        return `/operations/leave/${enc}/edit`
  return null
}

function getDateRange(): { from: string; to: string } {
  const now  = new Date()
  const y    = now.getFullYear()
  const m    = String(now.getMonth() + 1).padStart(2, '0')
  const last = new Date(y, now.getMonth() + 1, 0).getDate()
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${String(last).padStart(2, '0')}` }
}

const STATUS_COLOR: Record<string, string> = {
  'Draft':               'bg-gray-100 text-gray-600',
  'Submitted':           'bg-blue-100 text-blue-700',
  'To Deliver and Bill': 'bg-amber-100 text-amber-700',
  'To Bill':             'bg-orange-100 text-orange-700',
  'To Deliver':          'bg-cyan-100 text-cyan-700',
  'Completed':           'bg-green-100 text-green-700',
  'Cancelled':           'bg-red-100 text-red-600',
}

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLOR[status] ?? 'bg-gray-100 text-gray-600'
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${cls}`}>{status}</span>
}

// ─── sub-components ───────────────────────────────────────────────────────────

type CardColor = 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'gray' | 'teal'

const CARD_STYLES: Record<CardColor, { bg: string; accent: string; icon: string }> = {
  blue:   { bg: 'bg-blue-50',   accent: 'bg-blue-500',   icon: 'text-blue-500' },
  green:  { bg: 'bg-green-50',  accent: 'bg-green-500',  icon: 'text-green-600' },
  amber:  { bg: 'bg-amber-50',  accent: 'bg-amber-500',  icon: 'text-amber-600' },
  red:    { bg: 'bg-red-50',    accent: 'bg-red-500',    icon: 'text-red-500' },
  purple: { bg: 'bg-purple-50', accent: 'bg-purple-500', icon: 'text-purple-600' },
  gray:   { bg: 'bg-gray-50',   accent: 'bg-gray-400',   icon: 'text-gray-500' },
  teal:   { bg: 'bg-teal-50',   accent: 'bg-teal-500',   icon: 'text-teal-600' },
}

function KpiCard({
  label, value, sub, color = 'blue', icon: Icon, trend, onClick,
}: {
  label: string
  value: React.ReactNode
  sub?: string
  color?: CardColor
  icon?: React.ElementType
  trend?: { current: number; previous: number } | null
  onClick?: () => void
}) {
  const s = CARD_STYLES[color]
  const trendPct = trend && trend.previous
    ? ((trend.current - trend.previous) / trend.previous) * 100
    : null

  return (
    <div
      className={`relative rounded-xl border border-gray-100 ${s.bg} overflow-hidden
        ${onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-150' : ''}`}
      onClick={onClick}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${s.accent}`} />
      <div className="pl-4 pr-4 py-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{label}</div>
            <div className="text-2xl font-bold text-gray-800 leading-tight truncate">{value ?? '—'}</div>
            {sub && <div className="text-[11px] text-gray-400 mt-1">{sub}</div>}
          </div>
          {Icon && (
            <div className={`flex-shrink-0 p-2 rounded-lg bg-white/60 ${s.icon}`}>
              <Icon size={18} strokeWidth={1.75} />
            </div>
          )}
        </div>
        {trendPct !== null && (
          <div className={`inline-flex items-center gap-0.5 mt-2 text-[11px] font-semibold rounded-full px-2 py-0.5 ${
            trendPct >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
          }`}>
            {trendPct >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
            {Math.abs(trendPct).toFixed(1)}% vs last month
          </div>
        )}
      </div>
    </div>
  )
}

function SalesTrendChart({ trend, loading }: { trend?: DashboardData['sales_trend']; loading?: boolean }) {
  if (loading) return (
    <div className="flex items-end gap-1.5 h-28">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex-1 bg-gray-100 rounded-t animate-pulse" style={{ height: `${30 + i * 8}%` }} />
      ))}
    </div>
  )
  if (!trend?.length) return <p className="text-[12px] text-gray-400 py-8 text-center">No sales data.</p>

  const maxVal  = Math.max(...trend.map((t) => t.total), 1)
  const total7d = trend.reduce((s, t) => s + t.total, 0)

  return (
    <div>
      <div className="flex items-end gap-1.5 h-28">
        {trend.map((t) => {
          const pct      = Math.round((t.total / maxVal) * 100)
          const shortDay = t.day ? t.day.slice(5).replace('-', '/') : ''
          return (
            <div key={t.day} className="flex flex-col items-center flex-1 gap-1 group">
              <div className="w-full flex items-end justify-center" style={{ height: '96px' }}>
                <div
                  className="w-full rounded-t bg-cm-green opacity-75 group-hover:opacity-100 transition-opacity"
                  style={{ height: `${Math.max(pct, 3)}%` }}
                  title={`${shortDay}: ${fmtMoneyK(t.total)}`}
                />
              </div>
              <div className="text-[9px] text-gray-400 whitespace-nowrap">{shortDay}</div>
            </div>
          )
        })}
      </div>
      <div className="flex justify-between mt-3 pt-2 border-t border-gray-100 text-[11px] text-gray-500">
        <span>7-day total: <strong className="text-gray-700">{fmtMoneyK(total7d)}</strong></span>
        <span>Daily avg: <strong className="text-gray-700">{fmtMoneyK(total7d / Math.max(trend.length, 1))}</strong></span>
      </div>
    </div>
  )
}

function FunnelSection({ funnel }: { funnel: FunnelData }) {
  const steps = [
    { label: 'Quotations',     count: funnel.quotations,     rate: null,                  color: 'bg-blue-400',   barBg: 'bg-blue-100' },
    { label: 'Sales Orders',   count: funnel.sales_orders,   rate: funnel.qt_to_so_rate,  color: 'bg-green-500',  barBg: 'bg-green-100' },
    { label: 'Delivery Notes', count: funnel.delivery_notes, rate: funnel.so_to_dn_rate,  color: 'bg-amber-400',  barBg: 'bg-amber-100' },
    { label: 'Invoices',       count: funnel.invoices,       rate: funnel.dn_to_inv_rate, color: 'bg-purple-500', barBg: 'bg-purple-100' },
  ]
  const maxCount = Math.max(...steps.map((s) => s.count), 1)

  return (
    <div className="space-y-3">
      {steps.map((step, i) => (
        <div key={step.label}>
          <div className="flex items-center justify-between text-xs mb-1">
            <div className="flex items-center gap-2">
              <span className="text-gray-700 font-medium">{step.label}</span>
              {step.rate !== null && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                  step.rate >= 70 ? 'bg-green-100 text-green-700'
                    : step.rate >= 40 ? 'bg-amber-100 text-amber-700'
                    : 'bg-red-100 text-red-600'
                }`}>{step.rate}% conv.</span>
              )}
            </div>
            <span className="font-bold text-gray-800">{step.count}</span>
          </div>
          <div className={`h-2.5 ${step.barBg} rounded-full overflow-hidden`}>
            <div
              className={`h-full rounded-full ${step.color} transition-all duration-500`}
              style={{ width: `${Math.max((step.count / maxCount) * 100, step.count > 0 ? 2 : 0)}%` }}
            />
          </div>
          {i < steps.length - 1 && step.count > 0 && (
            <div className="flex justify-end mt-0.5 pr-1 text-[9px] text-gray-400">↓</div>
          )}
        </div>
      ))}
      {funnel.overall_rate > 0 && (
        <div className="mt-3 pt-2 border-t border-gray-100 text-center">
          <span className="text-[11px] text-gray-500">Overall QT → Invoice: </span>
          <span className={`text-[11px] font-bold ${funnel.overall_rate >= 50 ? 'text-green-600' : 'text-amber-600'}`}>
            {funnel.overall_rate}%
          </span>
        </div>
      )}
    </div>
  )
}

function NotifPanel({
  notifs, onMarkAll, onDeleteRead, onMarkOne,
}: {
  notifs: NotifRow[]
  onMarkAll: () => void
  onDeleteRead: () => void
  onMarkOne: (name: string) => void
}) {
  const navigate = useNavigate()
  const unread   = notifs.filter((n) => !n.read)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-100">
        <div className="flex items-center gap-1.5">
          <Bell size={14} className="text-gray-500" />
          <span className="text-sm font-semibold text-gray-700">Notifications</span>
          {unread.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-bold">
              {unread.length}
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {unread.length > 0 && (
            <button type="button" onClick={onMarkAll}
              className="text-[10px] text-gray-400 hover:text-gray-600 px-1.5 py-0.5 rounded">
              Mark all read
            </button>
          )}
          <button type="button" onClick={onDeleteRead}
            className="text-[10px] text-gray-400 hover:text-red-500 px-1.5 py-0.5 rounded">
            Clear read
          </button>
        </div>
      </div>
      {notifs.length === 0 ? (
        <p className="text-xs text-gray-400 pt-2">No notifications.</p>
      ) : (
        <div className="space-y-1 overflow-y-auto flex-1">
          {notifs.map((n) => {
            const link = notifLink(n.document_type, n.document_name)
            return (
              <div
                key={n.name}
                onClick={() => { if (!n.read) onMarkOne(n.name); if (link) navigate(link) }}
                className={`rounded-lg p-2.5 text-xs transition-colors ${
                  link ? 'cursor-pointer' : 'cursor-default'
                } ${n.read ? 'text-gray-400 hover:bg-gray-50' : 'bg-blue-50 text-gray-700 hover:bg-blue-100 font-medium'}`}
              >
                <div className="flex items-start gap-1.5">
                  {!n.read && <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-500 flex-shrink-0" />}
                  <div className={!n.read ? '' : 'pl-3'}>
                    <span className="text-[10px] text-gray-400 font-normal mr-1">{n.document_type}</span>
                    {n.subject}
                    <div className="text-[9px] text-gray-400 mt-0.5">{timeAgo(n.creation)}</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── main component ───────────────────────────────────────────────────────────

export function Dashboard() {
  const navigate      = useNavigate()
  const { can }       = usePermissions()
  const canFinance    = can('canFinanceReports')
  const canPurchasing = can('canPurchasing')
  const canWarehouse  = can('canWarehouse')
  const canSeePricing = can('canSeePricing') || can('canSales')

  const [kpi,        setKpi]        = useState<DashboardData | null>(null)
  const [notifData,  setNotifData]  = useState<NotifData | null>(null)
  const [funnel,     setFunnel]     = useState<FunnelData | null>(null)
  const [league,     setLeague]     = useState<LeagueRow[]>([])
  const [loading,    setLoading]    = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [kpiRes, notifRes] = await Promise.all([
        frappe.callGet<DashboardData>('casamoderna_dms.session_api.get_dashboard_kpis', {}),
        frappe.callGet<NotifData>('casamoderna_dms.session_api.get_my_notifications', {}),
      ])
      if (kpiRes)   setKpi(kpiRes)
      if (notifRes) setNotifData(notifRes)

      if (canFinance) {
        const { from, to } = getDateRange()
        const [funnelRes, leagueRes] = await Promise.all([
          frappe.call<FunnelData>('casamoderna_dms.analytics_api.get_sales_funnel', { date_from: from, date_to: to }),
          frappe.call<LeagueRow[]>('casamoderna_dms.analytics_api.get_salesperson_league', { date_from: from, date_to: to }),
        ])
        if (funnelRes) setFunnel(funnelRes)
        if (leagueRes) setLeague(Array.isArray(leagueRes) ? leagueRes : [])
      }
    } catch { /* silently fail — partial data shown */ }
    finally { setLoading(false) }
  }, [canFinance])

  useEffect(() => { void loadData() }, [loadData, refreshKey])

  const handleMarkAll = async () => {
    await frappe.call('casamoderna_dms.session_api.mark_all_notifications_read', {})
    setNotifData((prev) =>
      prev ? { ...prev, notifications: prev.notifications.map((n) => ({ ...n, read: 1 as const })), unread_count: 0 } : prev
    )
  }
  const handleDeleteRead = async () => {
    await frappe.call('casamoderna_dms.session_api.delete_read_notifications', {})
    setNotifData((prev) =>
      prev ? { ...prev, notifications: prev.notifications.filter((n) => !n.read) } : prev
    )
  }
  const handleMarkOne = async (name: string) => {
    await frappe.call('casamoderna_dms.session_api.mark_notifications_read', { names: JSON.stringify([name]) })
    setNotifData((prev) =>
      prev ? {
        ...prev,
        notifications: prev.notifications.map((n) => n.name === name ? { ...n, read: 1 as const } : n),
        unread_count: Math.max(0, (prev.unread_count ?? 1) - 1),
      } : prev
    )
  }

  const topMax   = kpi?.top_products?.length  ? Math.max(...kpi.top_products.map((p)  => p.total_sales),  1) : 1
  const custMax  = kpi?.top_customers?.length ? Math.max(...kpi.top_customers.map((c) => c.total_value),  1) : 1
  const unreadCount = notifData?.unread_count ?? 0

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          {unreadCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-500 text-[10px] font-bold">
              🔔 {unreadCount} new
            </span>
          )}
        </div>
        <button type="button"
          className="text-[12px] text-gray-400 hover:text-cm-green transition-colors"
          onClick={() => setRefreshKey((k) => k + 1)}>
          ↻ Refresh
        </button>
      </div>

      {loading && !kpi && (
        <div className="py-16 text-center text-sm text-gray-400 animate-pulse">Loading dashboard…</div>
      )}

      {kpi && (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">

          {/* ── Main content (3/4) ── */}
          <div className="xl:col-span-3 space-y-6">

            {/* Today */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <CalendarDays size={14} className="text-gray-400" />
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Today</h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <KpiCard label="Orders" value={kpi.today_order_count}
                  sub={fmtMoneyK(kpi.today_order_value)} color="blue" icon={ShoppingCart}
                  onClick={() => navigate('/sales/orders')} />
                {canSeePricing && (
                  <KpiCard label="Invoiced Today" value={fmtMoneyK(kpi.today_invoiced)}
                    color="green" icon={ReceiptText} onClick={() => navigate('/sales/invoices')} />
                )}
                {canSeePricing && (
                  <KpiCard label="Receivables" value={fmtMoneyK(kpi.receivables)}
                    color="amber" icon={Wallet} onClick={() => navigate('/finance/aged')} />
                )}
              </div>
            </div>

            {/* Sales This Month */}
            {canSeePricing && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp size={14} className="text-gray-400" />
                  <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Sales — This Month</h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <KpiCard label="Orders (MTD)" value={fmtMoneyK(kpi.mtd_order_value)}
                    sub={`${kpi.mtd_order_count} order${kpi.mtd_order_count !== 1 ? 's' : ''}`}
                    color="green" icon={ShoppingCart}
                    trend={{ current: kpi.mtd_order_value, previous: kpi.last_month_value }}
                    onClick={() => navigate('/sales/orders')} />
                  <KpiCard label="Invoiced (MTD)" value={fmtMoneyK(kpi.mtd_invoiced)}
                    color="blue" icon={ReceiptText} onClick={() => navigate('/sales/invoices')} />
                  <KpiCard label="Quotations (MTD)" value={kpi.mtd_quotation_count}
                    sub={fmtMoneyK(kpi.mtd_quotation_value)}
                    color="teal" icon={FileText} />
                  <KpiCard label="YTD Sales" value={fmtMoneyK(kpi.ytd_order_value)}
                    sub={`Last month: ${fmtMoneyK(kpi.last_month_value)}`}
                    color="purple" icon={BarChart3} />
                </div>
              </div>
            )}

            {/* 7-day chart + Top Products + Top Customers */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {(kpi.sales_trend?.length ?? 0) > 0 && (
                <CMSection title="Last 7 Days">
                  <SalesTrendChart trend={kpi.sales_trend} />
                </CMSection>
              )}
              {(kpi.top_products?.length ?? 0) > 0 && (
                <CMSection title="Top Products">
                  <div className="space-y-2.5">
                    {kpi.top_products.slice(0, 6).map((p, i) => (
                      <div key={p.item_code} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-400 w-3 flex-shrink-0 font-medium">{i + 1}</span>
                          <span className="text-xs text-gray-700 truncate flex-1 cursor-pointer hover:text-cm-green"
                            onClick={() => navigate(`/products/${encodeURIComponent(p.item_code)}`)}>
                            {p.item_name || p.item_code}
                          </span>
                          {canSeePricing && (
                            <span className="text-[11px] text-gray-500 font-medium flex-shrink-0">
                              {fmtMoneyK(p.total_sales)}
                            </span>
                          )}
                        </div>
                        {canSeePricing && (
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden ml-5">
                            <div className="h-full rounded-full bg-cm-green opacity-60"
                              style={{ width: `${Math.round((p.total_sales / topMax) * 100)}%` }} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CMSection>
              )}
              {(kpi.top_customers?.length ?? 0) > 0 && canSeePricing && (
                <CMSection title="Top Customers">
                  <div className="space-y-2.5">
                    {kpi.top_customers.map((c, i) => (
                      <div key={c.customer_name} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-400 w-3 flex-shrink-0 font-medium">{i + 1}</span>
                          <span className="text-xs text-gray-700 truncate flex-1 cursor-pointer hover:text-cm-green"
                            onClick={() => navigate(`/customers?search=${encodeURIComponent(c.customer_name)}`)}>
                            {c.customer_name}
                          </span>
                          <span className="text-[11px] text-gray-500 font-medium flex-shrink-0">
                            {fmtMoneyK(c.total_value)}
                          </span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden ml-5">
                          <div className="h-full rounded-full bg-purple-400 opacity-70"
                            style={{ width: `${Math.round((c.total_value / custMax) * 100)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </CMSection>
              )}
            </div>

            {/* Recent Orders */}
            {(kpi.recent_orders?.length ?? 0) > 0 && (
              <CMSection title="Recent Orders">
                <div className="overflow-x-auto rounded-lg border border-gray-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="px-3 py-2.5 text-left font-semibold text-gray-500 text-xs">Order</th>
                        <th className="px-3 py-2.5 text-left font-semibold text-gray-500 text-xs">Customer</th>
                        <th className="px-3 py-2.5 text-left font-semibold text-gray-500 text-xs">Date</th>
                        {canSeePricing && (
                          <th className="px-3 py-2.5 text-right font-semibold text-gray-500 text-xs">Total</th>
                        )}
                        <th className="px-3 py-2.5 text-left font-semibold text-gray-500 text-xs">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {kpi.recent_orders.map((o) => (
                        <tr key={o.name} className="hover:bg-gray-50 cursor-pointer transition-colors"
                          onClick={() => navigate(`/sales/orders/${o.name}`)}>
                          <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{o.name}</td>
                          <td className="px-3 py-2.5 text-gray-800 font-medium">{o.customer_name}</td>
                          <td className="px-3 py-2.5 text-gray-500 text-xs">{fmtDate(o.transaction_date)}</td>
                          {canSeePricing && (
                            <td className="px-3 py-2.5 text-right tabular-nums text-gray-800 font-semibold">
                              {fmtMoney(o.grand_total)}
                            </td>
                          )}
                          <td className="px-3 py-2.5"><StatusBadge status={o.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 text-right">
                  <CMButton variant="ghost" onClick={() => navigate('/sales/orders')}>All orders →</CMButton>
                </div>
              </CMSection>
            )}

            {/* Analytics — Finance only */}
            {canFinance && (funnel || league.length > 0) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {funnel && (
                  <CMSection title="Sales Funnel — This Month">
                    <FunnelSection funnel={funnel} />
                  </CMSection>
                )}
                <CMSection title="Salesperson League — This Month">
                  {league.length > 0 ? (
                    <div className="space-y-3">
                      {league.slice(0, 6).map((row, i) => (
                        <div key={row.sales_person} className="flex items-center gap-2">
                          <span className={`text-[11px] w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 font-bold ${
                            i === 0 ? 'bg-amber-100 text-amber-700'
                              : i === 1 ? 'bg-gray-100 text-gray-600'
                              : i === 2 ? 'bg-orange-100 text-orange-600'
                              : 'bg-gray-50 text-gray-400'
                          }`}>{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-gray-700 truncate font-medium">{row.sales_person}</span>
                              <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                                <span className="text-gray-700 font-semibold">{fmtMoneyK(row.total_ex_vat)}</span>
                                <span className="text-[10px] text-gray-400">({row.share_pct?.toFixed(1)}%)</span>
                              </div>
                            </div>
                            <div className="h-1.5 bg-gray-100 rounded-full mt-1">
                              <div className="h-full rounded-full bg-cm-green transition-all duration-500"
                                style={{ width: `${row.share_pct}%` }} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 pt-1">No sales data for this period.</p>
                  )}
                </CMSection>
              </div>
            )}

            {/* Quick Links */}
            <div>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Quick Links</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {([
                  { label: 'New Quotation',      path: '/sales/quotations/new',          show: true,                          icon: FileText     },
                  { label: 'New Sales Order',    path: '/sales/orders/new',              show: true,                          icon: ShoppingCart },
                  { label: 'Product Catalogue',  path: '/products',                      show: true,                          icon: Package      },
                  { label: 'All Customers',      path: '/customers',                     show: true,                          icon: Users        },
                  { label: 'New Purchase Order', path: '/purchases/orders/new',          show: canPurchasing,                 icon: FileText     },
                  { label: 'Fulfillment Queue',  path: '/purchasing/fulfillment-review', show: canPurchasing || canWarehouse, icon: Package      },
                  { label: 'Delivery Notes',     path: '/warehouse/delivery-notes',      show: canWarehouse,                  icon: Package      },
                  { label: 'Stock Balances',     path: '/warehouse/stock-balances',      show: canWarehouse,                  icon: BarChart3    },
                ] as const).filter((s) => s.show).map((s) => (
                  <button key={s.path} type="button" onClick={() => navigate(s.path)}
                    className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-medium text-gray-700 hover:border-cm-green hover:text-cm-green hover:shadow-sm transition-all text-left group">
                    <s.icon size={15} className="text-gray-400 group-hover:text-cm-green flex-shrink-0 transition-colors" />
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

          </div>

          {/* ── Notifications (1/4) ── */}
          <div className="xl:col-span-1">
            <div className="rounded-xl border border-gray-200 bg-white p-4 h-full min-h-[300px] shadow-sm">
              <NotifPanel
                notifs={notifData?.notifications ?? []}
                onMarkAll={() => void handleMarkAll()}
                onDeleteRead={() => void handleDeleteRead()}
                onMarkOne={(name) => void handleMarkOne(name)}
              />
            </div>
          </div>

        </div>
      )}
    </div>
  )
}


