/**
 * stockBalances.ts — API layer for warehouse stock enquiries (V3).
 *
 * Uses the Bin doctype for per-item/per-warehouse balances and
 * Stock Ledger Entry for the transaction ledger.
 * Both are read-only — no mutations originate here.
 */
import { frappe } from './frappe'

export interface BinRow {
  item_code: string
  warehouse: string
  actual_qty: number
  reserved_qty: number
  ordered_qty: number
  projected_qty: number
  stock_uom: string
}

export interface StockLedgerEntry {
  name: string
  item_code: string
  warehouse: string
  posting_date: string
  posting_time: string
  actual_qty: number
  qty_after_transaction: number
  voucher_type: string
  voucher_no: string
  incoming_rate: number
  stock_value_difference: number
}

const BIN_FIELDS = [
  'item_code',
  'warehouse',
  'actual_qty',
  'reserved_qty',
  'ordered_qty',
  'projected_qty',
  'stock_uom',
]

const SLE_FIELDS = [
  'name',
  'item_code',
  'warehouse',
  'posting_date',
  'posting_time',
  'actual_qty',
  'qty_after_transaction',
  'voucher_type',
  'voucher_no',
  'incoming_rate',
  'stock_value_difference',
]

const CHUNK = 50

export const stockApi = {
  /**
   * Bin balances — current stock per item+warehouse.
   * When itemCodes is large the list is chunked into batches of 50.
   */
  async getBins({
    itemCode,
    itemCodes,
    warehouse,
    limit = 200,
  }: {
    itemCode?: string
    itemCodes?: string[]
    warehouse?: string
    limit?: number
  } = {}): Promise<BinRow[]> {
    const fetchChunk = (codes?: string[]) => {
      const filters: Array<[string, string, unknown]> = []
      if (codes && codes.length > 0) filters.push(['item_code', 'in', codes])
      else if (itemCode) filters.push(['item_code', 'like', `%${itemCode}%`])
      if (warehouse) filters.push(['warehouse', 'like', `%${warehouse}%`])
      filters.push(['actual_qty', '!=', 0])
      return frappe.getList<BinRow>('Bin', {
        fields: BIN_FIELDS,
        filters,
        limit,
        order_by: 'item_code asc, warehouse asc',
      })
    }

    if (!itemCodes || itemCodes.length <= CHUNK) {
      return fetchChunk(itemCodes)
    }

    const chunks: string[][] = []
    for (let i = 0; i < itemCodes.length; i += CHUNK) {
      chunks.push(itemCodes.slice(i, i + CHUNK))
    }
    const results = await Promise.all(chunks.map(fetchChunk))
    return results.flat()
  },

  /**
   * Stock Ledger Entries — paginated transaction history.
   */
  getLedgerEntries({
    itemCode,
    warehouse,
    fromDate,
    toDate,
    limit = 100,
    limitStart = 0,
  }: {
    itemCode?: string
    warehouse?: string
    fromDate?: string
    toDate?: string
    limit?: number
    limitStart?: number
  } = {}): Promise<StockLedgerEntry[]> {
    const filters: Array<[string, string, string]> = []
    if (itemCode) filters.push(['item_code', 'like', `%${itemCode}%`])
    if (warehouse) filters.push(['warehouse', 'like', `%${warehouse}%`])
    if (fromDate) filters.push(['posting_date', '>=', fromDate])
    if (toDate) filters.push(['posting_date', '<=', toDate])
    return frappe.getList<StockLedgerEntry>('Stock Ledger Entry', {
      fields: SLE_FIELDS,
      filters,
      limit,
      limit_start: limitStart,
      order_by: 'posting_date desc, posting_time desc',
    })
  },
}
