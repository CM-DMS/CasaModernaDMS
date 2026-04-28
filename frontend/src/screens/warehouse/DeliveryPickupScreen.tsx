/**
 * DeliveryPickupScreen — Warehouse Pick-List view.
 *
 * Shows submitted Delivery Notes not yet dispatched.
 * Route: /warehouse/pickup
 */
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader, FilterRow, ErrorBox, Btn, selectCls, inputCls } from '../../components/shared/ui'
import { frappe } from '../../api/frappe'

const today = () => new Date().toISOString().slice(0, 10)

const STATUS_COLOURS: Record<string, string> = {
  '':          'bg-gray-100 text-gray-500',
  Preparing:   'bg-amber-100 text-amber-800',
  Ready:       'bg-green-100 text-green-800',
  Dispatched:  'bg-blue-100 text-blue-800',
}

const NEXT_STATUS: Record<string, string> = {
  '':         'Preparing',
  Preparing:  'Ready',
  Ready:      'Dispatched',
}

const STATUS_BUTTON_LABEL: Record<string, string> = {
  '':         '▶ Start Preparing',
  Preparing:  '✓ Mark Ready',
  Ready:      '🚚 Mark Dispatched',
}

interface DnItem {
  idx?: number
  item_code?: string
  item_name?: string
  cm_dn_item_display_name?: string
  qty?: number
  uom?: string
  stock_uom?: string
}

interface DeliveryNote {
  name: string
  customer_name?: string
  posting_date?: string
  cm_warehouse_status?: string
  set_warehouse?: string
  cm_route?: string
  lr_no?: string
  cm_lift_required?: number
  cm_pickup_from_showroom?: number
  cm_delivery_instructions?: string
  items?: DnItem[]
}

