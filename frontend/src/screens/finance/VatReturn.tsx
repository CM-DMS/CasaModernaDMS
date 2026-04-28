/**
 * VatReturn — Malta VAT Return boxes 1-9 with detail drill-down.
 * Gate: canFinanceAccounting || canAdmin
 * Route: /finance/vat-return
 */
import { useState } from 'react'
import { frappe } from '../../api/frappe'
import { usePermissions } from '../../auth/PermissionsProvider'
import { PageHeader, DataTable, ErrorBox, Btn, inputCls, type Column } from '../../components/shared/ui'
import { fmtMoney, fmtDate } from '../../utils/fmt'

const thisMonthFirst = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
const today = () => new Date().toISOString().slice(0, 10)

interface VatDetailSale {
  name: string; posting_date: string; customer_name: string; grand_total: number
  tax_amount: number; net_total: number; status: string
}
interface VatDetailPurchase {
  name: string; posting_date: string; supplier_name: string; grand_total: number
  tax_amount: number; net_total: number; status: string
}
interface VatReturnData {
  date_from: string; date_to: string
  sales_invoices: number; cash_invoices: number; credit_notes: number; purchase_invoices: number
  box1_taxable_sales: number; box2_output_vat: number; box3_eu_acquisitions: number
  box4_total_vat_due: number; box5_input_vat: number; box6_net_payable: number
  box7_total_sales: number; box8_total_purchases: number; box9_exempt_zero: number
  detail_sales: VatDetailSale[]; detail_purchases: VatDetailPurchase[]
}

const SALES_COLS: Column<VatDetailSale>[] = [
  { key: 'posting_date',  label: 'Date',        render: v => fmtDate(v as string) },
  { key: 'name',          label: 'Invoice #' },
  { key: 'customer_name', label: 'Customer',    render: v => <span className="font-medium">{v as string}</span> },
  { key: 'status',        label: 'Status' },
  { key: 'net_total',     label: 'Net Total',   align: 'right', render: v => <span className="tabular-nums">{fmtMoney(v as number)}</span> },
  { key: 'tax_amount',    label: 'VAT',         align: 'right', render: v => <span className="tabular-nums text-amber-700">{fmtMoney(v as number)}</span> },
  { key: 'grand_total',   label: 'Gross Total', align: 'right', render: v => <span className="tabular-nums font-semibold">{fmtMoney(v as number)}</span> },
]

const PURCHASE_COLS: Column<VatDetailPurchase>[] = [
  { key: 'posting_date',  label: 'Date',         render: v => fmtDate(v as string) },
  { key: 'name',          label: 'Bill #' },
  { key: 'supplier_name', label: 'Supplier',     render: v => <span className="font-medium">{v as string}</span> },
  { key: 'status',        label: 'Status' },
  { key: 'net_total',     label: 'Net Total',    align: 'right', render: v => <span className="tabular-nums">{fmtMoney(v as number)}</span> },
  { key: 'tax_amount',    label: 'VAT (Input)',  align: 'right', render: v => <span className="tabular-nums text-green-700">{fmtMoney(v as number)}</span> },
  { key: 'grand_total',   label: 'Gross Total',  align: 'right', render: v => <span className="tabular-nums font-semibold">{fmtMoney(v as number)}</span> },
]

function BoxRow({ boxNo, label, value, highlight = false, section = false, indent = false }: {
  boxNo?: string; label: string; value?: number; highlight?: boolean; section?: boolean; indent?: boolean
}) {
  if (section) return (
    <tr className="bg-gray-50">
      <td colSpan={3} className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">{label}</td>
    </tr>
  )
  return (
    <tr className={`border-b border-gray-100 ${highlight ? 'bg-amber-50' : 'hover:bg-gray-50'}`}>
      <td className={`px-4 py-3 text-xs font-bold text-gray-400 w-16 ${indent ? 'pl-8' : ''}`}>{boxNo}</td>
      <td className={`px-4 py-3 text-sm text-gray-700 ${indent ? 'pl-8' : ''}`}>{label}</td>
      <td className={`px-4 py-3 text-right font-mono text-sm font-semibold tabular-nums ${highlight ? 'text-amber-800' : 'text-gray-900'}`}>
        {value !== undefined ? fmtMoney(value) : '—'}
      </td>
    </tr>
  )
}

type TabId = 'boxes' | 'sales' | 'purchases'

