/**
 * StockAdjustmentList — list of Stock Entries (Material Receipt / Material Issue).
 * Route: /warehouse/adjustments
 */
import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader, FilterRow, DataTable, ErrorBox, Btn, selectCls, inputCls, type Column } from '../../components/shared/ui'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { usePermissions } from '../../auth/PermissionsProvider'
import { frappe } from '../../api/frappe'
import { fmtDate } from '../../utils/fmt'

const DOCTYPE = 'Stock Entry'
const LIST_FIELDS = ['name', 'stock_entry_type', 'posting_date', 'total_amount', 'docstatus', 'modified']
const ADJUSTMENT_TYPES = ['Material Receipt', 'Material Issue']

const TYPE_COLOURS: Record<string, string> = {
  'Material Receipt': 'bg-green-100 text-green-800',
  'Material Issue':   'bg-red-100 text-red-800',
}

interface StockEntry {
  name: string
  stock_entry_type: string
  posting_date: string
  total_amount?: number
  docstatus: number
  modified?: string
}

const COLUMNS: Column<StockEntry>[] = [
  {
    key: 'name',
    label: 'Reference',
    render: (v) => <span className="font-mono text-[12px] font-medium text-cm-green">{v as string}</span>,
  },
  {
    key: 'stock_entry_type',
    label: 'Type',
    render: (v) => (
      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${TYPE_COLOURS[v as string] ?? 'bg-gray-100 text-gray-700'}`}>
        {v as string}
      </span>
    ),
  },
  { key: 'posting_date', label: 'Date', render: (v) => fmtDate(v as string) },
  {
    key: 'total_amount',
    label: 'Total Amount',
    render: (v) => v != null ? Number(v).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—',
  },
  {
    key: 'docstatus',
    label: 'Status',
    render: (v) => <StatusBadge docstatus={v as number} />,
  },
]

export function StockAdjustmentList() {
  const navigate = useNavigate()
  const { can }  = usePermissions()

  const [purpose,  setPurpose]  = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate,   setToDate]   = useState('')
  const [rows,     setRows]     = useState<StockEntry[]>([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const runSearch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const filters: unknown[] = [['stock_entry_type', 'in', ADJUSTMENT_TYPES]]
      if (purpose)  filters.push(['stock_entry_type', '=', purpose])
      if (fromDate) filters.push(['posting_date', '>=', fromDate])
      if (toDate)   filters.push(['posting_date', '<=', toDate])

      const data = await frappe.getList<StockEntry>(DOCTYPE, {
        fields: LIST_FIELDS,
        filters,
        order_by: 'posting_date desc',
        limit: 200,
      })
      setRows(Array.isArray(data) ? data : [])
    } catch (err: unknown) {
      setError((err as Error).message || 'Search failed')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [purpose, fromDate, toDate])

  useEffect(() => { runSearch() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stock Adjustments"
        subtitle="Material Receipts and Material Issues"
        actions={
          (can('canWarehouse') || can('canAdmin')) && (
            <Btn onClick={() => navigate('/warehouse/adjustments/new')}>+ New Adjustment</Btn>
          )
        }
      />

      <FilterRow>
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Type</label>
          <select className={selectCls} value={purpose} onChange={(e) => setPurpose(e.target.value)}>
            <option value="">All Types</option>
            {ADJUSTMENT_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">From</label>
          <input type="date" className={inputCls} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">To</label>
          <input type="date" className={inputCls} value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <Btn onClick={runSearch}>Search</Btn>
      </FilterRow>

      {error && <ErrorBox message={error} />}

      <DataTable<StockEntry>
        columns={COLUMNS}
        rows={rows}
        loading={loading}
        emptyMessage="No adjustments found."
        onRowClick={(row) => navigate(`/warehouse/adjustments/${encodeURIComponent(row.name)}`)}
      />
    </div>
  )
}