function StatusPill({ status }: { status: string }) {
  const cls = STATUS_COLOURS[status || ''] ?? STATUS_COLOURS['']
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls}`}>
      {status || 'Pending'}
    </span>
  )
}

function DNCard({
  dn,
  onStatusChange,
  busy,
}: {
  dn: DeliveryNote
  onStatusChange: (name: string, next: string) => void
  busy: string | null
}) {
  const navigate = useNavigate()
  const current  = dn.cm_warehouse_status || ''
  const next     = NEXT_STATUS[current]

  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-3">
          <button
            className="font-mono text-[13px] font-bold text-cm-green hover:underline"
            onClick={() => navigate(`/warehouse/delivery-notes/${encodeURIComponent(dn.name)}`)}
          >
            {dn.name}
          </button>
          <StatusPill status={current} />
        </div>
        <div className="text-[11px] text-gray-500">{dn.posting_date}</div>
      </div>

      <div className="px-4 py-2 border-b border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-[11px]">
        <div>
          <span className="text-gray-400 uppercase tracking-wider font-semibold text-[9px] block">Customer</span>
          <span className="font-medium text-gray-800">{dn.customer_name}</span>
        </div>
        {dn.set_warehouse && (
          <div>
            <span className="text-gray-400 uppercase tracking-wider font-semibold text-[9px] block">Warehouse</span>
            <span className="text-gray-700">{dn.set_warehouse}</span>
          </div>
        )}
        {dn.cm_route && (
          <div>
            <span className="text-gray-400 uppercase tracking-wider font-semibold text-[9px] block">Route</span>
            <span className="text-gray-700">{dn.cm_route}</span>
          </div>
        )}
        {dn.lr_no && (
          <div>
            <span className="text-gray-400 uppercase tracking-wider font-semibold text-[9px] block">Transport / LR</span>
            <span className="text-gray-700">{dn.lr_no}</span>
          </div>
        )}
        {!!dn.cm_lift_required && (
          <div className="col-span-2 sm:col-span-1">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-100 text-orange-800">
              🔼 Lift Required
            </span>
          </div>
        )}
        {!!dn.cm_pickup_from_showroom && (
          <div className="col-span-2 sm:col-span-1">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-800">
              🏪 Pickup from Showroom
            </span>
          </div>
        )}
        {dn.cm_delivery_instructions && (
          <div className="col-span-2 sm:col-span-4">
            <span className="text-gray-400 uppercase tracking-wider font-semibold text-[9px] block">Instructions</span>
            <span className="text-gray-700 italic">{dn.cm_delivery_instructions}</span>
          </div>
        )}
      </div>

      <div className="px-4 py-2">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-100">
              <th className="text-left pb-1 pr-3">#</th>
              <th className="text-left pb-1 pr-3">Product (Main Name)</th>
              <th className="text-left pb-1 pr-3 hidden sm:table-cell">CM Name</th>
              <th className="text-right pb-1 pr-3">Qty</th>
              <th className="text-left pb-1">UOM</th>
            </tr>
          </thead>
          <tbody>
            {(dn.items || []).map((item, i) => (
              <tr key={item.idx ?? i} className="border-b border-gray-50 last:border-0">
                <td className="py-1.5 pr-3 text-gray-400 tabular-nums">{item.idx ?? i + 1}</td>
                <td className="py-1.5 pr-3">
                  <span className="font-semibold text-gray-900">{item.item_name || item.item_code}</span>
                  <span className="ml-1.5 font-mono text-[9px] text-gray-400">{item.item_code}</span>
                </td>
                <td className="py-1.5 pr-3 hidden sm:table-cell">
                  {item.cm_dn_item_display_name && item.cm_dn_item_display_name !== item.item_name ? (
                    <span className="text-gray-500 italic">{item.cm_dn_item_display_name}</span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="py-1.5 pr-3 text-right font-bold tabular-nums text-gray-800">{item.qty}</td>
                <td className="py-1.5 text-gray-500">{item.uom || item.stock_uom || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {next && (
        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex justify-end">
          <Btn
            onClick={() => onStatusChange(dn.name, next)}
            disabled={busy === dn.name}
          >
            {busy === dn.name ? 'Updating…' : STATUS_BUTTON_LABEL[current]}
          </Btn>
        </div>
      )}
      {current === 'Dispatched' && (
        <div className="px-4 py-2 border-t border-gray-100 bg-blue-50 text-[11px] text-blue-700 font-semibold text-center">
          ✓ Dispatched
        </div>
      )}
    </div>
  )
}

const WH_STATUS_OPTIONS = [
  { value: '',          label: 'All Pending' },
  { value: 'Preparing', label: 'Preparing' },
  { value: 'Ready',     label: 'Ready' },
  { value: 'Dispatched',label: 'Dispatched' },
]

export function DeliveryPickupScreen() {
  const [fromDate, setFromDate] = useState(today())
  const [toDate,   setToDate]   = useState(today())
  const [whStatus, setWhStatus] = useState('')

  const [rows,    setRows]    = useState<DeliveryNote[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [busy,    setBusy]    = useState<string | null>(null)

  const load = useCallback(async (from: string, to: string, status: string) => {
    setLoading(true)
    setError(null)
    try {
      const data = await frappe.call<DeliveryNote[]>(
        'casamoderna_dms.delivery_pickup_api.get_pickup_list',
        {
          from_date:        from   || null,
          to_date:          to     || null,
          warehouse_status: status || null,
          limit: 200,
        },
      )
      setRows(Array.isArray(data) ? data : [])
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to load pickup list')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(fromDate, toDate, whStatus) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleStatusChange = async (dnName: string, newStatus: string) => {
    setBusy(dnName)
    try {
      await frappe.call('casamoderna_dms.delivery_pickup_api.set_dn_warehouse_status', {
        name: dnName, status: newStatus,
      })
      setRows((prev) =>
        prev.map((r) => r.name === dnName ? { ...r, cm_warehouse_status: newStatus } : r)
      )
    } catch (err: unknown) {
      setError(`Failed to update ${dnName}: ${(err as Error).message || err}`)
    } finally {
      setBusy(null)
    }
  }

  const pendingCount  = rows.filter((r) => !r.cm_warehouse_status || r.cm_warehouse_status === 'Preparing').length
  const readyCount    = rows.filter((r) => r.cm_warehouse_status === 'Ready').length
  const dispatchCount = rows.filter((r) => r.cm_warehouse_status === 'Dispatched').length

  return (
    <div className="space-y-5">
      <PageHeader
        title="Delivery Pick List"
        subtitle="Warehouse — pick, pack, dispatch"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">From</label>
              <input type="date" className={inputCls} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">To</label>
              <input type="date" className={inputCls} value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Status</label>
              <select className={selectCls} value={whStatus} onChange={(e) => setWhStatus(e.target.value)}>
                {WH_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Btn onClick={() => load(fromDate, toDate, whStatus)} disabled={loading}>
                {loading ? 'Loading…' : 'Refresh'}
              </Btn>
            </div>
          </div>
        }
      />

      {error && <ErrorBox message={error} />}

      {!loading && rows.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200">
            <span className="text-[11px] font-semibold text-amber-700">Preparing / Pending</span>
            <span className="font-bold text-amber-800">{pendingCount}</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 border border-green-200">
            <span className="text-[11px] font-semibold text-green-700">Ready</span>
            <span className="font-bold text-green-800">{readyCount}</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200">
            <span className="text-[11px] font-semibold text-blue-700">Dispatched</span>
            <span className="font-bold text-blue-800">{dispatchCount}</span>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-7 w-7 rounded-full border-4 border-cm-green border-t-transparent animate-spin" />
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="text-center py-16 text-sm text-gray-400">
          No delivery notes pending for this date range and status.
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="space-y-4">
          {rows.map((dn) => (
            <DNCard key={dn.name} dn={dn} onStatusChange={handleStatusChange} busy={busy} />
          ))}
        </div>
      )}
    </div>
  )
}
