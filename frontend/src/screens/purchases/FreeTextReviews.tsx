/**
 * FreeTextReviews — purchasing manager review queue for free-text SO lines.
 * Shows every un-listed product line so purchasing can create catalogue entries and place orders.
 * Route: /purchases/freetext-reviews
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import { usePermissions } from '../../auth/PermissionsProvider'
import { PageHeader, FilterRow, DataTable, ErrorBox, Btn, inputCls, selectCls, type Column } from '../../components/shared/ui'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { fmtMoney, fmtDate } from '../../utils/fmt'

interface FreeTextRow {
  so_name: string; transaction_date: string; customer_name: string
  item_name: string; description: string
  qty: number; uom: string; rate: number; amount: number
  so_status: string; so_docstatus: number
}

const SO_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'Draft', label: 'Draft' },
  { value: 'To Deliver and Bill', label: 'On Hold' },
  { value: 'To Deliver', label: 'To Deliver' },
  { value: 'To Bill', label: 'To Bill' },
  { value: 'Completed', label: 'Completed' },
  { value: 'Cancelled', label: 'Cancelled' },
]

const COLUMNS: Column<FreeTextRow>[] = [
  {
    key: 'so_name', label: 'Sales Order',
    render: (v, row) => (
      <div>
        <span className="font-mono text-[12px] text-cm-green font-semibold">{v as string}</span>
        <div className="text-[11px] text-gray-500 mt-0.5">{fmtDate(row.transaction_date)}</div>
      </div>
    ),
  },
  { key: 'customer_name', label: 'Customer', render: v => <span className="text-sm">{v as string}</span> },
  {
    key: 'item_name', label: 'Description',
    render: (v, row) => (
      <div className="max-w-sm">
        <div className="text-sm font-medium text-gray-800 leading-snug">{v as string}</div>
        {row.description && row.description !== (v as string) && (
          <div className="text-[11px] text-gray-400 mt-0.5 whitespace-pre-line line-clamp-3">{row.description}</div>
        )}
      </div>
    ),
  },
  {
    key: 'qty', label: 'Qty', align: 'right',
    render: (v, row) => (
      <span className="text-sm">
        {Number(v).toLocaleString('en', { maximumFractionDigits: 2 })}
        {row.uom && row.uom !== 'Nos' && <span className="text-gray-400 ml-1 text-[11px]">{row.uom}</span>}
      </span>
    ),
  },
  { key: 'rate',   label: 'Unit Price', align: 'right', render: v => <span className="text-sm">{fmtMoney(v as number)}</span> },
  { key: 'amount', label: 'Total',      align: 'right', render: v => <span className="text-sm font-semibold">{fmtMoney(v as number)}</span> },
  {
    key: 'so_status', label: 'SO Status',
    render: (v, row) => <StatusBadge docstatus={row.so_docstatus} status={v as string} />,
  },
]

export function FreeTextReviews() {
  const navigate  = useNavigate()
  const { can }   = usePermissions()
  const [rows, setRows]         = useState<FreeTextRow[]>([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [q, setQ]               = useState('')
  const [soStatus, setSoStatus] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate]     = useState('')

  if (!can('canPurchasing') && !can('canAdmin')) {
    return <div className="p-6 text-sm text-gray-500">Only purchasing staff can access this screen.</div>
  }

  async function load(opts: { q?: string; soStatus?: string; fromDate?: string; toDate?: string } = {}) {
    setLoading(true); setError(null)
    try {
      const data = await frappe.call<FreeTextRow[]>(
        'casamoderna_dms.freetext_reviews_api.get_free_text_reviews',
        {
          q:          opts.q         ?? q,
          so_status:  opts.soStatus  ?? soStatus,
          from_date:  opts.fromDate  ?? fromDate,
          to_date:    opts.toDate    ?? toDate,
          limit:      300,
        },
      )
      setRows(Array.isArray(data) ? data : [])
    } catch (err: unknown) { setError((err as Error).message ?? 'Failed') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const totalAmount = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0)

  return (
    <div className="space-y-4">
      <PageHeader title="Free Text Reviews" />

      <FilterRow>
        <input className={inputCls} value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load()}
          placeholder="SO #, customer, description…" />
        <select className={selectCls} value={soStatus}
          onChange={e => { setSoStatus(e.target.value); load({ soStatus: e.target.value }) }}>
          {SO_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input type="date" className={inputCls} value={fromDate} onChange={e => setFromDate(e.target.value)} />
        <input type="date" className={inputCls} value={toDate} onChange={e => setToDate(e.target.value)} />
        <Btn onClick={() => load()} disabled={loading}>Search</Btn>
      </FilterRow>

      {error && <ErrorBox message={error} />}

      {!loading && rows.length > 0 && (
        <div className="text-sm text-gray-500 px-1">
          {rows.length} line{rows.length !== 1 ? 's' : ''} · total{' '}
          <span className="font-semibold text-gray-700">{fmtMoney(totalAmount)}</span>
        </div>
      )}

      <DataTable
        columns={COLUMNS}
        rows={rows}
        loading={loading}
        emptyMessage="No free-text lines found."
        onRowClick={row => navigate(`/sales/orders/${encodeURIComponent(row.so_name)}`)}
      />
    </div>
  )
}
