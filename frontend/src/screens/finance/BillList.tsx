import { useState, useCallback, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import {
  PageHeader, FilterRow, FieldWrap, DataTable, ErrorBox, Btn,
  inputCls, selectCls, type Column,
} from '../../components/shared/ui'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { usePermissions } from '../../auth/PermissionsProvider'
import { fmtDate, fmtMoney } from '../../utils/fmt'

interface Bill {
  name: string
  supplier?: string
  supplier_name?: string
  bill_no?: string
  posting_date?: string
  due_date?: string
  grand_total?: number
  outstanding_amount?: number
  status?: string
  docstatus?: number
}

const COLUMNS: Column<Bill>[] = [
  {
    key: 'name',
    label: 'Reference',
    render: (v) => <span className="font-mono text-[12px] font-semibold text-cm-green">{v as string}</span>,
  },
  {
    key: 'supplier_name',
    label: 'Supplier',
    render: (v) => <span className="font-medium">{v as string}</span>,
  },
  { key: 'bill_no', label: 'Supplier Bill No' },
  { key: 'posting_date', label: 'Date', render: (v) => fmtDate(v as string) },
  { key: 'due_date', label: 'Due', render: (v) => fmtDate(v as string) },
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

const STATUS_OPTIONS = ['', 'Draft', 'Submitted', 'Paid', 'Unpaid', 'Overdue', 'Cancelled']

export function BillList() {
  const navigate = useNavigate()
  const { can } = usePermissions()
  const [searchParams, setSearchParams] = useSearchParams()

  const q = searchParams.get('q') ?? ''
  const status = searchParams.get('status') ?? ''
  const fromDate = searchParams.get('from') ?? ''
  const toDate = searchParams.get('to') ?? ''

  const [rows, setRows] = useState<Bill[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const filters: Array<[string, string, string, unknown]> = []
      if (q) {
        filters.push(['name', 'like', `%${q}%`, ''])
      }
      if (status) filters.push(['status', '=', status, ''])
      if (fromDate) filters.push(['posting_date', '>=', fromDate, ''])
      if (toDate) filters.push(['posting_date', '<=', toDate, ''])

      const data = await frappe.getList<Bill>('Purchase Invoice', {
        fields: ['name', 'supplier', 'supplier_name', 'bill_no', 'posting_date', 'due_date', 'grand_total', 'outstanding_amount', 'status', 'docstatus'],
        filters: filters.length ? filters : undefined,
        limit: 100,
        order_by: 'posting_date desc',
      })
      setRows(data)
    } catch (e: any) {
      setError(e.message || 'Failed to load bills')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [q, status, fromDate, toDate])

  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const setParam = (key: string, val: string) => {
    const p = new URLSearchParams(searchParams)
    if (val) p.set(key, val)
    else p.delete(key)
    setSearchParams(p)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Bills"
        subtitle="Supplier purchase invoices"
        actions={
          (can('canFinance') || can('canPurchasing') || can('canAdmin')) ? (
            <Btn onClick={() => navigate('/finance/bills/new')}>+ New Bill</Btn>
          ) : undefined
        }
      />

      <FilterRow>
        <FieldWrap label="Search">
          <input
            className={`${inputCls} w-56`}
            value={q}
            onChange={(e) => setParam('q', e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void load()}
            placeholder="Reference, supplier…"
          />
        </FieldWrap>

        <FieldWrap label="Status">
          <select className={selectCls} value={status} onChange={(e) => setParam('status', e.target.value)}>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s || 'All'}</option>)}
          </select>
        </FieldWrap>

        <FieldWrap label="From">
          <input type="date" className={inputCls} value={fromDate} onChange={(e) => setParam('from', e.target.value)} />
        </FieldWrap>

        <FieldWrap label="To">
          <input type="date" className={inputCls} value={toDate} onChange={(e) => setParam('to', e.target.value)} />
        </FieldWrap>

        <Btn onClick={() => void load()}>Search</Btn>
      </FilterRow>

      {error && <ErrorBox message={error} />}

      <DataTable
        columns={COLUMNS}
        rows={rows}
        loading={loading}
        emptyMessage="No bills found."
        onRowClick={(row) => navigate(`/finance/bills/${encodeURIComponent(row.name)}`)}
      />
    </div>
  )
}
