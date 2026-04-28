import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import { PageHeader, ErrorBox, type Column, DataTable } from '../../components/shared/ui'
import { fmtDate, fmtMoney } from '../../utils/fmt'
import { usePermissions } from '../../auth/PermissionsProvider'

interface FulfillmentRow {
  name: string
  customer_name?: string
  delivery_date?: string
  grand_total?: number
  cm_fulfill_status?: string
  cm_fulfill_locked?: 0 | 1
}

function fmtDelivery(isoDate?: string) {
  if (!isoDate) return '—'
  const [y, m] = isoDate.split('-')
  const month = new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-GB', { month: 'long' })
  return `End of ${month} ${y}`
}

function FulfillStatusBadge({ status, locked }: { status?: string; locked?: 0 | 1 }) {
  if (locked) return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-100 text-gray-500">Locked</span>
  )
  if (status === 'fulfilled') return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-green-100 text-green-700">Fulfilled</span>
  )
  if (status === 'in_review') return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-100 text-blue-700">In Review</span>
  )
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800">Pending</span>
  )
}

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

export function FulfillmentQueue() {
  const navigate = useNavigate()
  const { can } = usePermissions()
  const [rows, setRows] = useState<FulfillmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hideFulfilled, setHideFulfilled] = useState(false)

  useEffect(() => {
    frappe.getList<FulfillmentRow>('Sales Order', {
      fields: ['name', 'customer_name', 'delivery_date', 'cm_fulfill_status', 'cm_fulfill_locked', 'grand_total'],
      filters: [['docstatus', '=', 1]] as any,
      order_by: 'delivery_date asc, creation asc',
      limit: 200,
    })
      .then((res) => setRows(res || []))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load orders.'))
      .finally(() => setLoading(false))
  }, [])

  if (!can('canAdmin') && !can('canPurchasing')) {
    return (
      <div className="p-6 text-sm text-gray-500">
        Only designated fulfilment reviewers can access this screen.
      </div>
    )
  }

  const filtered = rows.filter((r) => {
    if (!hideFulfilled) return true
    return r.cm_fulfill_status !== 'fulfilled' && !r.cm_fulfill_locked
  })

  const pendingCount = rows.filter(
    (r) => r.cm_fulfill_status !== 'fulfilled' && !r.cm_fulfill_locked,
  ).length

  return (
    <div className="space-y-4">
      <PageHeader
        title="Fulfilment Review"
        subtitle={`${pendingCount} order${pendingCount !== 1 ? 's' : ''} awaiting review`}
        actions={
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              className="rounded"
              checked={hideFulfilled}
              onChange={(e) => setHideFulfilled(e.target.checked)}
            />
            Hide fulfilled / locked
          </label>
        }
      />

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
