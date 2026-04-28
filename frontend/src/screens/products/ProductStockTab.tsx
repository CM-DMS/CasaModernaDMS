/**
 * ProductStockTab — warehouse stock balances, recent movements, and batch breakdown (V3).
 */
import { useState, useEffect } from 'react'
import { CMSection } from '../../components/ui/CMComponents'
import { stockApi } from '../../api/stockBalances'
import { frappe } from '../../api/frappe'
import { fmtDate } from '../../utils/pricing'
import type { ItemDoc } from '../../api/products'
import type { BinRow, StockLedgerEntry } from '../../api/stockBalances'

interface Props {
  item: ItemDoc
}

interface BatchRow {
  batch_no: string
  warehouse: string
  qty: number
  manufacturing_date?: string
}

function fmt(n: number | null | undefined): string {
  if (n == null) return '—'
  const num = Number(n)
  return Number.isFinite(num)
    ? num.toLocaleString(undefined, { maximumFractionDigits: 3 })
    : '—'
}

export function ProductStockTab({ item }: Props) {
  const [bins, setBins] = useState<BinRow[]>([])
  const [batches, setBatches] = useState<BatchRow[]>([])
  const [movements, setMovements] = useState<StockLedgerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      stockApi.getBins({ itemCode: item.item_code }),
      item.has_batch_no
        ? frappe
            .call<BatchRow[]>('casamoderna_dms.batch_tracking.get_batch_stock', {
              item_code: item.item_code,
            })
            .catch(() => [] as BatchRow[])
        : Promise.resolve([] as BatchRow[]),
      stockApi.getLedgerEntries({ itemCode: item.item_code, limit: 10 }).catch(() => []),
    ])
      .then(([binRows, batchRows, ledgerRows]) => {
        setBins(Array.isArray(binRows) ? binRows : [])
        setBatches(Array.isArray(batchRows) ? batchRows : [])
        setMovements(Array.isArray(ledgerRows) ? ledgerRows : [])
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load stock'))
      .finally(() => setLoading(false))
  }, [item.item_code, item.has_batch_no])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 rounded-full border-4 border-cm-green border-t-transparent animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    )
  }

  const reorderLevel = Number((item as Record<string, unknown>).reorder_level || 0)
  const totalOnHand = bins.reduce((s, b) => s + Number(b.actual_qty || 0), 0)
  const belowReorder = reorderLevel > 0 && totalOnHand < reorderLevel

  return (
    <>
      <CMSection title="Stock Balances">
        {belowReorder && (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-800">
            <span className="text-lg">⚠️</span>
            <span>
              Total stock ({fmt(totalOnHand)} {item.stock_uom}) is below reorder level of{' '}
              <strong>{fmt(reorderLevel)}</strong>.
              {(item as Record<string, unknown>).min_order_qty
                ? ` Min order qty: ${fmt(Number((item as Record<string, unknown>).min_order_qty))}.`
                : ''}
            </span>
          </div>
        )}

        {bins.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">No stock on hand for this item.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  {['Warehouse', 'On Hand', 'Reserved', 'On Order', 'Free to Sell', 'Projected'].map(
                    (h, i) => (
                      <th
                        key={h}
                        className={`pb-2 pr-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400 ${i > 0 ? 'text-right' : ''}`}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {bins.map((b, i) => {
                  const actual = Number(b.actual_qty || 0)
                  const reserved = Number(b.reserved_qty || 0)
                  const ordered = Number(b.ordered_qty || 0)
                  const freeToSell = actual - reserved
                  const projected = actual + ordered - reserved
                  const rowBelowReorder = reorderLevel > 0 && actual < reorderLevel
                  return (
                    <tr
                      key={b.warehouse ?? i}
                      className={`border-b border-gray-100 last:border-0 hover:bg-gray-50 ${rowBelowReorder ? 'bg-amber-50' : ''}`}
                    >
                      <td className="py-2 pr-4 text-gray-800 font-medium">
                        {b.warehouse}
                        {rowBelowReorder && (
                          <span className="ml-1 text-amber-500 text-xs">⚠</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-gray-900 font-medium">
                        {fmt(actual)}{' '}
                        <span className="text-gray-400 text-[11px]">{b.stock_uom}</span>
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-gray-600">
                        {fmt(reserved)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-gray-600">
                        {fmt(ordered)}
                      </td>
                      <td
                        className={`py-2 pr-4 text-right tabular-nums font-medium ${freeToSell < 0 ? 'text-red-600' : 'text-gray-700'}`}
                      >
                        {fmt(freeToSell)}
                      </td>
                      <td className="py-2 text-right tabular-nums text-indigo-700 font-medium">
                        {fmt(projected)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {bins.length > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-100">
            <dl className="flex gap-6 flex-wrap">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  Total On Hand
                </dt>
                <dd className="text-sm font-medium text-gray-900 tabular-nums">
                  {fmt(totalOnHand)}{' '}
                  <span className="text-gray-500 text-[11px]">{item.stock_uom}</span>
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  Warehouses
                </dt>
                <dd className="text-sm text-gray-900">{bins.length}</dd>
              </div>
              {reorderLevel > 0 && (
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Reorder Level
                  </dt>
                  <dd
                    className={`text-sm font-medium tabular-nums ${belowReorder ? 'text-amber-700' : 'text-gray-900'}`}
                  >
                    {fmt(reorderLevel)} {item.stock_uom}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </CMSection>

      {movements.length > 0 && (
        <CMSection title="Recent Stock Movements">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  {['Date', 'Type', 'Voucher', 'Warehouse', 'Qty Change'].map((h, i) => (
                    <th
                      key={h}
                      className={`pb-2 pr-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400 ${i === 4 ? 'text-right' : ''}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {movements.map((m, i) => {
                  const change = Number(m.actual_qty || 0)
                  return (
                    <tr
                      key={m.name || i}
                      className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                    >
                      <td className="py-2 pr-4 text-gray-600 text-[12px]">
                        {fmtDate(m.posting_date)}
                      </td>
                      <td className="py-2 pr-4 text-gray-700 text-[12px]">
                        {m.voucher_type || '—'}
                      </td>
                      <td className="py-2 pr-4 font-mono text-[11px] text-cm-green">
                        {m.voucher_no ? (
                          <a
                            href={`/app/${encodeURIComponent((m.voucher_type || '').toLowerCase().replace(/\s+/g, '-'))}/${encodeURIComponent(m.voucher_no)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline"
                          >
                            {m.voucher_no}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-2 pr-4 text-gray-600 text-[12px]">{m.warehouse}</td>
                      <td
                        className={`py-2 text-right tabular-nums font-medium text-[13px] ${change >= 0 ? 'text-green-700' : 'text-red-600'}`}
                      >
                        {change >= 0 ? '+' : ''}
                        {fmt(change)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CMSection>
      )}

      {item.has_batch_no && (
        <CMSection title="Batches / Consignments (FIFO)">
          {batches.length === 0 ? (
            <p className="text-sm text-gray-400 py-4">No batch stock on hand.</p>
          ) : (
            <>
              <p className="text-[11px] text-gray-400 mb-3">
                Each batch represents a separate stock arrival. Ship from the oldest batch first
                (🟢).
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 text-left">
                      <th className="pb-2 w-6"></th>
                      {['Batch Code', 'Warehouse', 'Qty', 'Received'].map((h, i) => (
                        <th
                          key={h}
                          className={`pb-2 pr-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400 ${i === 2 ? 'text-right' : ''}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((b, i) => (
                      <tr
                        key={`${b.batch_no}-${b.warehouse}`}
                        className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                      >
                        <td className="py-2 pr-2 text-center">{i === 0 ? '🟢' : '🔵'}</td>
                        <td className="py-2 pr-4">
                          <span className="font-mono text-[12px] font-medium text-cm-green bg-green-50 px-1.5 py-0.5 rounded">
                            {b.batch_no}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-gray-600">{b.warehouse}</td>
                        <td className="py-2 pr-4 text-right tabular-nums font-medium text-gray-900">
                          {fmt(b.qty)}{' '}
                          <span className="text-gray-400 text-[11px]">{item.stock_uom}</span>
                        </td>
                        <td className="py-2 text-gray-500 text-[12px]">
                          {b.manufacturing_date || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CMSection>
      )}
    </>
  )
}
