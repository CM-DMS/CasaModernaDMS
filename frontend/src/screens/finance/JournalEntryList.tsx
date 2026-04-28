/**
 * JournalEntryList — Browse accounting journal entries.
 * Click a row to open in ERPNext Desk.
 * Route: /finance/journals
 */
import { useState, useEffect, useCallback } from 'react'
import { frappe } from '../../api/frappe'
import { PageHeader, FilterRow, DataTable, ErrorBox, Btn, inputCls, selectCls, type Column } from '../../components/shared/ui'
import { fmtDate } from '../../utils/fmt'

const today = () => new Date().toISOString().slice(0, 10)
const thirtyDaysAgo = () => {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
}

const VOUCHER_TYPES = [
  'Journal Entry', 'Bank Entry', 'Cash Entry', 'Credit Card Entry',
  'Debit Note', 'Credit Note', 'Contra Entry', 'Excise Entry',
  'Write Off Entry', 'Opening Entry', 'Depreciation Entry',
  'Exchange Rate Revaluation',
]

const STATUS_COLOUR: Record<number, string> = {
  0: 'bg-amber-100 text-amber-800',
  1: 'bg-green-100 text-green-800',
  2: 'bg-red-100 text-red-800',
}
const STATUS_LABELS: Record<number, string> = { 0: 'Draft', 1: 'Submitted', 2: 'Cancelled' }

interface JournalEntry {
  name: string
  voucher_type: string
  posting_date: string
  total_debit: number
  remark: string
  docstatus: number
}

const COLUMNS: Column<JournalEntry>[] = [
  {
    key: 'name', label: 'Reference',
    render: v => <span className="font-medium text-blue-600 hover:underline cursor-pointer">{v as string}</span>,
  },
  { key: 'voucher_type', label: 'Type' },
  { key: 'posting_date', label: 'Date', render: v => fmtDate(v as string) },
  {
    key: 'total_debit', label: 'Total Debit', align: 'right',
    render: v => (
      <span className="tabular-nums">
        {v != null ? Number(v).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
      </span>
    ),
  },
  {
    key: 'remark', label: 'Remark',
    render: v => <span className="text-gray-600 truncate max-w-xs block">{(v as string) || '—'}</span>,
  },
  {
    key: 'docstatus', label: 'Status',
    render: v => (
      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_COLOUR[v as number] ?? 'bg-gray-100 text-gray-700'}`}>
        {STATUS_LABELS[v as number] ?? String(v)}
      </span>
    ),
  },
]

export function JournalEntryList() {
  const [fromDate, setFromDate]       = useState(thirtyDaysAgo())
  const [toDate, setToDate]           = useState(today())
  const [voucherType, setVoucherType] = useState('')
  const [rows, setRows]               = useState<JournalEntry[]>([])
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const filters: Array<[string, string, string]> = [
        ['posting_date', '>=', fromDate],
        ['posting_date', '<=', toDate],
      ]
      if (voucherType) filters.push(['voucher_type', '=', voucherType])

      const data = await frappe.getList<JournalEntry>('Journal Entry', {
        fields: ['name', 'voucher_type', 'posting_date', 'total_debit', 'remark', 'docstatus'],
        filters,
        order_by: 'posting_date desc',
        limit: 200,
      })
      setRows(data)
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Failed to load journal entries')
    } finally {
      setLoading(false)
    }
  }, [fromDate, toDate, voucherType])

  useEffect(() => { load() }, [load])

  function openInDesk(row: JournalEntry) {
    window.open('/app/journal-entry/' + encodeURIComponent(row.name), '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Journal Entries"
        subtitle="Browse accounting journal entries — click a row to open in ERPNext."
      />

      <FilterRow>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">From</label>
            <input type="date" className={inputCls} value={fromDate} onChange={e => setFromDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">To</label>
            <input type="date" className={inputCls} value={toDate} onChange={e => setToDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">Type</label>
            <select className={selectCls} value={voucherType} onChange={e => setVoucherType(e.target.value)}>
              <option value="">All Types</option>
              {VOUCHER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <Btn onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Search'}</Btn>
        </div>
      </FilterRow>

      {error && <ErrorBox message={error} />}

      <DataTable
        columns={COLUMNS}
        rows={rows}
        loading={loading}
        emptyMessage="No journal entries found for this period."
        onRowClick={openInDesk}
      />

      <p className="text-xs text-gray-400">
        {rows.length} entr{rows.length === 1 ? 'y' : 'ies'} · rows open in ERPNext Desk
      </p>
    </div>
  )
}
