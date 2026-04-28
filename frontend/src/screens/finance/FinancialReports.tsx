/**
 * FinancialReports — Multi-tab financial reports screen.
 * Tabs: Sales Orders, Outstanding (AR), Payments Received, Bills (AP), Commission.
 * Gate: canFinanceReports
 * Route: /finance/reports
 */
import { useState, useCallback } from 'react'
import { frappe } from '../../api/frappe'
import { usePermissions } from '../../auth/PermissionsProvider'
import { PageHeader, DataTable, ErrorBox, Btn, inputCls, type Column } from '../../components/shared/ui'
import { fmtMoney, fmtDate } from '../../utils/fmt'

const TABS = [
  { id: 'sales',       label: 'Sales Orders'     },
  { id: 'outstanding', label: 'Outstanding (AR)'  },
  { id: 'payments',    label: 'Payments Received' },
  { id: 'bills',       label: 'Bills (AP)'        },
  { id: 'commission',  label: 'Commission'        },
] as const

type TabId = typeof TABS[number]['id']

const thisMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
const today = () => new Date().toISOString().slice(0, 10)

function sumField<T extends Record<string, unknown>>(rows: T[], key: string) {
  return rows.reduce((s, r) => s + Number(r[key] ?? 0), 0)
}

function DateRangeBar({ from, to, onFrom, onTo, onRun, loading }: {
  from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void
  onRun: () => void; loading: boolean
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-500">From</label>
        <input type="date" className={inputCls} value={from} onChange={e => onFrom(e.target.value)} />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-500">To</label>
        <input type="date" className={inputCls} value={to} onChange={e => onTo(e.target.value)} />
      </div>
      <Btn onClick={onRun} disabled={loading}>{loading ? 'Loading…' : 'Run'}</Btn>
    </div>
  )
}

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 space-y-1">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className="text-lg font-bold tabular-nums text-gray-900">{value}</div>
    </div>
  )
}

function NotRunYet() {
  return <p className="text-sm text-gray-400 text-center py-10">Set a date range and click Run.</p>
}
function NoData() {
  return <p className="text-sm text-gray-400 text-center py-10">No records found for the selected period.</p>
}
function RowCapWarning({ count }: { count: number }) {
  if (count < 500) return null
  return (
    <div className="rounded border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700">
      Showing first 500 rows — narrow your date range to see all data.
    </div>
  )
}
function downloadCsv(lines: string[], filename: string) {
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}
function ExportCsvBtn({ onClick }: { onClick: () => void }) {
  return (
    <button className="text-xs px-3 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50" onClick={onClick}>
      Export CSV
    </button>
  )
}

// ─── Sales Orders tab ─────────────────────────────────────────────────────────

interface SalesOrder { name: string; transaction_date: string; customer_name: string; cm_sales_person: string; grand_total: number; status: string }

const SO_COLUMNS: Column<SalesOrder>[] = [
  { key: 'transaction_date', label: 'Date',        render: v => fmtDate(v as string) },
  { key: 'name',             label: 'SO #' },
  { key: 'customer_name',    label: 'Customer',    render: v => <span className="font-medium">{v as string}</span> },
  { key: 'cm_sales_person',  label: 'Salesperson' },
  { key: 'status',           label: 'Status' },
  { key: 'grand_total',      label: 'Total', align: 'right', render: v => <span className="tabular-nums font-medium">{fmtMoney(v as number)}</span> },
]

