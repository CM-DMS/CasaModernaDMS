import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import { usePermissions } from '../../auth/PermissionsProvider'
import { fmtMoney } from '../../utils/fmt'

// ─── types ────────────────────────────────────────────────────────────────────

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

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmt(value: number | null | undefined, decimals = 0) {
  if (value == null) return '—'
  return Number(value).toLocaleString('en-MT', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
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
  if (docType === 'CM Customer Appointment') return `/operations/appointments/${enc}/edit`
  if (docType === 'CM Leave Request')         return `/operations/leave/${enc}/edit`
  return null
}

const STATUS_COLOUR: Record<string, string> = {
  'To Deliver and Bill': 'bg-blue-50 text-blue-700',
  'To Bill':             'bg-amber-50 text-amber-700',
  'To Deliver':          'bg-indigo-50 text-indigo-700',
  'Completed':           'bg-green-50 text-green-700',
  'Cancelled':           'bg-red-50 text-red-500',
}

// ─── sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, accent, onClick, loading,
}: {
  label: string
  value?: string | null
  sub?: string
  accent: string
  onClick?: () => void
  loading?: boolean
}) {
  return (
    <button type="button" onClick={onClick}
      className={`text-left w-full rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden
        transition-all hover:shadow-md hover:-translate-y-0.5 ${onClick ? 'cursor-pointer' : 'cursor-default'}`}>
      <div className={`h-1.5 w-full ${accent}`} />
      <div className="p-4 pt-3">
        <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{label}</div>
        <div className="text-2xl font-bold tabular-nums text-gray-900 leading-none mb-1">
          {loading
            ? <span className="inline-block h-7 w-20 bg-gray-100 rounded animate-pulse" />
            : (value ?? '—')}
        </div>
        {sub && <div className="text-[11px] text-gray-400">{sub}</div>}
      </div>
    </button>
  )
}

