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

interface Quotation {
  name: string
  customer_name?: string
  party_name?: string
  title?: string
  transaction_date?: string
  valid_till?: string
  grand_total?: number
  status?: string
  docstatus?: number
  cm_sales_person?: string
}

const COLUMNS: Column<Quotation>[] = [
  {
    key: 'name',
    label: 'Reference',
    render: (v) => <span className="font-mono text-[12px] font-medium text-cm-green">{v as string}</span>,
  },
  {
    key: 'customer_name',
    label: 'Customer',
    render: (v, row) => <span className="font-medium">{(row.customer_name || row.party_name) as string}</span>,
  },
  {
    key: 'title',
    label: 'Title',
    render: (v) => <span className="text-gray-500 truncate max-w-xs block">{v as string}</span>,
  },
  {
    key: 'cm_sales_person',
    label: 'Salesperson',
    render: (v) => <span className="text-gray-600 text-[12px]">{(v as string) || '—'}</span>,
  },
  { key: 'transaction_date', label: 'Date', render: (v) => fmtDate(v as string) },
  { key: 'valid_till', label: 'Valid Till', render: (v) => fmtDate(v as string) },
  {
    key: 'grand_total',
    label: 'Total',
    align: 'right',
    render: (v) => <span className="tabular-nums font-medium">{fmtMoney(v as number)}</span>,
  },
  {
    key: 'status',
    label: 'Status',
    render: (v, row) => <StatusBadge status={v as string} docstatus={row.docstatus} />,
  },
]

const STATUS_OPTIONS = ['', 'Draft', 'Open', 'Ordered', 'Lost', 'Cancelled', 'Expired']

interface QuotationListProps {
  /** If set, only show quotations where cm_document_subtype = subtypeFilter */
  subtypeFilter?: string
  /** Override the page title */
  title?: string
}

export function QuotationList({ subtypeFilter, title }: QuotationListProps = {}) {
  const navigate = useNavigate()
  const { can } = usePermissions()
  const [searchParams, setSearchParams] = useSearchParams()

  const q = searchParams.get('q') ?? ''
  const status = searchParams.get('status') ?? ''
  const fromDate = searchParams.get('from') ?? ''
  const toDate = searchParams.get('to') ?? ''

  const [rows, setRows] = useState<Quotation[]>([])
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
      if (subtypeFilter) filters.push(['cm_document_subtype', '=', subtypeFilter, ''])

      const data = await frappe.getList<Quotation>('Quotation', {
        fields: ['name', 'customer_name', 'party_name', 'title', 'transaction_date', 'valid_till', 'grand_total', 'status', 'docstatus', 'cm_sales_person'],
        filters: filters.length ? filters : undefined,
        limit: 100,
        order_by: 'transaction_date desc',
      })
      setRows(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load quotations')
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
        title={title ?? 'Quotations'}
        subtitle={`${rows.length} results`}
        actions={
          (can('canSales') || can('canAdmin')) ? (
            <button
              onClick={() => navigate('/sales/quotations/new')}
              className="px-4 py-1.5 rounded text-sm font-semibold bg-cm-green text-white hover:bg-cm-green/90 transition-colors"
            >
              + New {title ?? 'Quotation'}
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
        emptyMessage="No quotations match your search."
        onRowClick={(row) => navigate(`/sales/quotations/${encodeURIComponent(row.name)}`)}
      />
    </div>
  )
}
