import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import { usePermissions } from '../../auth/PermissionsProvider'
import { fmtMoney } from '../../utils/fmt'

interface DashboardData {
  today_order_count: number
  today_order_value: number
  today_invoiced: number
  receivables: number
  pending_so_value: number
  open_so_count: number
  open_po_count: number
  low_stock_count: number
  draft_doc_count: number
  sales_trend: Array<{ day: string; total: number }>
  top_products: Array<{ item_code: string; item_name: string; total_sales: number }>
  recent_orders: Array<{ name: string; customer_name: string; transaction_date: string; grand_total: number; status: string }>
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

function notifLink(docType: string, docName: string): string | null {
  const enc = encodeURIComponent(docName)
  if (docType === 'CM Customer Appointment') return `/operations/appointments/${enc}/edit`
  if (docType === 'CM Leave Request')         return `/operations/leave/${enc}/edit`
  return null
}

function fmt(value: number | null | undefined, decimals = 0) {
  if (value == null) return '—'
  return Number(value).toLocaleString('en-MT', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function KpiCard({
  label, value, subtitle, accent = 'bg-cm-green', onClick, loading,
}: {
  label: string; value?: string | null; subtitle?: string; accent?: string; onClick?: () => void; loading?: boolean
}) {
  return (
    <button type="button" onClick={onClick}
      className={`text-left rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 ${onClick ? 'cursor-pointer' : 'cursor-default'}`}>
      <div className={`h-1 w-8 rounded-full ${accent} mb-3`} />
      <div className="text-2xl font-bold tabular-nums text-gray-900 mb-0.5 leading-none">
        {loading
          ? <span className="inline-block h-7 w-16 bg-gray-100 rounded animate-pulse" />
          : (value ?? '—')}
      </div>
      <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{label}</div>
      {subtitle && <div className="text-[11px] text-gray-400 mt-0.5">{subtitle}</div>}
    </button>
  )
}

function SalesChart({ trend, loading }: { trend?: DashboardData['sales_trend']; loading?: boolean }) {
  if (loading) return (
    <div className="flex items-end gap-1.5 h-28">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex-1 bg-gray-100 rounded-t animate-pulse" style={{ height: `${30 + i * 8}%` }} />
      ))}
    </div>
  )
  if (!trend?.length) return <p className="text-[12px] text-gray-400 py-8 text-center">No sales data.</p>

  const days: Array<{ day: string; total: number }> = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const found = trend.find((r) => r.day === key)
    days.push({ day: key, total: found?.total ?? 0 })
  }
  const max = Math.max(...days.map((d) => d.total), 1)

  return (
    <div className="flex items-end gap-1.5 h-28">
      {days.map(({ day, total }) => {
        const pct = Math.max((total / max) * 100, total > 0 ? 4 : 0)
        const label = new Date(day + 'T12:00:00').toLocaleDateString('en-MT', { weekday: 'short' })
        return (
          <div key={day} className="flex flex-col items-center gap-1 flex-1">
            <div className="w-full rounded-t bg-cm-green transition-all"
              style={{ height: `${pct}%`, minHeight: total > 0 ? '4px' : '0' }}
              title={`${day}: ${fmtMoney(total)}`} />
            <span className="text-[9px] text-gray-400">{label}</span>
          </div>
        )
      })}
    </div>
  )
}

function TopProducts({ products, loading }: { products?: DashboardData['top_products']; loading?: boolean }) {
  if (loading) return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-8 bg-gray-50 rounded animate-pulse" />)}
    </div>
  )
  if (!products?.length) return <p className="text-[12px] text-gray-400">No product data yet.</p>
  const max = Math.max(...products.map((p) => p.total_sales), 1)
  return (
    <div className="space-y-2">
      {products.map((p, i) => (
        <div key={p.item_code} className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-gray-300 w-4 shrink-0">{i + 1}</span>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold text-gray-800 truncate">{p.item_name}</div>
            <div className="mt-0.5 h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full bg-cm-green" style={{ width: `${(p.total_sales / max) * 100}%` }} />
            </div>
          </div>
          <span className="text-[11px] font-semibold text-gray-700 tabular-nums shrink-0">{fmtMoney(p.total_sales)}</span>
        </div>
      ))}
    </div>
  )
}

const STATUS_COLOUR: Record<string, string> = {
  'To Deliver and Bill': 'bg-blue-100 text-blue-700',
  'To Bill':             'bg-amber-100 text-amber-700',
  'To Deliver':          'bg-indigo-100 text-indigo-700',
  'Completed':           'bg-green-100 text-green-700',
  'Cancelled':           'bg-red-100 text-red-600',
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-3">
      {children}
    </h2>
  )
}

