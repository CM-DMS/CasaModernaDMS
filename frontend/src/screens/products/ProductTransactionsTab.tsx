/**
 * ProductTransactionsTab — recent transactions containing this item (V3).
 *
 * Uses Frappe child-table filter syntax to query parent doctypes.
 * Gating: Sales Orders/DNs/Invoices → canSales; Purchase Orders → canPurchasing.
 */
import { useState, useEffect } from 'react'
import { CMSection } from '../../components/ui/CMComponents'
import { frappe } from '../../api/frappe'
import { usePermissions } from '../../auth/PermissionsProvider'
import { fmtDate } from '../../utils/pricing'
import type { ItemDoc } from '../../api/products'

interface Props {
  item: ItemDoc
}

const LIMIT = 30

function ErpLink({ doctype, name }: { doctype: string; name: string }) {
  const slug = doctype.toLowerCase().replace(/\s+/g, '-')
  return (
    <a
      href={`/app/${encodeURIComponent(slug)}/${encodeURIComponent(name)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-cm-green hover:underline font-mono text-[12px]"
    >
      {name}
    </a>
  )
}

function StatusBadge({ status }: { status?: string }) {
  if (!status) return <span className="text-gray-400">—</span>
  const s = status.toLowerCase()
  const cls = s.includes('cancel')
    ? 'bg-red-100 text-red-700'
    : s.includes('complet') || s.includes('fully') || s.includes('deliver')
    ? 'bg-green-100 text-green-700'
    : s.includes('draft')
    ? 'bg-gray-100 text-gray-600'
    : 'bg-blue-100 text-blue-700'
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${cls}`}
    >
      {status}
    </span>
  )
}

interface TxColumn<T> {
  key: keyof T & string
  label: string
  render?: (value: T[keyof T], row: T) => React.ReactNode
}

