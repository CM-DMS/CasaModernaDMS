import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import { usePermissions } from '../../auth/PermissionsProvider'
import {
  PageHeader, FilterRow, FieldWrap, DataTable, ErrorBox, Btn,
  inputCls, selectCls, type Column,
} from '../../components/shared/ui'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { fmtDate, fmtDeliveryMonth, fmtMoney } from '../../utils/fmt'

interface SalesOrder {
  name: string
  customer_name?: string
  transaction_date?: string
  delivery_date?: string
  grand_total?: number
  status?: string
  docstatus?: number
  workflow_state?: string
}

const COLUMNS: Column<SalesOrder>[] = [
  {
    key: 'name',
    label: 'Reference',
    render: (v) => <span className="font-mono text-[12px] font-medium text-cm-green">{v as string}</span>,
  },
  {
    key: 'customer_name',
    label: 'Customer',
    render: (v) => <span className="font-medium">{v as string}</span>,
  },
  { key: 'transaction_date', label: 'Order Date', render: (v) => fmtDate(v as string) },
  { key: 'delivery_date', label: 'Delivery', render: (v) => fmtDeliveryMonth(v as string) },
  {
    key: 'grand_total',
    label: 'Total',
    align: 'right',
    render: (v) => <span className="tabular-nums font-medium">{fmtMoney(v as number)}</span>,
  },
  {
    key: 'workflow_state',
    label: 'Confirmation',
    render: (v) => {
      if (v === 'Confirmed') return <StatusBadge status="Confirmed" />
      if (v === 'Pending') return <StatusBadge status="Pending" />
      return <span className="text-gray-400">—</span>
    },
  },
  {
    key: 'status',
    label: 'Status',
    render: (v, row) => <StatusBadge status={v as string} docstatus={row.docstatus} />,
  },
]

const STATUS_OPTIONS = ['', 'Draft', 'To Deliver and Bill', 'To Bill', 'To Deliver', 'Completed', 'Cancelled', 'Closed']

export function SalesOrderList() {
  const navigate = useNavigate()
  const { can } = usePermissions()
  const [searchParams, setSearchParams] = useSearchParams()

  const q = searchParams.get('q') ?? ''
  const status = searchParams.get('status') ?? ''
  const fromDate = searchParams.get('from') ?? ''
  const toDate = searchParams.get('to') ?? ''

  const [rows, setRows] = useState<SalesOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const filters: Array<[string, string, string, unknown]> = []
      if (q) filters.push(['customer_name', 'like', `%${q}%`, ''])
      if (status) filters.push(['status', '=', status, ''])
      if (fromDate) filters.push(['transaction_date', '>=', fromDate, ''])
      if (toDate) filters.push(['transaction_date', '<=', toDate, ''])

      let data = await frappe.getList<SalesOrder>('Sales Order', {
        fields: ['name', 'customer_name', 'transaction_date', 'delivery_date', 'grand_total', 'status', 'docstatus', 'workflow_state'],
        filters: filters.length ? filters : undefined,
        limit: 100,
        order_by: 'transaction_date desc',
      })

      // Default: hide Completed orders older than 5 days to reduce noise
      if (!status) {
        const cutoff = Date.now() - 5 * 24 * 60 * 60 * 1000
        data = data.filter((r) => r.status !== 'Completed' || new Date(r.transaction_date ?? 0).getTime() >= cutoff)
      }
      setRows(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load sales orders')
    } finally {
      setLoading(false)
    }
  }, [q, status, fromDate, toDate])

  useEffect(() => { void load() }, [load])

  const update = (key: string, value: string) => {
    const p = new URLSearchParams(searchParams)
    if (value) p.set(key, value)
    else p.delete(key)
    setSearchParams(p)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sales Orders"
        subtitle={`${rows.length} results`}
        actions={
          (can('canSales') || can('canAdmin')) ? (
            <button
              onClick={() => navigate('/sales/orders/new')}
              className="px-4 py-1.5 rounded text-sm font-semibold bg-cm-green text-white hover:bg-cm-green/90 transition-colors"
            >
              + New Sales Order
            </button>
          ) : undefined
        }
      />

      <FilterRow>
        <FieldWrap label="Search">
          <input className={inputCls + ' w-56'} value={q} onChange={(e) => update('q', e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void load()} placeholder="Reference or customer…" />
        </FieldWrap>
        <FieldWrap label="Status">
          <select className={selectCls + ' w-44'} value={status} onChange={(e) => update('status', e.target.value)}>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s || 'All statuses'}</option>)}
          </select>
        </FieldWrap>
        <FieldWrap label="From">
          <input type="date" className={inputCls} value={fromDate} onChange={(e) => update('from', e.target.value)} />
        </FieldWrap>
        <FieldWrap label="To">
          <input type="date" className={inputCls} value={toDate} onChange={(e) => update('to', e.target.value)} />
        </FieldWrap>
        <div className="flex items-end">
          <Btn onClick={() => void load()} disabled={loading}>{loading ? 'Searching…' : 'Search'}</Btn>
        </div>
      </FilterRow>

      {error && <ErrorBox message={error} />}

      <DataTable
        columns={COLUMNS}
        rows={rows}
        loading={loading}
        emptyMessage="No sales orders match your search."
        onRowClick={(row) => navigate(`/sales/orders/${encodeURIComponent(row.name)}`)}
      />
    </div>
  )
}
