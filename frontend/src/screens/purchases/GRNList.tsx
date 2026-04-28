import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import {
  PageHeader, FilterRow, FieldWrap, DataTable, ErrorBox, Btn,
  inputCls, selectCls, type Column,
} from '../../components/shared/ui'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { fmtDate } from '../../utils/fmt'

interface PurchaseReceipt {
  name: string
  supplier?: string
  supplier_name?: string
  posting_date?: string
  total_qty?: number
  per_billed?: number
  status?: string
  docstatus?: number
}

const COLUMNS: Column<PurchaseReceipt>[] = [
  {
    key: 'name',
    label: 'GRN No.',
    render: (v) => <span className="font-mono text-[12px] text-cm-green font-semibold">{v as string}</span>,
  },
  { key: 'supplier_name', label: 'Supplier' },
  { key: 'posting_date', label: 'Date', render: (v) => fmtDate(v as string) },
  {
    key: 'total_qty',
    label: 'Qty',
    align: 'right',
    render: (v) => <span className="tabular-nums">{v != null ? Number(v).toLocaleString('en', { maximumFractionDigits: 2 }) : '—'}</span>,
  },
  {
    key: 'per_billed',
    label: 'Billed %',
    align: 'right',
    render: (v) => <span className="tabular-nums">{v != null ? `${Number(v).toFixed(0)}%` : '—'}</span>,
  },
  {
    key: 'status',
    label: 'Status',
    render: (v, row) => <StatusBadge status={v as string} docstatus={row.docstatus} />,
  },
]

const STATUS_OPTIONS = ['', 'Draft', 'To Bill', 'Completed', 'Cancelled', 'Return Issued']

export function GRNList() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const q = searchParams.get('q') ?? ''
  const status = searchParams.get('status') ?? ''
  const supplier = searchParams.get('supplier') ?? ''
  const po = searchParams.get('po') ?? ''
  const fromDate = searchParams.get('from') ?? ''
  const toDate = searchParams.get('to') ?? ''

  const [rows, setRows] = useState<PurchaseReceipt[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const filters: Array<[string, string, string, unknown]> = []
      if (q) filters.push(['name', 'like', `%${q}%`, ''])
      if (status) filters.push(['status', '=', status, ''])
      if (supplier) filters.push(['supplier_name', 'like', `%${supplier}%`, ''])
      if (fromDate) filters.push(['posting_date', '>=', fromDate, ''])
      if (toDate) filters.push(['posting_date', '<=', toDate, ''])

      const data = await frappe.getList<PurchaseReceipt>('Purchase Receipt', {
        fields: ['name', 'supplier', 'supplier_name', 'posting_date', 'total_qty', 'per_billed', 'status', 'docstatus'],
        filters: filters.length ? filters : undefined,
        limit: 100,
        order_by: 'posting_date desc',
      })

      // Filter client-side if ?po= is set (child table link)
      const filtered = po
        ? data.filter((r) => r.name.includes(po))
        : data

      setRows(filtered)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load purchase receipts')
    } finally {
      setLoading(false)
    }
  }, [q, status, supplier, po, fromDate, toDate])

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
        title={po ? `GRNs for ${po}` : 'Purchase Receipts (GRN)'}
        subtitle={`${rows.length} results`}
      />

      <FilterRow>
        <FieldWrap label="GRN No.">
          <input className={inputCls + ' w-40'} value={q} onChange={(e) => update('q', e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void load()} placeholder="MAT-PRE-…" />
        </FieldWrap>
        <FieldWrap label="Supplier">
          <input className={inputCls + ' w-44'} value={supplier} onChange={(e) => update('supplier', e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void load()} placeholder="Supplier name…" />
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
        emptyMessage="No purchase receipts match your search."
        onRowClick={(row) => navigate(`/purchases/grn/${encodeURIComponent(row.name)}`)}
      />
    </div>
  )
}
