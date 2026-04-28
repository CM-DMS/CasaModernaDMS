/**
 * DailyCollections — All payments confirmed (handed to owner) on a selected date.
 * Finance manager only (canFinance).
 *
 * Route: /finance/collections
 */
import { useState, useEffect, useCallback } from 'react'
import { frappe } from '../../api/frappe'
import { usePermissions } from '../../auth/PermissionsProvider'
import { PageHeader, DataTable, ErrorBox, Btn, inputCls, type Column } from '../../components/shared/ui'
import { fmtMoney, fmtDate } from '../../utils/fmt'

const today = () => new Date().toISOString().slice(0, 10)

function fmtDMY(iso: string) {
  if (!iso) return '—'
  const [y, m, d] = String(iso).split('-')
  return `${d}/${m}/${y}`
}

interface CollectionRow {
  posting_date: string
  customer: string
  paid_amount: number
  payment_type: string
  mode_of_payment: string
  reference_no: string
  confirmed_time: string
  staff_name: string
  owner: string
}

interface SummaryItem {
  method: string
  net: number
  count_in: number
  count_out: number
}

interface PendingWarning {
  staff_user: string
  full_name: string
  oldest_date: string
  latest_date: string
  total_collected: number
  payment_count: number
}

interface DailyReceipt {
  received_by: string
  received_name: string
  received_time: string
  total_amount: number
}

const DETAIL_COLUMNS: Column<CollectionRow>[] = [
  { key: 'posting_date',    label: 'Date', render: v => fmtDate(v as string) },
  { key: 'customer',        label: 'Customer', render: v => <span className="font-medium">{v as string}</span> },
  {
    key: 'paid_amount',
    label: 'Amount',
    align: 'right',
    render: (v, row) => {
      const isRefund = row.payment_type === 'Pay'
      return (
        <span className={`tabular-nums font-medium${isRefund ? ' text-red-600' : ''}`}>
          {isRefund ? '−' : ''}{fmtMoney(v as number)}
        </span>
      )
    },
  },
  { key: 'mode_of_payment', label: 'Mode' },
  { key: 'reference_no',    label: 'Reference No' },
  { key: 'confirmed_time',  label: 'Confirmed' },
  { key: 'staff_name',      label: 'Staff', render: v => <span className="text-gray-500 text-[12px]">{v as string}</span> },
]

function groupBy<T>(rows: T[], keyFn: (r: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const k = keyFn(row)
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(row)
  }
  return map
}

function sumField(rows: CollectionRow[]) {
  return rows.reduce((s, r) => s + (r.payment_type === 'Pay' ? -1 : 1) * Number(r.paid_amount ?? 0), 0)
}