function SalesOrdersTab() {
  const [from, setFrom]       = useState(thisMonth())
  const [to,   setTo]         = useState(today())
  const [rows, setRows]       = useState<SalesOrder[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const run = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await frappe.getList<SalesOrder>('Sales Order', {
        fields: ['name', 'transaction_date', 'customer_name', 'cm_sales_person', 'grand_total', 'status'],
        filters: [['docstatus', '=', '1'], ['transaction_date', '>=', from], ['transaction_date', '<=', to]],
        order_by: 'transaction_date asc', limit: 500,
      })
      setRows(Array.isArray(data) ? data : [])
    } catch (err: unknown) { setError((err as Error).message ?? 'Failed to load') }
    finally { setLoading(false) }
  }, [from, to])

  const total = rows ? sumField(rows, 'grand_total') : 0
  const byPerson = rows ? rows.reduce((acc, r) => {
    const k = r.cm_sales_person || 'Unassigned'
    if (!acc[k]) acc[k] = { count: 0, total: 0 }
    acc[k].count++; acc[k].total += Number(r.grand_total ?? 0)
    return acc
  }, {} as Record<string, { count: number; total: number }>) : {}

  const exportCsv = () => {
    if (!rows) return
    downloadCsv([
      ['Date', 'SO #', 'Customer', 'Salesperson', 'Status', 'Total'].join(','),
      ...rows.map(r => [r.transaction_date, `"${r.name}"`, `"${(r.customer_name ?? '').replace(/"/g, '""')}"`,
        `"${(r.cm_sales_person ?? '').replace(/"/g, '""')}"`, r.status, Number(r.grand_total ?? 0).toFixed(2)].join(',')),
    ], `sales_orders_${from}_${to}.csv`)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg p-4"><DateRangeBar from={from} to={to} onFrom={setFrom} onTo={setTo} onRun={run} loading={loading} /></div>
      {error && <ErrorBox message={error} />}
      {rows === null && !loading && <NotRunYet />}
      {rows !== null && !loading && rows.length === 0 && <NoData />}
      {rows !== null && rows.length > 0 && (
        <>
          <RowCapWarning count={rows.length} />
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">By Salesperson</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {Object.entries(byPerson).sort((a, b) => b[1].total - a[1].total).map(([name, s]) => (
                <div key={name} className="rounded-lg border border-gray-200 bg-white px-4 py-3 space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 truncate">{name}</div>
                  <div className="text-base font-bold tabular-nums text-gray-900">{fmtMoney(s.total)}</div>
                  <div className="text-[11px] text-gray-400">{s.count} order{s.count !== 1 ? 's' : ''}</div>
                </div>
              ))}
              <div className="rounded-lg border-2 border-cm-green bg-cm-green/5 px-4 py-3 space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-cm-green">Total</div>
                <div className="text-base font-bold tabular-nums text-cm-green">{fmtMoney(total)}</div>
                <div className="text-[11px] text-gray-400">{rows.length} orders</div>
              </div>
            </div>
          </div>
          <div>
            <div className="flex justify-end mb-2"><ExportCsvBtn onClick={exportCsv} /></div>
            <DataTable columns={SO_COLUMNS} rows={rows} />
            <div className="flex justify-end text-sm font-semibold tabular-nums py-2 px-3 bg-gray-50 border border-gray-200 border-t-0 rounded-b">
              Total: {fmtMoney(total)}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Outstanding AR tab ───────────────────────────────────────────────────────

interface SalesInvoice { name: string; posting_date: string; customer_name: string; grand_total: number; outstanding_amount: number; status: string }

const AR_COLUMNS: Column<SalesInvoice>[] = [
  { key: 'posting_date',       label: 'Date',           render: v => fmtDate(v as string) },
  { key: 'name',               label: 'Invoice #' },
  { key: 'customer_name',      label: 'Customer',       render: v => <span className="font-medium">{v as string}</span> },
  { key: 'grand_total',        label: 'Invoice Total',  align: 'right', render: v => <span className="tabular-nums">{fmtMoney(v as number)}</span> },
  { key: 'outstanding_amount', label: 'Outstanding',    align: 'right', render: v => <span className="tabular-nums font-semibold text-red-600">{fmtMoney(v as number)}</span> },
  { key: 'status',             label: 'Status' },
]

