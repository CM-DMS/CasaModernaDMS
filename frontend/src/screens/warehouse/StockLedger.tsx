import { useState, useCallback } from 'react'
import { frappe } from '../../api/frappe'
import {
  PageHeader, FilterRow, FieldWrap, DataTable, ErrorBox, Btn,
  inputCls, type Column,
} from '../../components/shared/ui'
import { fmtDate } from '../../utils/fmt'

interface SLEntry {
  posting_date: string
  item_code: string
  warehouse: string
  voucher_type: string
  voucher_no: string
  actual_qty: number
  qty_after_transaction: number
}

const COLUMNS: Column<SLEntry>[] = [
  {
    key: 'posting_date',
    label: 'Date',
    render: (v) => <span className="tabular-nums text-gray-500">{fmtDate(v as string)}</span>,
  },
  {
    key: 'item_code',
    label: 'Item Code',
    render: (v) => <span className="font-mono text-[12px]">{v as string}</span>,
  },
  { key: 'warehouse', label: 'Warehouse' },
  {
    key: 'voucher_type',
    label: 'Type',
    render: (v) => (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">
        {v as string}
      </span>
    ),
  },
  {
    key: 'voucher_no',
    label: 'Reference',
    render: (v) => <span className="font-mono text-[11px] text-blue-600">{v as string}</span>,
  },
  {
    key: 'actual_qty',
    label: 'Qty Change',
    align: 'right',
    render: (v) => {
      const n = Number(v)
      return (
        <span className={`tabular-nums font-medium ${n >= 0 ? 'text-green-700' : 'text-red-700'}`}>
          {n >= 0 ? '+' : ''}{n.toFixed(2)}
        </span>
      )
    },
  },
  {
    key: 'qty_after_transaction',
    label: 'Balance',
    align: 'right',
    render: (v) => <span className="tabular-nums">{Number(v).toFixed(2)}</span>,
  },
]

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

export function StockLedger() {
  const [itemCode, setItemCode] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [fromDate, setFromDate] = useState(daysAgo(30))
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10))

  const [rows, setRows] = useState<SLEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState('')

  const runSearch = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const filters: Array<[string, string, string, unknown]> = []
      if (itemCode) filters.push(['item_code', 'like', `%${itemCode}%`, ''])
      if (warehouse) filters.push(['warehouse', 'like', `%${warehouse}%`, ''])
      if (fromDate) filters.push(['posting_date', '>=', fromDate, ''])
      if (toDate) filters.push(['posting_date', '<=', toDate, ''])

      const data = await frappe.getList<SLEntry>('Stock Ledger Entry', {
        fields: ['posting_date', 'item_code', 'warehouse', 'voucher_type', 'voucher_no', 'actual_qty', 'qty_after_transaction'],
        filters: filters.length ? filters : undefined,
        limit: 200,
        order_by: 'posting_date desc, creation desc',
      })
      setRows(data)
      setSearched(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load stock ledger')
    } finally {
      setLoading(false)
    }
  }, [itemCode, warehouse, fromDate, toDate])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stock Ledger"
        subtitle={searched ? `${rows.length} entries` : undefined}
      />

      <FilterRow>
        <FieldWrap label="Item Code">
          <input className={inputCls + ' w-48'} value={itemCode}
            onChange={(e) => setItemCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
            placeholder="Filter by item…" />
        </FieldWrap>
        <FieldWrap label="Warehouse">
          <input className={inputCls + ' w-44'} value={warehouse}
            onChange={(e) => setWarehouse(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
            placeholder="Filter by warehouse…" />
        </FieldWrap>
        <FieldWrap label="From">
          <input type="date" className={inputCls} value={fromDate}
            onChange={(e) => setFromDate(e.target.value)} />
        </FieldWrap>
        <FieldWrap label="To">
          <input type="date" className={inputCls} value={toDate}
            onChange={(e) => setToDate(e.target.value)} />
        </FieldWrap>
        <div className="flex items-end">
          <Btn onClick={() => void runSearch()} disabled={loading}>
            {loading ? 'Searching…' : 'Search'}
          </Btn>
        </div>
      </FilterRow>

      {error && <ErrorBox message={error} />}

      {!searched && !loading && (
        <div className="text-sm text-gray-400 text-center py-10">
          Set filters and click Search to view ledger entries.
        </div>
      )}

      {searched && (
        <DataTable
          columns={COLUMNS}
          rows={rows}
          loading={loading}
          emptyMessage="No entries found for those filters."
        />
      )}
    </div>
  )
}