function SalesTrendChart({ trend, loading }: { trend?: DashboardData['sales_trend']; loading?: boolean }) {
  if (loading) return (
    <div className="flex items-end gap-1.5 h-40">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex-1 bg-gray-100 rounded-t-lg animate-pulse" style={{ height: `${25 + i * 10}%` }} />
      ))}
    </div>
  )
  if (!trend?.length) return (
    <div className="h-40 flex items-center justify-center">
      <p className="text-[12px] text-gray-400">No sales data for the past 7 days.</p>
    </div>
  )

  const days: Array<{ day: string; total: number }> = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const found = trend.find((r) => r.day === key)
    days.push({ day: key, total: found?.total ?? 0 })
  }
  const max = Math.max(...days.map((d) => d.total), 1)
  const total = days.reduce((s, d) => s + d.total, 0)
  const todayKey = new Date().toISOString().slice(0, 10)

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2 h-40">
        {days.map(({ day, total: dayTotal }) => {
          const pct = Math.max((dayTotal / max) * 100, dayTotal > 0 ? 3 : 0)
          const isToday = day === todayKey
          const label = new Date(day + 'T12:00:00').toLocaleDateString('en-MT', { weekday: 'short' })
          return (
            <div key={day} className="flex flex-col items-center gap-1.5 flex-1">
              {dayTotal > 0 && (
                <span className="text-[9px] font-semibold text-gray-400 tabular-nums leading-none">
                  {fmtMoney(dayTotal, 0)}
                </span>
              )}
              <div className="w-full flex-1 flex items-end">
                <div
                  className={`w-full rounded-t-lg transition-all ${isToday ? 'bg-cm-green' : 'bg-cm-green/35'}`}
                  style={{ height: `${pct}%`, minHeight: dayTotal > 0 ? '6px' : '0' }}
                  title={`${day}: ${fmtMoney(dayTotal)}`}
                />
              </div>
              <span className={`text-[10px] font-medium ${isToday ? 'text-cm-green font-bold' : 'text-gray-400'}`}>
                {label}
              </span>
            </div>
          )
        })}
      </div>
      {total > 0 && (
        <div className="flex items-center justify-between border-t border-gray-50 pt-2.5">
          <span className="text-[11px] text-gray-400">7-day total</span>
          <span className="text-[13px] font-bold text-gray-800 tabular-nums">{fmtMoney(total)}</span>
        </div>
      )}
    </div>
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
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm flex flex-col overflow-hidden" style={{ maxHeight: '364px' }}>
      <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-gray-50 shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Notifications</span>
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-red-500 text-white text-[9px] font-bold tabular-nums">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {unreadCount > 0 && (
            <button type="button" onClick={onMarkAllRead}
              className="text-[10px] text-cm-green hover:underline font-medium">
              Mark all read
            </button>
          )}
          {notifs.some((n) => n.read) && (
            <button type="button" onClick={onDeleteRead}
              className="text-[10px] text-gray-400 hover:text-red-400 hover:underline">
              Clear read
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {notifs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center px-4">
            <div className="text-3xl mb-2 opacity-25">🔔</div>
            <p className="text-[11px] text-gray-400">You're all caught up.</p>
          </div>
        ) : (
          <div>
            {notifs.map((n) => {
              const link = notifLink(n.document_type, n.document_name)
              const isUnread = !n.read
              return (
                <button key={n.name} type="button"
                  className={`w-full text-left flex items-start gap-3 px-4 py-3 border-b border-gray-50 last:border-0
                    hover:bg-gray-50 transition-colors ${isUnread ? '' : 'opacity-50'}`}
                  onClick={() => { onMarkOne(n); if (link) onNavigate(link) }}
                >
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${isUnread ? 'bg-cm-green' : 'bg-gray-200'}`} />
                  <div className="flex-1 min-w-0">
                    <div className={`text-[12px] leading-snug ${isUnread ? 'font-semibold text-gray-800' : 'text-gray-600'}`}>
                      {n.subject}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      {n.creation ? timeAgo(n.creation) : ''}
                      {n.from_user && <span className="mx-1 opacity-50">·</span>}
                      {n.from_user && <span>{n.from_user}</span>}
                    </div>
                  </div>
                  {link && <span className="text-gray-300 text-xs shrink-0 mt-0.5">›</span>}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function LatestProducts({
  products, loading, onNavigate,
}: {
  products?: DashboardData['latest_products']
  loading?: boolean
  onNavigate: (code: string) => void
}) {
  if (loading) return (
    <div className="space-y-2.5">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-11 bg-gray-50 rounded-lg animate-pulse" />
      ))}
    </div>
  )
  if (!products?.length) return (
    <div className="py-6 text-center">
      <p className="text-[12px] text-gray-400">No products added yet.</p>
    </div>
  )
  return (
    <div className="divide-y divide-gray-50">
      {products.map((p) => (
        <button key={p.name} type="button"
          className="w-full text-left flex items-start gap-2 py-2.5 hover:bg-gray-50 px-1 rounded-lg transition-colors"
          onClick={() => onNavigate(p.name)}
        >
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-semibold text-gray-800 truncate leading-snug">
              {p.cm_given_name || p.item_name}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] font-mono text-gray-400 shrink-0">{p.name}</span>
              {p.cm_supplier_name && (
                <span className="text-[10px] text-gray-300 truncate">· {p.cm_supplier_name}</span>
              )}
            </div>
          </div>
          <span className="text-[10px] text-gray-300 shrink-0 mt-0.5">{p.creation ? timeAgo(p.creation) : ''}</span>
        </button>
      ))}
    </div>
  )
}

// ─── main component ───────────────────────────────────────────────────────────

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

  const shortcuts = [
    { icon: '＋', label: 'New Quote',    to: '/sales/quotations/new',      accent: 'border-cm-green/40 bg-cm-green/5 hover:bg-cm-green/10' },
    { icon: '＋', label: 'New Order',    to: '/sales/orders/new',           accent: 'border-cm-green/40 bg-cm-green/5 hover:bg-cm-green/10' },
    { icon: '👥', label: 'Customers',    to: '/customers',                  accent: 'border-gray-200 bg-white hover:bg-gray-50' },
    { icon: '🧾', label: 'Invoices',     to: '/sales/invoices',             accent: 'border-gray-200 bg-white hover:bg-gray-50' },
    { icon: '🚚', label: 'Deliveries',   to: '/sales/delivery-notes',       accent: 'border-gray-200 bg-white hover:bg-gray-50' },
    { icon: '🛋️', label: 'Products',     to: '/products',                   accent: 'border-gray-200 bg-white hover:bg-gray-50' },
    ...(can('canPurchasing') ? [{ icon: '📑', label: 'Purchase Orders', to: '/purchases/orders', accent: 'border-gray-200 bg-white hover:bg-gray-50' }] : []),
    ...(can('canWarehouse')  ? [{ icon: '📦', label: 'Stock',           to: '/warehouse/stock-balances', accent: 'border-gray-200 bg-white hover:bg-gray-50' }] : []),
  ]

  return (
    <div className="space-y-5">

      {/* ── Header ──────────────────────────────────────────────────────── */}
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

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{error}</div>
      )}

      {/* ── Sales KPIs ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Today's Sales"
          loading={loading}
          value={d ? (d.today_order_count > 0 ? `${fmt(d.today_order_count)} · ${fmtMoney(d.today_order_value)}` : '—') : null}
          sub={d ? (d.today_order_count > 0 ? `${fmt(d.today_order_count)} order${d.today_order_count !== 1 ? 's' : ''} submitted` : 'No orders yet today') : undefined}
          accent="bg-cm-green"
          onClick={() => navigate('/sales/orders')}
        />
        <KpiCard
          label="Invoiced Today"
          loading={loading}
          value={d ? (d.today_invoiced > 0 ? fmtMoney(d.today_invoiced) : '—') : null}
          sub="Sales invoices"
          accent="bg-emerald-400"
        />
        <KpiCard
          label="Receivables"
          loading={loading}
          value={d ? (d.receivables > 0 ? fmtMoney(d.receivables) : '—') : null}
          sub="Outstanding balance"
          accent="bg-amber-400"
          onClick={() => navigate('/finance/aged')}
        />
        <KpiCard
          label="Open Orders"
          loading={loading}
          value={d ? (d.open_so_count > 0 ? `${fmt(d.open_so_count)} · ${fmtMoney(d.pending_so_value)}` : '—') : null}
          sub="Pending delivery / billing"
          accent="bg-blue-400"
          onClick={() => navigate('/sales/orders')}
        />
      </div>

      {/* ── Sales Chart (2/3) + Notifications (1/3) ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-[12px] font-semibold text-gray-500 uppercase tracking-wider">Sales — Last 7 Days</h2>
            <button type="button" onClick={() => navigate('/sales/orders')}
              className="text-[11px] text-cm-green hover:underline">All orders ›</button>
          </div>
          <SalesTrendChart trend={d?.sales_trend} loading={loading} />
        </div>

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

      {/* ── Shortcuts ───────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2.5">Quick Actions</h2>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
          {shortcuts.map((s) => (
            <button key={s.to} type="button" onClick={() => navigate(s.to)}
              className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3
                shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all min-h-[68px] ${s.accent}`}>
              <span className="text-xl leading-none">{s.icon}</span>
              <span className="text-[11px] font-semibold text-gray-700 leading-tight text-center">{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Recent Orders (2/3) + Latest Products (1/3) ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        <div className="lg:col-span-2 rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[12px] font-semibold text-gray-500 uppercase tracking-wider">Recent Orders</h2>
            <button type="button" onClick={() => navigate('/sales/orders')}
              className="text-[11px] text-cm-green hover:underline">View all ›</button>
          </div>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 bg-gray-50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : !d?.recent_orders?.length ? (
            <p className="text-[12px] text-gray-400">No orders yet.</p>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-50">
                    <th className="text-left pb-2 px-1">Order</th>
                    <th className="text-left pb-2 px-1">Customer</th>
                    <th className="text-left pb-2 px-1 hidden sm:table-cell">Date</th>
                    <th className="text-right pb-2 px-1">Total</th>
                    <th className="text-right pb-2 px-1">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {d.recent_orders.map((o) => (
                    <tr key={o.name}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/sales/orders/${encodeURIComponent(o.name)}`)}>
                      <td className="py-2 px-1 font-mono font-semibold text-gray-700 text-[11px]">{o.name}</td>
                      <td className="py-2 px-1 text-gray-600 truncate max-w-[130px]">{o.customer_name}</td>
                      <td className="py-2 px-1 text-gray-400 hidden sm:table-cell">
                        {o.transaction_date
                          ? new Date(o.transaction_date).toLocaleDateString('en-MT', { day: 'numeric', month: 'short' })
                          : '—'}
                      </td>
                      <td className="py-2 px-1 text-right font-semibold tabular-nums text-gray-800">
                        {fmtMoney(o.grand_total)}
                      </td>
                      <td className="py-2 px-1 text-right">
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_COLOUR[o.status] ?? 'bg-gray-50 text-gray-500'}`}>
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

        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[12px] font-semibold text-gray-500 uppercase tracking-wider">Latest Products</h2>
            <button type="button" onClick={() => navigate('/products')}
              className="text-[11px] text-cm-green hover:underline">View all ›</button>
          </div>
          <LatestProducts
            products={d?.latest_products}
            loading={loading}
            onNavigate={(code) => navigate(`/products/${encodeURIComponent(code)}`)}
          />
        </div>

      </div>

    </div>
  )
}
