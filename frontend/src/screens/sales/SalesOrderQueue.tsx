import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import { PageHeader, DataTable, ErrorBox, type Column } from '../../components/shared/ui'
import { fmtDate, fmtMoney } from '../../utils/fmt'
import { usePermissions } from '../../auth/PermissionsProvider'

// ── Types ──────────────────────────────────────────────────────────────────

interface PendingSO {
  name: string
  customer_name?: string
  transaction_date?: string
  grand_total?: number
  cm_sales_person?: string
}

interface FulfillmentRow {
  name: string
  customer_name?: string
  delivery_date?: string
  grand_total?: number
  cm_fulfill_status?: string
  cm_fulfill_locked?: 0 | 1
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDelivery(isoDate?: string) {
  if (!isoDate) return '—'
  const [y, m] = isoDate.split('-')
  const month = new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-GB', { month: 'long' })
  return `End of ${month} ${y}`
}

function FulfillStatusBadge({ status, locked }: { status?: string; locked?: 0 | 1 }) {
  if (locked)
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-100 text-gray-500">Locked</span>
  if (status === 'fulfilled')
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-green-100 text-green-700">Fulfilled</span>
  if (status === 'in_review')
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-100 text-blue-700">In Review</span>
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800">Pending</span>
}

// ── Pending Confirmation tab ───────────────────────────────────────────────

function PendingTab() {
  const navigate = useNavigate()
  const { can } = usePermissions()
  const [rows, setRows] = useState<PendingSO[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await frappe.getList<PendingSO>('Sales Order', {
        fields: ['name', 'customer_name', 'transaction_date', 'grand_total', 'cm_sales_person'],
        filters: [
          ['docstatus', '=', 1],
          ['workflow_state', '=', 'Pending'],
        ] as any,
        order_by: 'transaction_date asc',
        limit: 200,
      })
      setRows(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pending orders')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const handleConfirm = useCallback(async (e: React.MouseEvent, soName: string) => {
    e.stopPropagation()
    if (!window.confirm(`Confirm sales order ${soName}?`)) return
    setConfirming(soName)
    setError('')
    try {
      await frappe.call('casamoderna_dms.sales_order_confirm.confirm_pending_so', { sales_order: soName })
      setRows((prev) => prev.filter((r) => r.name !== soName))
    } catch (err: any) {
      setError(err.message || 'Failed to confirm order')
    } finally {
      setConfirming(null)
    }
  }, [])

  const totalValue = rows.reduce((s, r) => s + (r.grand_total ?? 0), 0)

  const COLUMNS: Column<PendingSO>[] = [
    { key: 'transaction_date', label: 'Date', render: (v) => fmtDate(v as string) },
    {
      key: 'name',
      label: 'Order #',
      render: (v) => <span className="font-mono text-[12px] font-medium text-cm-green">{v as string}</span>,
    },
    {
      key: 'customer_name',
      label: 'Customer',
      render: (v) => <span className="font-medium">{v as string}</span>,
    },
    {
      key: 'cm_sales_person',
      label: 'Salesperson',
      render: (v) => <span className="text-gray-500 text-[12px]">{(v as string) || '—'}</span>,
    },
    {
      key: 'grand_total',
      label: 'Total',
      align: 'right',
      render: (v) => <span className="tabular-nums font-medium">{fmtMoney(v as number)}</span>,
    },
    {
      key: 'name',
      label: '',
      render: (_v, row) =>
        (can('canConfirmSO') || can('canAdmin')) ? (
          <button
            onClick={(e) => void handleConfirm(e, row.name)}
            disabled={confirming === row.name}
            className="px-3 py-1 rounded text-xs font-semibold bg-cm-green text-white hover:bg-cm-green/90 disabled:opacity-50 transition-colors"
          >
            {confirming === row.name ? 'Confirming…' : 'Confirm ✓'}
          </button>
        ) : null,
    },
  ]

  return (
    <div className="space-y-4">
      {error && <ErrorBox message={error} />}

      {rows.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs text-amber-700 font-medium uppercase tracking-wide">Pending Orders</p>
            <p className="mt-1 text-2xl font-bold text-amber-800">{rows.length}</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs text-amber-700 font-medium uppercase tracking-wide">Total Value</p>
            <p className="mt-1 text-2xl font-bold text-amber-800">{fmtMoney(totalValue)}</p>
          </div>
        </div>
      )}

      <DataTable
        columns={COLUMNS}
        rows={rows}
        loading={loading}
        emptyMessage="No pending sales orders."
        onRowClick={(row) => navigate(`/sales/orders/${encodeURIComponent(row.name)}`)}
      />
    </div>
  )
}

