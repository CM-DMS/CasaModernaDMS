import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import { usePermissions } from '../../auth/PermissionsProvider'
import {
  PageHeader, FilterRow, FieldWrap, DataTable, ErrorBox, Btn,
  inputCls, selectCls, type Column,
} from '../../components/shared/ui'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { fmtDate, fmtMoney } from '../../utils/fmt'

interface SalesInvoice {
  name: string
  customer_name?: string
  posting_date?: string
  due_date?: string
  grand_total?: number
  outstanding_amount?: number
  status?: string
  docstatus?: number
}

const COLUMNS: Column<SalesInvoice>[] = [
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
  { key: 'posting_date', label: 'Invoice Date', render: (v) => fmtDate(v as string) },
  { key: 'due_date', label: 'Due Date', render: (v) => fmtDate(v as string) },
  {
    key: 'grand_total',
    label: 'Total',
    align: 'right',
    render: (v) => <span className="tabular-nums font-medium">{fmtMoney(v as number)}</span>,
  },
  {
    key: 'outstanding_amount',
    label: 'Outstanding',
    align: 'right',
    render: (v) => (
      <span className={`tabular-nums font-medium ${Number(v) > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
        {fmtMoney(v as number)}
      </span>
    ),
  },
  {
    key: 'status',
    label: 'Status',
    render: (v, row) => <StatusBadge status={v as string} docstatus={row.docstatus} />,
  },
]

const STATUS_OPTIONS = ['', 'Draft', 'Submitted', 'Return', 'Credit Note Issued', 'Unpaid', 'Partly Paid', 'Paid', 'Overdue', 'Cancelled']

export function SalesInvoiceList() {
  const navigate = useNavigate()
  const { can } = usePermissions()
  const [searchParams, setSearchParams] = useSearchParams()

  const q = searchParams.get('q') ?? ''
  const status = searchParams.get('status') ?? ''
  const fromDate = searchParams.get('from') ?? ''
  const toDate = searchParams.get('to') ?? ''

  const [rows, setRows] = useState<SalesInvoice[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const filters: Array<[string, string, string, unknown]> = []
      if (q) filters.push(['customer_name', 'like', `%${q}%`, ''])
      if (status) filters.push(['status', '=', status, ''])
      if (fromDate) filters.push(['posting_date', '>=', fromDate, ''])
      if (toDate) filters.push(['posting_date', '<=', toDate, ''])

      const data = await frappe.getList<SalesInvoice>('Sales Invoice', {
        fields: ['name', 'customer_name', 'posting_date', 'due_date', 'grand_total', 'outstanding_amount', 'status', 'docstatus'],
        filters: filters.length ? filters : undefined,
        limit: 100,
        order_by: 'posting_date desc',
      })
      setRows(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load invoices')
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
        title="Sales Invoices"
        subtitle={`${rows.length} results`}
        actions={
          (can('canSales') || can('canAdmin')) ? (
            <button
              onClick={() => navigate('/sales/invoices/new')}
              className="px-4 py-1.5 rounded text-sm font-semibold bg-cm-green text-white hover:bg-cm-green/90 transition-colors"
            >
              + New Invoice
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
          <select className={selectCls + ' w-36'} value={status} onChange={(e) => update('status', e.target.value)}>
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
        emptyMessage="No invoices match your search."
        onRowClick={(row) => navigate(`/sales/invoices/${encodeURIComponent(row.name)}`)}
      />
    </div>
  )
}