function OutstandingTab() {
  const [rows, setRows]       = useState<SalesInvoice[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const run = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await frappe.getList<SalesInvoice>('Sales Invoice', {
        fields: ['name', 'posting_date', 'customer_name', 'grand_total', 'outstanding_amount', 'status'],
        filters: [['docstatus', '=', '1'], ['outstanding_amount', '>', '0']],
        order_by: 'posting_date asc', limit: 500,
      })
      setRows(Array.isArray(data) ? data : [])
    } catch (err: unknown) { setError((err as Error).message ?? 'Failed to load') }
    finally { setLoading(false) }
  }, [])

  const totalOut = rows ? sumField(rows, 'outstanding_amount') : 0
  const totalInv = rows ? sumField(rows, 'grand_total') : 0
  const exportCsv = () => {
    if (!rows) return
    downloadCsv([
      ['Date', 'Invoice #', 'Customer', 'Invoice Total', 'Outstanding', 'Status'].join(','),
      ...rows.map(r => [r.posting_date, `"${r.name}"`, `"${(r.customer_name ?? '').replace(/"/g, '""')}"`,
        Number(r.grand_total ?? 0).toFixed(2), Number(r.outstanding_amount ?? 0).toFixed(2), r.status].join(',')),
    ], `outstanding_ar_${today()}.csv`)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center gap-3">
        <p className="text-sm text-gray-500">All posted invoices with an outstanding balance.</p>
        <Btn onClick={run} disabled={loading}>{loading ? 'Loading…' : 'Run'}</Btn>
      </div>
      {error && <ErrorBox message={error} />}
      {rows === null && !loading && <NotRunYet />}
      {rows !== null && !loading && rows.length === 0 && <NoData />}
      {rows !== null && rows.length > 0 && (
        <>
          <RowCapWarning count={rows.length} />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <KpiCard label="Invoices" value={rows.length} />
            <KpiCard label="Total Invoiced" value={fmtMoney(totalInv)} />
            <KpiCard label="Total Outstanding" value={fmtMoney(totalOut)} />
          </div>
          <div>
            <div className="flex justify-end mb-2"><ExportCsvBtn onClick={exportCsv} /></div>
            <DataTable columns={AR_COLUMNS} rows={rows} />
            <div className="flex justify-end text-sm font-semibold tabular-nums py-2 px-3 bg-gray-50 border border-gray-200 border-t-0 rounded-b">
              Outstanding: {fmtMoney(totalOut)}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Payments Received tab ────────────────────────────────────────────────────

interface PaymentEntry { name: string; posting_date: string; party_name: string; paid_amount: number; mode_of_payment: string; reference_no: string }

const PAY_COLUMNS: Column<PaymentEntry>[] = [
  { key: 'posting_date',    label: 'Date',      render: v => fmtDate(v as string) },
  { key: 'name',            label: 'Ref #' },
  { key: 'party_name',      label: 'Customer',  render: v => <span className="font-medium">{v as string}</span> },
  { key: 'mode_of_payment', label: 'Mode' },
  { key: 'reference_no',    label: 'Reference' },
  { key: 'paid_amount',     label: 'Amount', align: 'right', render: v => <span className="tabular-nums font-medium">{fmtMoney(v as number)}</span> },
]

function PaymentsTab() {
  const [from, setFrom]       = useState(thisMonth())
  const [to,   setTo]         = useState(today())
  const [rows, setRows]       = useState<PaymentEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const run = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await frappe.getList<PaymentEntry>('Payment Entry', {
        fields: ['name', 'posting_date', 'party_name', 'paid_amount', 'mode_of_payment', 'reference_no'],
        filters: [['docstatus', '=', '1'], ['payment_type', '=', 'Receive'], ['posting_date', '>=', from], ['posting_date', '<=', to]],
        order_by: 'posting_date asc', limit: 500,
      })
      setRows(Array.isArray(data) ? data : [])
    } catch (err: unknown) { setError((err as Error).message ?? 'Failed to load') }
    finally { setLoading(false) }
  }, [from, to])

  const grandTotal = rows ? sumField(rows, 'paid_amount') : 0
  const byMode = rows ? rows.reduce((acc, r) => {
    const k = r.mode_of_payment || 'Unknown'
    if (!acc[k]) acc[k] = { count: 0, total: 0 }
    acc[k].count++; acc[k].total += Number(r.paid_amount ?? 0)
    return acc
  }, {} as Record<string, { count: number; total: number }>) : {}

  const exportCsv = () => {
    if (!rows) return
    downloadCsv([
      ['Date', 'Ref #', 'Customer', 'Mode', 'Reference', 'Amount'].join(','),
      ...rows.map(r => [r.posting_date, `"${r.name}"`, `"${(r.party_name ?? '').replace(/"/g, '""')}"`,
        `"${(r.mode_of_payment ?? '').replace(/"/g, '""')}"`, `"${(r.reference_no ?? '').replace(/"/g, '""')}"`,
        Number(r.paid_amount ?? 0).toFixed(2)].join(',')),
    ], `payments_${from}_${to}.csv`)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg p-4"><DateRangeBar from={from} to={to} onFrom={setFrom} onTo={setTo} onRun={run} loading={loading} /></div>
      {error && <ErrorBox message={error} />}
      {rows === null && !loading && <NotRunYet />}
      {rows !== null && !loading && rows.length === 0 && <NoData />}
      {rows !== null && rows.length > 0 && (
        <>
          <RowCapWarning count={rows.length} />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.entries(byMode).sort((a, b) => b[1].total - a[1].total).map(([mode, s]) => (
              <div key={mode} className="rounded-lg border border-gray-200 bg-white px-4 py-3 space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{mode}</div>
                <div className="text-base font-bold tabular-nums text-gray-900">{fmtMoney(s.total)}</div>
                <div className="text-[11px] text-gray-400">{s.count} payment{s.count !== 1 ? 's' : ''}</div>
              </div>
            ))}
            <div className="rounded-lg border-2 border-cm-green bg-cm-green/5 px-4 py-3 space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-cm-green">Total</div>
              <div className="text-base font-bold tabular-nums text-cm-green">{fmtMoney(grandTotal)}</div>
              <div className="text-[11px] text-gray-400">{rows.length} payments</div>
            </div>
          </div>
          <div>
            <div className="flex justify-end mb-2"><ExportCsvBtn onClick={exportCsv} /></div>
            <DataTable columns={PAY_COLUMNS} rows={rows} />
            <div className="flex justify-end text-sm font-semibold tabular-nums py-2 px-3 bg-gray-50 border border-gray-200 border-t-0 rounded-b">
              Total Received: {fmtMoney(grandTotal)}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Bills AP tab ─────────────────────────────────────────────────────────────

interface PurchaseInvoice { name: string; posting_date: string; supplier_name: string; grand_total: number; outstanding_amount: number; status: string }

const BILLS_COLUMNS: Column<PurchaseInvoice>[] = [
  { key: 'posting_date',       label: 'Date',        render: v => fmtDate(v as string) },
  { key: 'name',               label: 'Bill #' },
  { key: 'supplier_name',      label: 'Supplier',    render: v => <span className="font-medium">{v as string}</span> },
  { key: 'status',             label: 'Status' },
  { key: 'grand_total',        label: 'Total',       align: 'right', render: v => <span className="tabular-nums">{fmtMoney(v as number)}</span> },
  { key: 'outstanding_amount', label: 'Balance Due', align: 'right', render: v => <span className="tabular-nums font-semibold text-red-600">{fmtMoney(v as number)}</span> },
]

function BillsTab() {
  const [rows, setRows]       = useState<PurchaseInvoice[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const run = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await frappe.getList<PurchaseInvoice>('Purchase Invoice', {
        fields: ['name', 'posting_date', 'supplier_name', 'grand_total', 'outstanding_amount', 'status'],
        filters: [['docstatus', '=', '1'], ['outstanding_amount', '>', '0']],
        order_by: 'posting_date asc', limit: 500,
      })
      setRows(Array.isArray(data) ? data : [])
    } catch (err: unknown) { setError((err as Error).message ?? 'Failed to load') }
    finally { setLoading(false) }
  }, [])

  const totalDue = rows ? sumField(rows, 'outstanding_amount') : 0
  const exportCsv = () => {
    if (!rows) return
    downloadCsv([
      ['Date', 'Bill #', 'Supplier', 'Status', 'Total', 'Balance Due'].join(','),
      ...rows.map(r => [r.posting_date, `"${r.name}"`, `"${(r.supplier_name ?? '').replace(/"/g, '""')}"`,
        r.status, Number(r.grand_total ?? 0).toFixed(2), Number(r.outstanding_amount ?? 0).toFixed(2)].join(',')),
    ], `bills_ap_${today()}.csv`)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center gap-3">
        <p className="text-sm text-gray-500">All open purchase invoices (unpaid balance).</p>
        <Btn onClick={run} disabled={loading}>{loading ? 'Loading…' : 'Run'}</Btn>
      </div>
      {error && <ErrorBox message={error} />}
      {rows === null && !loading && <NotRunYet />}
      {rows !== null && !loading && rows.length === 0 && <NoData />}
      {rows !== null && rows.length > 0 && (
        <>
          <RowCapWarning count={rows.length} />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <KpiCard label="Open Bills" value={rows.length} />
            <KpiCard label="Total Balance Due" value={fmtMoney(totalDue)} />
          </div>
          <div>
            <div className="flex justify-end mb-2"><ExportCsvBtn onClick={exportCsv} /></div>
            <DataTable columns={BILLS_COLUMNS} rows={rows} />
            <div className="flex justify-end text-sm font-semibold tabular-nums py-2 px-3 bg-gray-50 border border-gray-200 border-t-0 rounded-b">
              Total Balance Due: {fmtMoney(totalDue)}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Commission tab ───────────────────────────────────────────────────────────

interface CommissionRow {
  sales_person: string; orders: number; total_ex_vat: number; tier: string; rate: number
  commission: number; team_bonus: number; total_earned: number
}
interface CommissionTotals { orders: number; total_ex_vat: number; commission: number; team_bonus: number; total_earned: number }
interface CommissionResult {
  rows: CommissionRow[]; totals: CommissionTotals
  team_bonus_triggered?: boolean; team_bonus_pool?: number
}

const COMMISSION_COLUMNS: Column<CommissionRow>[] = [
  { key: 'sales_person',  label: 'Salesperson',  render: v => <span className="font-medium">{(v as string) || <span className="text-gray-400 text-xs">Unassigned</span>}</span> },
  { key: 'orders',        label: 'Orders',       align: 'right' },
  { key: 'total_ex_vat',  label: 'Ex-VAT Sales', align: 'right', render: v => <span className="tabular-nums">{fmtMoney(v as number)}</span> },
  { key: 'tier',          label: 'Tier', align: 'center', render: (v, row) => <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700 whitespace-nowrap">{v as string} — {Number(row.rate).toFixed(1)}%</span> },
  { key: 'commission',    label: 'Commission',   align: 'right', render: v => <span className="tabular-nums font-semibold text-cm-green">{fmtMoney(v as number)}</span> },
  { key: 'team_bonus',    label: 'Team Bonus',   align: 'right', render: v => (v as number) > 0 ? <span className="tabular-nums text-emerald-700">{fmtMoney(v as number)}</span> : <span className="text-gray-300">—</span> },
  { key: 'total_earned',  label: 'Total Earned', align: 'right', render: v => <span className="tabular-nums font-bold">{fmtMoney(v as number)}</span> },
]

function CommissionTab() {
  const [from, setFrom]       = useState(thisMonth())
  const [to,   setTo]         = useState(today())
  const [result, setResult]   = useState<CommissionResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const run = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await frappe.call<CommissionResult>(
        'casamoderna_dms.commission_api.get_commission_report',
        { date_from: from, date_to: to },
      )
      setResult(data)
    } catch (err: unknown) { setError((err as Error).message ?? 'Failed to load') }
    finally { setLoading(false) }
  }, [from, to])

  const rows   = result?.rows   ?? null
  const totals = result?.totals ?? null

  const exportCsv = () => {
    if (!rows || !totals) return
    downloadCsv([
      ['Salesperson', 'Orders', 'Ex-VAT Sales', 'Tier', 'Rate %', 'Commission', 'Team Bonus', 'Total Earned'].join(','),
      ...rows.map(r => [`"${r.sales_person || 'Unassigned'}"`, r.orders, r.total_ex_vat.toFixed(2),
        `"${r.tier}"`, r.rate.toFixed(1), r.commission.toFixed(2), r.team_bonus.toFixed(2), r.total_earned.toFixed(2)].join(',')),
      ['TOTAL', totals.orders, totals.total_ex_vat.toFixed(2), '', '', totals.commission.toFixed(2), totals.team_bonus.toFixed(2), totals.total_earned.toFixed(2)].join(','),
    ], `commission_${from}_${to}.csv`)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg p-4"><DateRangeBar from={from} to={to} onFrom={setFrom} onTo={setTo} onRun={run} loading={loading} /></div>
      {error && <ErrorBox message={error} />}
      {result?.team_bonus_triggered && (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 font-medium">
          🎉 Team bonus triggered! €{result.team_bonus_pool?.toLocaleString('en', { minimumFractionDigits: 2 })} pool distributed pro-rata.
        </div>
      )}
      {rows === null && !loading && <NotRunYet />}
      {rows !== null && !loading && rows.length === 0 && <NoData />}
      {rows !== null && rows.length > 0 && totals && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Total Ex-VAT Sales" value={fmtMoney(totals.total_ex_vat)} />
            <KpiCard label="Total Commission"   value={fmtMoney(totals.commission)} />
            <KpiCard label="Team Bonus"         value={fmtMoney(totals.team_bonus)} />
            <KpiCard label="Total Earned"       value={fmtMoney(totals.total_earned)} />
          </div>
          <div>
            <div className="flex justify-end mb-2"><ExportCsvBtn onClick={exportCsv} /></div>
            <DataTable columns={COMMISSION_COLUMNS} rows={rows} />
            <div className="flex justify-end text-sm font-semibold tabular-nums py-2 px-3 bg-gray-50 border border-gray-200 border-t-0 rounded-b">
              Total Earned: {fmtMoney(totals.total_earned)}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function FinancialReports() {
  const { can } = usePermissions()
  const [tab, setTab] = useState<TabId>('sales')

  if (!can('canFinanceReports') && !can('canAdmin')) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
        <span className="text-4xl">🔒</span>
        <p className="text-gray-700 font-medium">Access Restricted</p>
        <p className="text-sm text-gray-400">Financial Reports are only available to management.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Financial Reports" />

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200 px-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === t.id ? 'border-cm-green text-cm-green' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === 'sales'       && <SalesOrdersTab />}
        {tab === 'outstanding' && <OutstandingTab />}
        {tab === 'payments'    && <PaymentsTab />}
        {tab === 'bills'       && <BillsTab />}
        {tab === 'commission'  && <CommissionTab />}
      </div>
    </div>
  )
}
