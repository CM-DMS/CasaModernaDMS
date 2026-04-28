import { useState, useCallback } from 'react'
import { frappe } from '../../api/frappe'
import {
  PageHeader, FilterRow, FieldWrap, DataTable, ErrorBox, Btn,
  inputCls, type Column,
} from '../../components/shared/ui'

interface StockBin {
  item_code: string
  item_name?: string
  warehouse: string
  stock_uom?: string
  actual_qty: number
  reserved_qty: number
  ordered_qty: number
}

const COLUMNS: Column<StockBin>[] = [
  {
    key: 'item_code',
    label: 'Item',
    render: (v, row) => (
      <div>
        <div className="font-mono text-[12px] font-medium">{v as string}</div>
        {row.item_name && row.item_name !== v && (
          <div className="text-[11px] text-gray-500 truncate max-w-xs">{row.item_name}</div>
        )}
      </div>
    ),
  },
  { key: 'warehouse', label: 'Warehouse' },
  { key: 'stock_uom', label: 'UOM' },
  {
    key: 'actual_qty',
    label: 'On Hand',
    align: 'right',
    render: (v) => <span className="tabular-nums font-medium">{Number(v).toFixed(2)}</span>,
  },
  {
    key: 'reserved_qty',
    label: 'Reserved',
    align: 'right',
    render: (v) => <span className="tabular-nums text-amber-700">{Number(v).toFixed(2)}</span>,
  },
  {
    key: 'ordered_qty',
    label: 'On Order',
    align: 'right',
    render: (v) => <span className="tabular-nums text-blue-700">{Number(v).toFixed(2)}</span>,
  },
  {
    key: 'actual_qty',
    label: 'Free to Sell',
    align: 'right',
    render: (_v, row) => {
      const free = Number(row.actual_qty || 0) - Number(row.reserved_qty || 0)
      return <span className={`tabular-nums font-medium ${free > 0 ? 'text-cm-green' : 'text-red-600'}`}>{free.toFixed(2)}</span>
    },
  },
]

export function StockBalances() {
  const [itemCode, setItemCode] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [rows, setRows] = useState<StockBin[]>([])
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
      // Only show bins with stock or on order
      filters.push(['actual_qty', '!=', 0, ''])

      const bins = await frappe.getList<StockBin>('Bin', {
        fields: ['item_code', 'warehouse', 'stock_uom', 'actual_qty', 'reserved_qty', 'ordered_qty'],
        filters,
        limit: 500,
        order_by: 'item_code asc',
      })

      // Enrich with item names
      if (bins.length > 0) {
        const codes = [...new Set(bins.map((b) => b.item_code))]
        try {
          const items = await frappe.getList<{ name: string; item_name: string }>('Item', {
            fields: ['name', 'item_name'],
            filters: [['name', 'in', codes as unknown as string, '']],
            limit: codes.length,
          })
          const nameMap = Object.fromEntries(items.map((i) => [i.name, i.item_name]))
          bins.forEach((b) => { b.item_name = nameMap[b.item_code] || '' })
        } catch { /* non-fatal */ }
      }

      setRows(bins)
      setSearched(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load stock data')
    } finally {
      setLoading(false)
    }
  }, [itemCode, warehouse])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stock Balances"
        subtitle={searched ? `${rows.length} bins` : undefined}
      />

      <FilterRow>
        <FieldWrap label="Item Code">
          <input className={inputCls + ' w-48'} value={itemCode}
            onChange={(e) => setItemCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
            placeholder="Filter by item…" />
        </FieldWrap>
        <FieldWrap label="Warehouse">
          <input className={inputCls + ' w-48'} value={warehouse}
            onChange={(e) => setWarehouse(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
            placeholder="Filter by warehouse…" />
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
          Enter a filter and click Search to view stock levels.
        </div>
      )}

      {searched && (
        <DataTable
          columns={COLUMNS}
          rows={rows}
          loading={loading}
          emptyMessage="No stock found for those filters."
        />
      )}
    </div>
  )
}
