import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import {
  PageHeader, FilterRow, FieldWrap, DataTable, ErrorBox, Btn,
  inputCls, selectCls, type Column,
} from '../../components/shared/ui'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { fmtDate, fmtMoney } from '../../utils/fmt'

interface PurchaseOrder {
  name: string
  supplier?: string
  supplier_name?: string
  transaction_date?: string
  schedule_date?: string
  grand_total?: number
  currency?: string
  status?: string
  docstatus?: number
  per_received?: number
  per_billed?: number
  cm_po_stage?: string
}

function StageBadge({ stage }: { stage?: string }) {
  if (stage === 'Pricing Inquiry')
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">Pricing Inquiry</span>
  if (stage === 'Confirmed')
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-700">Confirmed</span>
  return null
}

function PctBar({ value, label, color = 'bg-green-500' }: { value?: number; label: string; color?: string }) {
  const pct = Math.min(100, Math.max(0, Number(value) || 0))
  return (
    <div className="text-[10px] text-gray-500 min-w-[90px]">
      <div className="flex justify-between mb-0.5"><span>{label}</span><span>{pct.toFixed(0)}%</span></div>
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

const COLUMNS: Column<PurchaseOrder>[] = [
  {
    key: 'name',
    label: 'PO No.',
    render: (v) => <span className="font-mono text-[12px] text-cm-green font-semibold">{v as string}</span>,
  },
  { key: 'supplier_name', label: 'Supplier' },
  {
    key: 'cm_po_stage',
    label: 'Stage',
    render: (v) => <StageBadge stage={v as string} />,
  },
  { key: 'transaction_date', label: 'Date', render: (v) => fmtDate(v as string) },
  { key: 'schedule_date', label: 'Required By', render: (v) => fmtDate(v as string) || '—' },
  {
    key: 'grand_total',
    label: 'Total',
    align: 'right',
    render: (v) => <span className="tabular-nums font-medium">{fmtMoney(v as number)}</span>,
  },
  {
    key: 'per_received',
    label: 'Progress',
    render: (_v, row) => (
      <div className="space-y-1">
        <PctBar value={row.per_received} label="Received" color="bg-cm-green" />
        <PctBar value={row.per_billed} label="Billed" color="bg-blue-400" />
      </div>
    ),
  },
  {
    key: 'status',
    label: 'Status',
    render: (v, row) => <StatusBadge status={v as string} docstatus={row.docstatus} />,
  },
]

const STATUS_OPTIONS = ['', 'Draft', 'To Receive and Bill', 'To Bill', 'To Receive', 'Completed', 'Cancelled', 'Closed']

export function PurchaseOrderList() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const q = searchParams.get('q') ?? ''
  const status = searchParams.get('status') ?? ''
  const supplier = searchParams.get('supplier') ?? ''
  const fromDate = searchParams.get('from') ?? ''
  const toDate = searchParams.get('to') ?? ''

  const [rows, setRows] = useState<PurchaseOrder[]>([])
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
      if (fromDate) filters.push(['transaction_date', '>=', fromDate, ''])
      if (toDate) filters.push(['transaction_date', '<=', toDate, ''])

      const data = await frappe.getList<PurchaseOrder>('Purchase Order', {
        fields: ['name', 'supplier', 'supplier_name', 'transaction_date', 'schedule_date',
          'grand_total', 'currency', 'status', 'docstatus', 'per_received', 'per_billed', 'cm_po_stage'],
        filters: filters.length ? filters : undefined,
        limit: 100,
        order_by: 'transaction_date desc',
      })
      setRows(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load purchase orders')
    } finally {
      setLoading(false)
    }
  }, [q, status, supplier, fromDate, toDate])

  useEffect(() => { void load() }, [load])

  const update = (key: string, value: string) => {
    const p = new URLSearchParams(searchParams)
    if (value) p.set(key, value)
    else p.delete(key)
    setSearchParams(p)
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Purchase Orders" subtitle={`${rows.length} results`} />

      <FilterRow>
        <FieldWrap label="PO / Reference">
          <input className={inputCls + ' w-40'} value={q} onChange={(e) => update('q', e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void load()} placeholder="PO-2026-…" />
        </FieldWrap>
        <FieldWrap label="Supplier">
          <input className={inputCls + ' w-44'} value={supplier} onChange={(e) => update('supplier', e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void load()} placeholder="Supplier name…" />
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
        emptyMessage="No purchase orders match your search."
        onRowClick={(row) => navigate(`/purchases/orders/${encodeURIComponent(row.name)}`)}
      />
    </div>
  )
}