function HandoverWarnings({ warnings }: { warnings: PendingWarning[] }) {
  if (!warnings.length) return null
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 space-y-2">
      <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
        <span>⚠</span>
        {warnings.length} staff member{warnings.length !== 1 ? 's' : ''} with pending receipts not yet confirmed
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {warnings.map(w => (
          <div key={w.staff_user} className="flex items-start justify-between bg-white border border-amber-200 rounded px-3 py-2 text-xs">
            <div className="space-y-0.5">
              <div className="font-semibold text-gray-800">{w.full_name || w.staff_user}</div>
              <div className="text-gray-500">
                {fmtDMY(w.oldest_date)}
                {w.oldest_date !== w.latest_date ? ` – ${fmtDMY(w.latest_date)}` : ''}
              </div>
            </div>
            <div className="text-right">
              <div className="font-semibold tabular-nums text-gray-800">{fmtMoney(w.total_collected)}</div>
              <div className="text-gray-400">{w.payment_count} receipt{w.payment_count !== 1 ? 's' : ''}</div>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-amber-700">Open Cash Handover, select the staff member, and tick off each receipt as money is counted.</p>
    </div>
  )
}

function HandoverBadge({ pending }: { pending: boolean }) {
  if (!pending) {
    return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">✓ All confirmed</span>
  }
  return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">⚠ pending</span>
}

function downloadCsv(lines: string[], filename: string) {
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export function DailyCollections() {
  const { can } = usePermissions()
  const isSupervisor = can('canFinance') || can('canAdmin')

  const [date, setDate]               = useState(today())
  const [rows, setRows]               = useState<CollectionRow[]>([])
  const [summary, setSummary]         = useState<SummaryItem[]>([])
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [groupByUser, setGroupByUser] = useState(false)
  const [warnings, setWarnings]       = useState<PendingWarning[]>([])
  const [receipt, setReceipt]         = useState<DailyReceipt | null | undefined>(undefined)
  const [confirming, setConfirming]   = useState(false)

  const load = useCallback(async (d: string) => {
    if (!isSupervisor) return
    setLoading(true)
    setError(null)
    try {
      const data = await frappe.callGet<{ rows: CollectionRow[]; summary: SummaryItem[] }>(
        'casamoderna_dms.handover_api.get_daily_collections',
        { date: d },
      )
      setRows(Array.isArray(data.rows) ? data.rows : [])
      setSummary(Array.isArray(data.summary) ? data.summary : [])
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Failed to load collections')
      setRows([]); setSummary([])
    } finally {
      setLoading(false)
    }
  }, [isSupervisor])

  const loadReceipt = useCallback(async (d: string) => {
    if (!isSupervisor) return
    setReceipt(undefined)
    try {
      const data = await frappe.callGet<DailyReceipt | null>(
        'casamoderna_dms.handover_api.get_daily_collection_receipt',
        { date: d },
      )
      setReceipt(data ?? null)
    } catch {
      setReceipt(null)
    }
  }, [isSupervisor])

  const loadWarnings = useCallback(async () => {
    if (!isSupervisor) return
    try {
      const data = await frappe.callGet<PendingWarning[]>(
        'casamoderna_dms.handover_api.get_pending_handovers',
      )
      setWarnings(Array.isArray(data) ? data : [])
    } catch { /* non-critical */ }
  }, [isSupervisor])

  const handleConfirmReceipt = async () => {
    if (!window.confirm(`Confirm that you have physically received the cash for ${fmtDMY(date)}?`)) return
    setConfirming(true)
    try {
      const data = await frappe.call<DailyReceipt>('casamoderna_dms.handover_api.confirm_daily_receipt', { date })
      setReceipt(data ?? null)
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Failed to confirm receipt')
    } finally {
      setConfirming(false)
    }
  }

  useEffect(() => { load(date); loadReceipt(date) }, [date, load, loadReceipt])
  useEffect(() => { loadWarnings() }, [loadWarnings])

  const groupKey = groupByUser ? 'staff_name' : 'mode_of_payment'
  const grouped  = groupBy(rows, r => (r as Record<string, string>)[groupKey] ?? '—')
  const grandTotal = rows.reduce(
    (s, r) => s + (r.payment_type === 'Pay' ? -1 : 1) * Number(r.paid_amount ?? 0), 0
  )

  const warningByUser = Object.fromEntries(warnings.map(w => [w.staff_user, w]))

  const exportCsv = () => {
    const lines = [
      ['Receipt Date', 'Customer', 'Amount', 'Type', 'Mode', 'Reference No', 'Confirmed', 'Staff'].join(','),
      ...rows.map(r => {
        const isRefund = r.payment_type === 'Pay'
        return [
          r.posting_date,
          `"${(r.customer ?? '').replace(/"/g, '""')}"`,
          ((isRefund ? -1 : 1) * Number(r.paid_amount ?? 0)).toFixed(2),
          isRefund ? 'Refund' : 'Receipt',
          `"${(r.mode_of_payment ?? '').replace(/"/g, '""')}"`,
          `"${(r.reference_no ?? '').replace(/"/g, '""')}"`,
          r.confirmed_time ?? '',
          `"${(r.staff_name ?? r.owner ?? '').replace(/"/g, '""')}"`,
        ].join(',')
      }),
    ]
    downloadCsv(lines, `collections_${date}.csv`)
  }

  if (!isSupervisor) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
        <span className="text-4xl">🔒</span>
        <p className="text-gray-700 font-medium">Access Restricted</p>
        <p className="text-sm text-gray-400">Daily Collections is only available to Finance managers.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Daily Collections"
        subtitle="All payments physically confirmed (handed to owner) on the selected date"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Date</label>
              <input type="date" className={inputCls} value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Btn onClick={() => { load(date); loadWarnings(); loadReceipt(date) }} disabled={loading}>
                {loading ? 'Loading…' : 'Refresh'}
              </Btn>
            </div>
          </div>
        }
      />

      <HandoverWarnings warnings={warnings} />

      {/* Owner receipt confirmation banner */}
      {rows.length > 0 && receipt !== undefined && (
        receipt
          ? (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-green-800">
                <span className="text-lg">✓</span>
                <div>
                  <span className="font-semibold text-sm">Cash received confirmed</span>
                  <span className="text-sm text-green-600 ml-2">
                    by {receipt.received_name || receipt.received_by} at {receipt.received_time}
                  </span>
                </div>
              </div>
              <span className="text-sm font-semibold tabular-nums text-green-800">{fmtMoney(receipt.total_amount)}</span>
            </div>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-amber-800">Awaiting cash receipt confirmation</p>
                <p className="text-xs text-amber-600 mt-0.5">The owner has not yet confirmed receipt of this day's cash.</p>
              </div>
              <Btn onClick={handleConfirmReceipt} disabled={confirming}>
                {confirming ? 'Confirming…' : 'Confirm Receipt'}
              </Btn>
            </div>
          )
      )}

      {error && <ErrorBox message={error} />}

      {/* Summary cards */}
      {rows.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Summary</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {summary.map(s => (
              <div key={s.method} className="rounded-lg border border-gray-200 bg-white px-4 py-3 space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{s.method}</div>
                <div className="text-lg font-bold tabular-nums text-gray-900">{fmtMoney(s.net)}</div>
                <div className="text-[11px] text-gray-400">
                  {s.count_in > 0 && <span>{s.count_in} receipt{s.count_in !== 1 ? 's' : ''}</span>}
                  {s.count_out > 0 && <span className="ml-1 text-red-500">{s.count_out} refund{s.count_out !== 1 ? 's' : ''}</span>}
                </div>
              </div>
            ))}
            <div className="rounded-lg border-2 border-cm-green bg-cm-green/5 px-4 py-3 space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-cm-green">Total</div>
              <div className="text-lg font-bold tabular-nums text-cm-green">{fmtMoney(grandTotal)}</div>
              <div className="text-[11px] text-gray-400">{rows.length} transaction{rows.length !== 1 ? 's' : ''}</div>
            </div>
          </div>
        </div>
      )}

      {/* Detail with group toggle */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Detail</h3>
          <div className="flex items-center gap-2">
            {(['By Mode', 'By Staff'] as const).map((label, i) => (
              <button key={label}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  (i === 0 ? !groupByUser : groupByUser)
                    ? 'bg-cm-green text-white border-cm-green'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
                onClick={() => setGroupByUser(i === 1)}
              >
                {label}
              </button>
            ))}
            {rows.length > 0 && (
              <button className="text-xs px-2.5 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50" onClick={exportCsv}>
                Export CSV
              </button>
            )}
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 rounded-full border-4 border-cm-green border-t-transparent animate-spin" />
          </div>
        )}

        {!loading && rows.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">
            No confirmed payments for {fmtDMY(date)}. Use Cash Handover to confirm pending receipts.
          </p>
        )}

        {!loading && rows.length > 0 && (
          <div className="space-y-6">
            {[...grouped.entries()].map(([label, groupRows]) => {
              const ownerEmail = groupByUser ? (groupRows[0]?.owner ?? label) : null
              const hasPending = groupByUser && ownerEmail ? !!warningByUser[ownerEmail] : false
              const groupNet   = sumField(groupRows)
              return (
                <div key={label}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</span>
                      {groupByUser && <HandoverBadge pending={hasPending} />}
                    </div>
                    <span className="text-xs font-semibold tabular-nums text-gray-700">
                      {fmtMoney(groupNet)} ({groupRows.length})
                    </span>
                  </div>
                  <DataTable columns={DETAIL_COLUMNS} rows={groupRows} />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
