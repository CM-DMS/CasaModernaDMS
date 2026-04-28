import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import {
  PageHeader, FilterRow, FieldWrap, DataTable, ErrorBox, Btn,
  inputCls, selectCls, type Column,
} from '../../components/shared/ui'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { usePermissions } from '../../auth/PermissionsProvider'
import { fmtDate, fmtMoney } from '../../utils/fmt'

interface CreditNote {
  name: string
  customer_name?: string
  posting_date?: string
  grand_total?: number
  return_against?: string
  status?: string
  docstatus?: number
}

const COLUMNS: Column<CreditNote>[] = [
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
  { key: 'posting_date', label: 'Date', render: (v) => fmtDate(v as string) },
  {
    key: 'grand_total',
    label: 'Total',
    align: 'right',
    render: (v) => <span className="tabular-nums font-medium">{fmtMoney(v as number)}</span>,
  },
  {
    key: 'return_against',
    label: 'Return Against',
    render: (v) => <span className="font-mono text-[12px] text-gray-600">{(v as string) || '—'}</span>,
  },
  {
    key: 'status',
    label: 'Status',
    render: (v, row) => <StatusBadge status={v as string} docstatus={row.docstatus} />,
  },
]

export function CreditNoteList() {
  const navigate = useNavigate()
  const { can } = usePermissions()

  const [q, setQ] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [rows, setRows] = useState<CreditNote[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const runSearch = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const filters: Array<[string, string, string, unknown]> = [['is_return', '=', '1', '']]
      if (q) filters.push(['name', 'like', `%${q}%`, ''])
      if (fromDate) filters.push(['posting_date', '>=', fromDate, ''])
      if (toDate) filters.push(['posting_date', '<=', toDate, ''])

      const data = await frappe.getList<CreditNote>('Sales Invoice', {
        fields: ['name', 'customer_name', 'posting_date', 'grand_total', 'return_against', 'status', 'docstatus'],
        filters,
        limit: 100,
        order_by: 'posting_date desc',
      })
      setRows(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [q, fromDate, toDate])

  useEffect(() => { void runSearch() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <PageHeader
        title="Credit Notes"
        actions={
          (can('canSales') || can('canFinance')) && (
            <button
              className="px-3 py-1.5 text-sm font-medium rounded bg-cm-green text-white hover:bg-cm-green-dark"
              onClick={() => navigate('/sales/credit-notes/new')}
            >
              + New Credit Note
            </button>
          )
        }
      />

      <FilterRow>
        <FieldWrap label="Search">
          <input
            className={inputCls + ' w-64'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
            placeholder="Reference or customer…"
          />
        </FieldWrap>
        <FieldWrap label="From">
          <input
            type="date"
            className={inputCls}
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </FieldWrap>
        <FieldWrap label="To">
          <input
            type="date"
            className={inputCls}
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </FieldWrap>
        <div className="flex items-end">
          <Btn onClick={() => void runSearch()} disabled={loading}>
            {loading ? 'Searching…' : 'Search'}
          </Btn>
        </div>
      </FilterRow>

      {error && <ErrorBox message={error} />}

      <DataTable
        columns={COLUMNS}
        rows={rows}
        loading={loading}
        emptyMessage="No credit notes found."
        onRowClick={(row) => navigate(`/sales/invoices/${encodeURIComponent(row.name)}`)}
      />
    </div>
  )
}