export function VatReturn() {
  const { can }           = usePermissions()
  const [from, setFrom]   = useState(thisMonthFirst())
  const [to, setTo]       = useState(today())
  const [data, setData]   = useState<VatReturnData | null>(null)
  const [tab, setTab]     = useState<TabId>('boxes')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!can('canFinanceAccounting') && !can('canAdmin')) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
        <span className="text-4xl">🔒</span>
        <p className="text-gray-700 font-medium">Access Restricted</p>
        <p className="text-sm text-gray-400">VAT Return is available to Finance Accounting users only.</p>
      </div>
    )
  }

  async function generate() {
    setLoading(true); setError(null)
    try {
      const res = await frappe.call<VatReturnData>(
        'casamoderna_dms.vat_return_api.get_vat_return',
        { date_from: from, date_to: to },
      )
      setData(res)
      setTab('boxes')
    } catch (err: unknown) { setError((err as Error).message ?? 'Failed to generate') }
    finally { setLoading(false) }
  }

  const box6 = data?.box6_net_payable ?? 0

  return (
    <div className="space-y-5">
      <PageHeader title="VAT Return" subtitle="Malta VAT — Boxes 1-9" />

      {/* Controls */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">Period From</label>
            <input type="date" className={inputCls} value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">To</label>
            <input type="date" className={inputCls} value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <Btn onClick={generate} disabled={loading}>{loading ? 'Generating…' : 'Generate'}</Btn>
        </div>
      </div>

      {error && <ErrorBox message={error} />}

      {!data && !loading && (
        <p className="text-sm text-gray-400 text-center py-10">Select a period and click Generate.</p>
      )}

      {data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 text-center">
              <div className="text-xl font-bold text-gray-900">{data.sales_invoices}</div>
              <div className="text-[11px] text-gray-400 mt-1">Sales Invoices</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 text-center">
              <div className="text-xl font-bold text-gray-900">{data.cash_invoices}</div>
              <div className="text-[11px] text-gray-400 mt-1">Cash Invoices</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 text-center">
              <div className="text-xl font-bold text-gray-900">{data.credit_notes}</div>
              <div className="text-[11px] text-gray-400 mt-1">Credit Notes</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 text-center">
              <div className="text-xl font-bold text-gray-900">{data.purchase_invoices}</div>
              <div className="text-[11px] text-gray-400 mt-1">Purchase Invoices</div>
            </div>
          </div>

          {/* Box 6 banner */}
          {box6 > 0 ? (
            <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              VAT Payable: {fmtMoney(box6)} — Box 6 net amount owed to the VAT Department.
            </div>
          ) : box6 < 0 ? (
            <div className="rounded border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
              VAT Refundable: {fmtMoney(Math.abs(box6))} — Input VAT exceeds output VAT.
            </div>
          ) : null}

          {/* Tab bar */}
          <div className="flex gap-1 border-b border-gray-200">
            {(['boxes', 'sales', 'purchases'] as TabId[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
                  tab === t ? 'border-cm-green text-cm-green' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}>
                {t === 'boxes' ? 'VAT Boxes' : t === 'sales' ? `Sales Detail (${data.detail_sales.length})` : `Purchase Detail (${data.detail_purchases.length})`}
              </button>
            ))}
          </div>

          {/* Boxes tab */}
          {tab === 'boxes' && (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-[10px] uppercase tracking-wider text-gray-400">
                    <th className="text-left px-4 py-2 w-16">Box</th>
                    <th className="text-left px-4 py-2">Description</th>
                    <th className="text-right px-4 py-2">Amount (€)</th>
                  </tr>
                </thead>
                <tbody>
                  <BoxRow section label="OUTPUT TAX" />
                  <BoxRow boxNo="1" label="Taxable Sales (excluding VAT)" value={data.box1_taxable_sales} />
                  <BoxRow boxNo="2" label="Output VAT on Taxable Sales (18%)" value={data.box2_output_vat} />
                  <BoxRow boxNo="3" label="EU Acquisitions / Imports (reverse charge)" value={data.box3_eu_acquisitions} indent />
                  <BoxRow boxNo="4" label="Total VAT Due" value={data.box4_total_vat_due} highlight />
                  <BoxRow section label="INPUT TAX" />
                  <BoxRow boxNo="5" label="Input VAT Reclaimable on Purchases" value={data.box5_input_vat} />
                  <BoxRow section label="SUMMARY" />
                  <BoxRow boxNo="6" label="Net VAT Payable / (Refundable)" value={data.box6_net_payable} highlight />
                  <BoxRow section label="ADDITIONAL INFORMATION" />
                  <BoxRow boxNo="7" label="Total Sales (including exempt and zero-rated)" value={data.box7_total_sales} />
                  <BoxRow boxNo="8" label="Total Purchases (including EU acquisitions)" value={data.box8_total_purchases} />
                  <BoxRow boxNo="9" label="Exempt / Zero-Rated Supplies" value={data.box9_exempt_zero} />
                </tbody>
              </table>
            </div>
          )}

          {/* Sales detail tab */}
          {tab === 'sales' && (
            data.detail_sales.length === 0
              ? <p className="text-sm text-gray-400 text-center py-10">No sales transactions found.</p>
              : <DataTable columns={SALES_COLS} rows={data.detail_sales} />
          )}

          {/* Purchase detail tab */}
          {tab === 'purchases' && (
            data.detail_purchases.length === 0
              ? <p className="text-sm text-gray-400 text-center py-10">No purchase transactions found.</p>
              : <DataTable columns={PURCHASE_COLS} rows={data.detail_purchases} />
          )}
        </>
      )}
    </div>
  )
}