// ── Fulfilment Review tab ──────────────────────────────────────────────────

function FulfillmentTab() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<FulfillmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hideFulfilled, setHideFulfilled] = useState(false)

  useEffect(() => {
    frappe
      .getList<FulfillmentRow>('Sales Order', {
        fields: ['name', 'customer_name', 'delivery_date', 'cm_fulfill_status', 'cm_fulfill_locked', 'grand_total'],
        filters: [['docstatus', '=', 1]] as any,
        order_by: 'delivery_date asc, creation asc',
        limit: 200,
      })
      .then((res) => setRows(res || []))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load orders.'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = rows.filter((r) => {
    if (!hideFulfilled) return true
    return r.cm_fulfill_status !== 'fulfilled' && !r.cm_fulfill_locked
  })

  const pendingCount = rows.filter(
    (r) => r.cm_fulfill_status !== 'fulfilled' && !r.cm_fulfill_locked,
  ).length

  const COLUMNS: Column<FulfillmentRow>[] = [
    {
      key: 'name',
      label: 'Order',
      render: (v) => <span className="font-mono text-xs font-medium text-cm-green">{v as string}</span>,
    },
    {
      key: 'customer_name',
      label: 'Customer',
      render: (v) => <span className="text-gray-800">{v as string}</span>,
    },
    {
      key: 'delivery_date',
      label: 'Delivery',
      render: (v) => <span className="text-gray-600">{fmtDelivery(v as string)}</span>,
    },
    {
      key: 'grand_total',
      label: 'Total',
      align: 'right',
      render: (v) => <span className="tabular-nums">{fmtMoney(v as number)}</span>,
    },
    {
      key: 'cm_fulfill_status',
      label: 'Status',
      render: (v, row) => <FulfillStatusBadge status={v as string} locked={row.cm_fulfill_locked} />,
    },
    {
      key: 'name',
      label: '',
      render: () => <span className="text-xs text-cm-green font-medium">Review →</span>,
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {pendingCount} order{pendingCount !== 1 ? 's' : ''} awaiting review
        </p>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            className="rounded"
            checked={hideFulfilled}
            onChange={(e) => setHideFulfilled(e.target.checked)}
          />
          Hide fulfilled / locked
        </label>
      </div>

      {error && <ErrorBox message={error} />}

      <DataTable
        columns={COLUMNS}
        rows={filtered}
        loading={loading}
        emptyMessage={hideFulfilled ? 'All orders are reviewed.' : 'No submitted sales orders found.'}
        onRowClick={(row) => navigate(`/sales/orders/${encodeURIComponent(row.name)}/fulfillment`)}
      />
    </div>
  )
}

// ── Main combined component ────────────────────────────────────────────────

type TabId = 'pending' | 'fulfillment'

export function SalesOrderQueue() {
  const { can } = usePermissions()
  const [searchParams, setSearchParams] = useSearchParams()

  const canPending = can('canConfirmSO') || can('canAdmin')
  const canFulfillment = can('canPurchasing') || can('canAdmin')

  // Default tab: prefer pending if user can confirm; else fulfillment
  const defaultTab: TabId = canPending ? 'pending' : 'fulfillment'
  const activeTab = (searchParams.get('tab') as TabId) || defaultTab

  const setTab = (t: TabId) => {
    const p = new URLSearchParams(searchParams)
    p.set('tab', t)
    setSearchParams(p, { replace: true })
  }

  if (!canPending && !canFulfillment) {
    return (
      <div className="space-y-4">
        <PageHeader title="Sales Order Queue" />
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          You do not have permission to access this screen.
        </div>
      </div>
    )
  }

  const tabs: { id: TabId; label: string; visible: boolean }[] = [
    { id: 'pending', label: 'Pending Confirmation', visible: canPending },
    { id: 'fulfillment', label: 'Fulfilment Review', visible: canFulfillment },
  ]

  const visibleTabs = tabs.filter((t) => t.visible)

  return (
    <div className="space-y-4">
      <PageHeader title="Sales Order Queue" />

      {/* Tabs — only render if user can see more than one */}
      {visibleTabs.length > 1 && (
        <div className="flex gap-1 border-b border-gray-200">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.id
                  ? 'border-cm-green text-cm-green'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Tab content */}
      {activeTab === 'pending' && canPending && <PendingTab />}
      {activeTab === 'fulfillment' && canFulfillment && <FulfillmentTab />}
    </div>
  )
}