function NotificationsPanel({
  notifs, unreadCount, onMarkAllRead, onDeleteRead, onMarkOne, onNavigate,
}: {
  notifs: NotifRow[]
  unreadCount: number
  onMarkAllRead: () => void
  onDeleteRead: () => void
  onMarkOne: (n: NotifRow) => void
  onNavigate: (path: string) => void
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col h-full min-h-[420px]">
      {/* Panel header */}
      <div className="flex items-center gap-2 px-5 pt-5 pb-3 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Notifications</span>
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold tabular-nums">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {unreadCount > 0 && (
            <button type="button" onClick={onMarkAllRead}
              className="text-[11px] text-cm-green hover:underline">
              Mark all read
            </button>
          )}
          {notifs.some((n) => n.read) && (
            <button type="button" onClick={onDeleteRead}
              className="text-[11px] text-red-400 hover:underline">
              Delete read
            </button>
          )}
        </div>
      </div>

      {/* Notification list */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {notifs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-10 text-center">
            <span className="text-3xl mb-2">🔔</span>
            <p className="text-[12px] text-gray-400">No notifications yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {notifs.map((n) => {
              const link = notifLink(n.document_type, n.document_name)
              const isUnread = !n.read
              return (
                <button key={n.name} type="button"
                  className={`w-full text-left flex items-start gap-2.5 py-3 px-2 rounded hover:bg-gray-50 transition-colors ${isUnread ? '' : 'opacity-60'}`}
                  onClick={() => {
                    onMarkOne(n)
                    if (link) onNavigate(link)
                  }}
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full transition-colors ${isUnread ? 'bg-cm-green' : 'bg-gray-200'}`} />
                  <div className="flex-1 min-w-0">
                    <div className={`text-[12px] leading-snug ${isUnread ? 'font-semibold text-gray-800' : 'font-normal text-gray-600'}`}>
                      {n.subject}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      {n.creation
                        ? new Date(n.creation).toLocaleString('en-MT', {
                            month: 'short', day: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })
                        : ''}
                      {n.from_user && (
                        <span className="ml-1.5 text-gray-300">· {n.from_user}</span>
                      )}
                    </div>
                  </div>
                  {link && (
                    <span className="text-gray-300 text-sm mt-0.5 shrink-0">›</span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export function Dashboard() {
  const navigate = useNavigate()
  const { can } = usePermissions()

  const [data,        setData]        = useState<DashboardData | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [refreshKey,  setRefreshKey]  = useState(0)
  const [notifs,      setNotifs]      = useState<NotifRow[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  const loadNotifs = useCallback(async () => {
    try {
      const res = await frappe.callGet<{ notifications: NotifRow[]; unread_count: number }>(
        'casamoderna_dms.session_api.get_my_notifications',
      )
      setNotifs(res.notifications ?? [])
      setUnreadCount(res.unread_count ?? 0)
    } catch { /* silent */ }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await frappe.callGet<DashboardData>('casamoderna_dms.session_api.get_dashboard_kpis')
      setData(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    void loadNotifs()
  }, [load, loadNotifs, refreshKey])

  const markAllRead = async () => {
    try {
      await frappe.call('casamoderna_dms.session_api.mark_all_notifications_read')
      setNotifs((ns) => ns.map((n) => ({ ...n, read: 1 as const })))
      setUnreadCount(0)
    } catch { /* silent */ }
  }

  const deleteRead = async () => {
    try {
      await frappe.call('casamoderna_dms.session_api.delete_read_notifications')
      setNotifs((ns) => ns.filter((n) => !n.read))
    } catch { /* silent */ }
  }

  const markOne = async (n: NotifRow) => {
    if (n.read) return
    try {
      await frappe.call('casamoderna_dms.session_api.mark_notifications_read', {
        names: JSON.stringify([n.name]),
      })
      setNotifs((ns) => ns.map((x) => x.name === n.name ? { ...x, read: 1 as const } : x))
      setUnreadCount((c) => Math.max(0, c - 1))
    } catch { /* silent */ }
  }

  const d = data

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold tabular-nums">
              {unreadCount} new
            </span>
          )}
        </div>
        <button type="button" className="text-[12px] text-cm-green hover:underline"
          onClick={() => setRefreshKey((k) => k + 1)}>
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{error}</div>
      )}

      {/* ── Main two-column layout: KPIs + Quick Links | Notifications ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">

        {/* Left column: KPIs + quick links */}
        <div className="lg:col-span-2 space-y-5">

          {/* Today KPIs */}
          <div>
            <SectionLabel>Today</SectionLabel>
            <div className="grid grid-cols-2 gap-4">
              <KpiCard label="Orders placed" loading={loading}
                value={d ? `${fmt(d.today_order_count)} · ${fmtMoney(d.today_order_value)}` : null}
                subtitle="Submitted SOs today" accent="bg-cm-green"
                onClick={() => navigate('/sales/orders')} />
              <KpiCard label="Invoiced today" loading={loading}
                value={d ? fmtMoney(d.today_invoiced) : null}
                subtitle="Sales invoices" accent="bg-emerald-400" />
              <KpiCard label="Receivables" loading={loading}
                value={d ? fmtMoney(d.receivables) : null}
                subtitle="Outstanding on invoices" accent="bg-amber-400"
                onClick={() => navigate('/finance/aged')} />
              <KpiCard label="Pending SO value" loading={loading}
                value={d ? fmtMoney(d.pending_so_value) : null}
                subtitle="Open SOs to deliver/bill" accent="bg-blue-400"
                onClick={() => navigate('/sales/orders')} />
            </div>
          </div>

          {/* Operations KPIs */}
          <div>
            <SectionLabel>Operations</SectionLabel>
            <div className="grid grid-cols-2 gap-4">
              <KpiCard label="Open Sales Orders" loading={loading}
                value={d ? fmt(d.open_so_count) : null}
                subtitle="To deliver or bill" accent="bg-cm-green"
                onClick={() => navigate('/sales/orders')} />
              {(can('canPurchasing') || can('canWarehouse')) && (
                <KpiCard label="Open Purchase Orders" loading={loading}
                  value={d ? fmt(d.open_po_count) : null}
                  subtitle="To receive or bill" accent="bg-amber-400"
                  onClick={() => navigate('/purchases/orders')} />
              )}
              {can('canWarehouse') && (
                <KpiCard label="Low Stock Items" loading={loading}
                  value={d ? fmt(d.low_stock_count) : null}
                  subtitle="At or below reorder level" accent="bg-red-400"
                  onClick={() => navigate('/warehouse/stock-balances')} />
              )}
              <KpiCard label="Draft Documents" loading={loading}
                value={d ? fmt(d.draft_doc_count) : null}
                subtitle="Unsaved drafts (QT/SO/PO)" accent="bg-gray-400" />
            </div>
          </div>

          {/* Quick shortcuts */}
          <div>
            <SectionLabel>Quick Links</SectionLabel>
            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: '👥', label: 'Customers',       to: '/customers' },
                { icon: '📋', label: 'Quotations',      to: '/sales/quotations' },
                { icon: '📦', label: 'Sales Orders',    to: '/sales/orders' },
                { icon: '🧾', label: 'Invoices',        to: '/sales/invoices' },
                { icon: '🚚', label: 'Deliveries',      to: '/sales/delivery-notes' },
                { icon: '🛋️', label: 'Products',        to: '/products' },
              ].map((s) => (
                <button key={s.to} type="button" onClick={() => navigate(s.to)}
                  className="flex items-center gap-2 text-left rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
                  <span className="text-lg shrink-0 leading-none">{s.icon}</span>
                  <span className="text-[12px] font-semibold text-gray-800 truncate">{s.label}</span>
                  <span className="ml-auto text-gray-300 text-sm">›</span>
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Right column: Notifications (stretches to match left column height) */}
        <div className="lg:col-span-1">
          <NotificationsPanel
            notifs={notifs}
            unreadCount={unreadCount}
            onMarkAllRead={markAllRead}
            onDeleteRead={deleteRead}
            onMarkOne={markOne}
            onNavigate={(path) => navigate(path)}
          />
        </div>

      </div>

      {/* ── Sales Trend + Top Products ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-4">Sales Trend — Last 7 Days</h2>
          <SalesChart trend={d?.sales_trend} loading={loading} />
          {!loading && d?.sales_trend?.length ? (
            <p className="text-[10px] text-gray-400 mt-2">
              Total:{' '}
              <span className="font-semibold text-gray-600">
                {fmtMoney(d.sales_trend.reduce((s, r) => s + (r.total || 0), 0))}
              </span>
            </p>
          ) : null}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-4">Top Products</h2>
          <TopProducts products={d?.top_products} loading={loading} />
        </div>
      </div>

      {/* ── Recent Orders ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Recent Sales Orders</h2>
          <button type="button" className="text-[11px] text-cm-green hover:underline"
            onClick={() => navigate('/sales/orders')}>
            View all
          </button>
        </div>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-gray-50 rounded animate-pulse" />)}
          </div>
        ) : !d?.recent_orders?.length ? (
          <p className="text-[12px] text-gray-400">No recent orders.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                  <th className="text-left pb-2 px-1">Order</th>
                  <th className="text-left pb-2 px-1">Customer</th>
                  <th className="text-left pb-2 px-1 hidden sm:table-cell">Date</th>
                  <th className="text-right pb-2 px-1">Total</th>
                  <th className="text-right pb-2 px-1">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {d.recent_orders.map((o) => (
                  <tr key={o.name} className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/sales/orders/${encodeURIComponent(o.name)}`)}>
                    <td className="py-2 px-1 font-mono font-semibold text-gray-800">{o.name}</td>
                    <td className="py-2 px-1 text-gray-600 truncate max-w-[120px]">{o.customer_name}</td>
                    <td className="py-2 px-1 text-gray-400 hidden sm:table-cell">
                      {o.transaction_date
                        ? new Date(o.transaction_date).toLocaleDateString('en-MT', { day: 'numeric', month: 'short' })
                        : '—'}
                    </td>
                    <td className="py-2 px-1 text-right font-semibold tabular-nums">{fmtMoney(o.grand_total)}</td>
                    <td className="py-2 px-1 text-right">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${STATUS_COLOUR[o.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {o.status || '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}