function TxTable<T extends Record<string, unknown>>({
  title,
  rows,
  loading,
  error,
  columns,
}: {
  title: string
  rows: T[]
  loading: boolean
  error: string | null
  columns: TxColumn<T>[]
}) {
  return (
    <CMSection title={title}>
      {loading && (
        <div className="flex items-center gap-2 py-4 text-sm text-gray-400">
          <div className="h-4 w-4 rounded-full border-2 border-cm-green border-t-transparent animate-spin" />
          Loading…
        </div>
      )}
      {!loading && error && <p className="text-sm text-red-600 py-2">{error}</p>}
      {!loading && !error && rows.length === 0 && (
        <p className="text-sm text-gray-400 py-2">No records found.</p>
      )}
      {!loading && !error && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className="pb-2 pr-4 last:pr-0 text-[11px] font-semibold uppercase tracking-wider text-gray-400"
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={(row.name as string) || i}
                  className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                >
                  {columns.map((c) => (
                    <td key={c.key} className="py-2 pr-4 last:pr-0 text-gray-700">
                      {c.render ? c.render(row[c.key], row) : String(row[c.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length >= LIMIT && (
            <p className="text-[11px] text-gray-400 mt-2">
              Showing most recent {LIMIT} records.
            </p>
          )}
        </div>
      )}
    </CMSection>
  )
}

function useParentTransactions<T extends Record<string, unknown>>(
  itemCode: string,
  parentDoctype: string,
  childDoctype: string,
  fields: string[],
  orderBy: string,
): { rows: T[]; loading: boolean; error: string | null } {
  const [rows, setRows] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    frappe
      .call<T[]>('frappe.client.get_list', {
        doctype: parentDoctype,
        fields,
        filters: [[childDoctype, 'item_code', '=', itemCode]],
        limit_page_length: LIMIT,
        order_by: orderBy,
      })
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch((err) => setError(err instanceof Error ? err.message : 'Load failed'))
      .finally(() => setLoading(false))
  }, [itemCode, parentDoctype, childDoctype, orderBy]) // fields is stable

  return { rows, loading, error }
}

interface VelocityData {
  qty_30d: number
  qty_90d: number
  qty_365d: number
}

export function ProductTransactionsTab({ item }: Props) {
  const { can } = usePermissions()
  const canSales = can('canSales') || can('canAdmin')
  const canPurchasing = can('canPurchasing') || can('canAdmin')

  const [velocity, setVelocity] = useState<VelocityData | null>(null)
  useEffect(() => {
    frappe
      .call<VelocityData>('casamoderna_dms.api.catalogue_search.get_item_sales_velocity', {
        item_code: item.item_code,
      })
      .then((d) => setVelocity(d))
      .catch(() => {})
  }, [item.item_code])

  type SoRow = { name: string; transaction_date: string; customer: string; status: string; delivery_date: string }
  type DnRow = { name: string; posting_date: string; customer: string; status: string }
  type PoRow = { name: string; transaction_date: string; supplier: string; status: string; schedule_date: string }
  type SiRow = { name: string; posting_date: string; customer: string; status: string }

  const so = useParentTransactions<SoRow>(
    item.item_code,
    'Sales Order',
    'Sales Order Item',
    ['name', 'transaction_date', 'customer', 'status', 'delivery_date'],
    'transaction_date desc',
  )
  const dn = useParentTransactions<DnRow>(
    item.item_code,
    'Delivery Note',
    'Delivery Note Item',
    ['name', 'posting_date', 'customer', 'status'],
    'posting_date desc',
  )
  const po = useParentTransactions<PoRow>(
    item.item_code,
    'Purchase Order',
    'Purchase Order Item',
    ['name', 'transaction_date', 'supplier', 'status', 'schedule_date'],
    'transaction_date desc',
  )
  const si = useParentTransactions<SiRow>(
    item.item_code,
    'Sales Invoice',
    'Sales Invoice Item',
    ['name', 'posting_date', 'customer', 'status'],
    'posting_date desc',
  )

  const soColumns: TxColumn<SoRow>[] = [
    { key: 'name', label: 'Sales Order', render: (v) => <ErpLink doctype="Sales Order" name={v as string} /> },
    { key: 'transaction_date', label: 'Date', render: (v) => fmtDate(v as string) },
    { key: 'customer', label: 'Customer' },
    { key: 'delivery_date', label: 'Delivery', render: (v) => fmtDate(v as string) },
    { key: 'status', label: 'Status', render: (v) => <StatusBadge status={v as string} /> },
  ]
  const dnColumns: TxColumn<DnRow>[] = [
    { key: 'name', label: 'Delivery Note', render: (v) => <ErpLink doctype="Delivery Note" name={v as string} /> },
    { key: 'posting_date', label: 'Date', render: (v) => fmtDate(v as string) },
    { key: 'customer', label: 'Customer' },
    { key: 'status', label: 'Status', render: (v) => <StatusBadge status={v as string} /> },
  ]
  const poColumns: TxColumn<PoRow>[] = [
    { key: 'name', label: 'Purchase Order', render: (v) => <ErpLink doctype="Purchase Order" name={v as string} /> },
    { key: 'transaction_date', label: 'Date', render: (v) => fmtDate(v as string) },
    { key: 'supplier', label: 'Supplier' },
    { key: 'schedule_date', label: 'Expected', render: (v) => fmtDate(v as string) },
    { key: 'status', label: 'Status', render: (v) => <StatusBadge status={v as string} /> },
  ]
  const siColumns: TxColumn<SiRow>[] = [
    { key: 'name', label: 'Invoice', render: (v) => <ErpLink doctype="Sales Invoice" name={v as string} /> },
    { key: 'posting_date', label: 'Date', render: (v) => fmtDate(v as string) },
    { key: 'customer', label: 'Customer' },
    { key: 'status', label: 'Status', render: (v) => <StatusBadge status={v as string} /> },
  ]

  return (
    <div className="space-y-5">
      {canSales && velocity && (
        <div className="flex flex-wrap items-center gap-3 bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-indigo-400">
            Units sold
          </span>
          {[
            { label: '30 days', val: velocity.qty_30d },
            { label: '90 days', val: velocity.qty_90d },
            { label: '1 year', val: velocity.qty_365d },
          ].map(({ label, val }) => (
            <span
              key={label}
              className="inline-flex items-center gap-1.5 bg-white border border-indigo-200 rounded-full px-3 py-1 text-sm font-medium text-indigo-700"
            >
              <span className="text-indigo-400 text-[11px]">{label}</span>
              {val ?? 0}
            </span>
          ))}
        </div>
      )}

      {canSales && (
        <>
          <TxTable
            title="Sales Orders"
            rows={so.rows}
            loading={so.loading}
            error={so.error}
            columns={soColumns}
          />
          <TxTable
            title="Delivery Notes"
            rows={dn.rows}
            loading={dn.loading}
            error={dn.error}
            columns={dnColumns}
          />
          <TxTable
            title="Sales Invoices"
            rows={si.rows}
            loading={si.loading}
            error={si.error}
            columns={siColumns}
          />
        </>
      )}
      {canPurchasing && (
        <TxTable
          title="Purchase Orders"
          rows={po.rows}
          loading={po.loading}
          error={po.error}
          columns={poColumns}
        />
      )}
      {!canSales && !canPurchasing && (
        <p className="text-sm text-gray-400 py-4">
          You do not have access to transactions.
        </p>
      )}
    </div>
  )
}
