/**
 * CashHandover — Cash / Payments Hand-Over screen.
 *
 * Staff see their own pending receipts and can print the handover sheet.
 * Supervisors (canFinance) can select any staff member, check receipts off as money is counted,
 * and click "Confirm Receipts Received" to mark them as handed over.
 *
 * Route: /finance/handover
 */
import { useState, useEffect, useCallback } from 'react'
import { frappe } from '../../api/frappe'
import { useAuth } from '../../auth/AuthProvider'
import { usePermissions } from '../../auth/PermissionsProvider'
import { PageHeader, ErrorBox, Btn, selectCls } from '../../components/shared/ui'
import { fmtMoney } from '../../utils/fmt'

function fmtDMY(iso: string | null | undefined) {
  if (!iso) return '—'
  const [y, m, d] = String(iso).split('-')
  return `${d}/${m}/${y}`
}
function fmtDateTime(dt: string | null | undefined) {
  if (!dt) return '—'
  const [dp, tp = ''] = String(dt).split(' ')
  return `${fmtDMY(dp)} ${tp.slice(0, 5)}`
}

interface PendingReceipt {
  name: string
  posting_date: string
  customer: string
  mode_of_payment: string
  paid_amount: number
  payment_type: string
  created_time?: string
  allocated_to?: string
  owner?: string
}
interface SummaryRow { method: string; collected: number; refunded: number; net: number; count: number }
interface HandoverReport {
  pending: PendingReceipt[]
  confirmed_today: PendingReceipt[]
  summary: SummaryRow[]
  date_range_label?: string
  staff_name?: string
}
interface StaffEntry { user_id: string; full_name: string; pending_count: number }

// ─── Summary table ─────────────────────────────────────────────────────────

function SummaryTable({ rows }: { rows: SummaryRow[] }) {
  const totals = rows.reduce(
    (s, r) => ({ col: s.col + r.collected, ref: s.ref + r.refunded, cnt: s.cnt + r.count }),
    { col: 0, ref: 0, cnt: 0 },
  )
  const th = 'px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 bg-gray-50'
  const td = 'px-3 py-2 text-sm tabular-nums'
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-gray-200">
          <th className={`${th} text-left`}>Method</th>
          <th className={`${th} text-right`}>Collected</th>
          <th className={`${th} text-right`}>Refunded</th>
          <th className={`${th} text-right`}>Net</th>
          <th className={`${th} text-right`}>Count</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.method} className="border-b border-gray-100 hover:bg-gray-50/50">
            <td className={`${td} font-medium`}>{r.method}</td>
            <td className={`${td} text-right text-green-700`}>{fmtMoney(r.collected)}</td>
            <td className={`${td} text-right text-red-600`}>{r.refunded > 0 ? fmtMoney(r.refunded) : '—'}</td>
            <td className={`${td} text-right font-semibold`}>{fmtMoney(r.net)}</td>
            <td className={`${td} text-right text-gray-500`}>{r.count}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
          <td className={td}>TOTAL</td>
          <td className={`${td} text-right text-green-700`}>{fmtMoney(totals.col)}</td>
          <td className={`${td} text-right text-red-600`}>{totals.ref > 0 ? fmtMoney(totals.ref) : '—'}</td>
          <td className={`${td} text-right`}>{fmtMoney(totals.col - totals.ref)}</td>
          <td className={`${td} text-right text-gray-500`}>{totals.cnt}</td>
        </tr>
      </tfoot>
    </table>
  )
}

// ─── Pending receipts table with checkboxes ────────────────────────────────

function PendingTable({ rows, checked, onToggle, onToggleAll, isSupervisor }: {
  rows: PendingReceipt[]
  checked: Set<string>
  onToggle: (name: string) => void
  onToggleAll: (names: string[]) => void
  isSupervisor: boolean
}) {
  const allChecked  = rows.length > 0 && rows.every(r => checked.has(r.name))
  const someChecked = !allChecked && rows.some(r => checked.has(r.name))
  const th = 'px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 bg-gray-50 text-left'
  const td = 'px-3 py-2 text-sm'
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b border-gray-200">
          {isSupervisor && (
            <th className={`${th} w-8`}>
              <input type="checkbox" checked={allChecked}
                ref={(el) => { if (el) el.indeterminate = someChecked }}
                onChange={() => onToggleAll(allChecked ? [] : rows.map(r => r.name))}
                className="h-4 w-4 rounded border-gray-300 text-cm-green cursor-pointer" />
            </th>
          )}
          <th className={`${th} w-8`}>#</th>
          <th className={th}>Date</th>
          <th className={th}>Receipt No</th>
          <th className={`${th} w-16`}>Time</th>
          <th className={th}>Customer</th>
          <th className={th}>Method</th>
          <th className={`${th} text-right`}>Amount</th>
          <th className={th}>Allocated To</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const isRefund  = r.payment_type === 'Pay'
          const isChecked = checked.has(r.name)
          return (
            <tr key={r.name}
              className={`border-b border-gray-100 transition-colors ${
                isChecked ? 'bg-green-50' : isRefund ? 'bg-red-50' : 'hover:bg-gray-50/50'
              }`}
            >
              {isSupervisor && (
                <td className={td}>
                  <input type="checkbox" checked={isChecked} onChange={() => onToggle(r.name)}
                    className="h-4 w-4 rounded border-gray-300 text-cm-green cursor-pointer" />
                </td>
              )}
              <td className={`${td} text-gray-400 tabular-nums`}>{i + 1}</td>
              <td className={`${td} tabular-nums text-gray-600`}>{fmtDMY(r.posting_date)}</td>
              <td className={`${td} font-mono text-xs`}>{r.name}</td>
              <td className={`${td} tabular-nums text-gray-500`}>{r.created_time ?? '—'}</td>
              <td className={`${td} font-medium`}>{r.customer}</td>
              <td className={td}>
                <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">{r.mode_of_payment}</span>
              </td>
              <td className={`${td} text-right tabular-nums font-medium ${isRefund ? 'text-red-600' : ''}`}>
                {isRefund ? '−' : ''}{fmtMoney(r.paid_amount)}
              </td>
              <td className={`${td} text-xs text-gray-500`}>{r.allocated_to ?? '—'}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ─── Confirmed-today collapsible ───────────────────────────────────────────

function ConfirmedToday({ rows }: { rows: PendingReceipt[] }) {
  const [open, setOpen] = useState(false)
  if (!rows.length) return null
  const th = 'px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 bg-gray-50 text-left'
  const td = 'px-3 py-2 text-sm'
  return (
    <div className="border border-green-200 rounded-lg overflow-hidden">
      <button className="w-full flex items-center justify-between px-4 py-2.5 bg-green-50 text-sm text-green-800 font-medium"
        onClick={() => setOpen(v => !v)}>
        <span>✓ Confirmed today — {rows.length} receipt{rows.length !== 1 ? 's' : ''}</span>
        <span className="text-xs text-green-600">{open ? '▲ hide' : '▼ show'}</span>
      </button>
      {open && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-green-200">
                <th className={`${th} w-8`}>#</th>
                <th className={th}>Date</th>
                <th className={th}>Receipt No</th>
                <th className={th}>Customer</th>
                <th className={th}>Method</th>
                <th className={`${th} text-right`}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.name} className="border-b border-green-100 bg-white">
                  <td className={`${td} text-gray-400 tabular-nums`}>{i + 1}</td>
                  <td className={`${td} tabular-nums text-gray-500`}>{fmtDMY(r.posting_date)}</td>
                  <td className={`${td} font-mono text-xs`}>{r.name}</td>
                  <td className={`${td} font-medium`}>{r.customer}</td>
                  <td className={td}>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">{r.mode_of_payment}</span>
                  </td>
                  <td className={`${td} text-right tabular-nums font-medium`}>{fmtMoney(r.paid_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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

// ─── Main component ────────────────────────────────────────────────────────

export function CashHandover() {
  const { user }     = useAuth()
  const { can }      = usePermissions()
  const isSupervisor = can('canFinance') || can('canAdmin')

  const [staffUser,   setStaffUser]   = useState('')
  const [staffList,   setStaffList]   = useState<StaffEntry[]>([])
  const [report,      setReport]      = useState<HandoverReport | null>(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [loadedAt,    setLoadedAt]    = useState<string | null>(null)
  const [checked,     setChecked]     = useState<Set<string>>(new Set())
  const [confirming,  setConfirming]  = useState(false)
  const [lastConfirm, setLastConfirm] = useState<{ confirmed: number; confirmed_by: string; confirmed_at: string } | null>(null)

  // Seed from auth
  useEffect(() => {
    if (user?.name && !staffUser) setStaffUser(user.name)
  }, [user, staffUser])

  const load = useCallback(async (su: string) => {
    if (!su) return
    setLoading(true)
    setError(null)
    setChecked(new Set())
    try {
      const data = await frappe.callGet<HandoverReport>(
        'casamoderna_dms.handover_api.get_handover_report',
        { staff_user: su },
      )
      setReport(data)
      setLoadedAt(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Failed to load report')
      setReport(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadStaffList = useCallback(async () => {
    if (!isSupervisor) return
    try {
      const data = await frappe.callGet<StaffEntry[]>('casamoderna_dms.handover_api.get_staff_with_pending')
      setStaffList(Array.isArray(data) ? data : [])
    } catch { setStaffList([]) }
  }, [isSupervisor])

  useEffect(() => {
    if (staffUser) { load(staffUser); loadStaffList() }
  }, [staffUser]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle    = (name: string) => setChecked(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n })
  const toggleAll = (names: string[]) => setChecked(new Set(names))

  const confirmChecked = useCallback(async () => {
    if (!checked.size) return
    setConfirming(true)
    try {
      const result = await frappe.call<{ confirmed: number; confirmed_by: string; confirmed_at: string }>(
        'casamoderna_dms.handover_api.confirm_receipts',
        { payment_entries: JSON.stringify([...checked]) },
      )
      setLastConfirm(result)
      await load(staffUser)
      await loadStaffList()
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Failed to confirm receipts')
    } finally {
      setConfirming(false)
    }
  }, [checked, staffUser, load, loadStaffList])

  const pending        = report?.pending ?? []
  const confToday      = report?.confirmed_today ?? []
  const summary        = report?.summary ?? []
  const grandNet       = summary.reduce((s, r) => s + (r.net ?? 0), 0)
  const hasPending     = pending.length > 0
  const dateRangeLabel = report?.date_range_label ?? null
  const staffName      = report?.staff_name ?? staffUser

  const exportCsv = () => {
    const lines = [
      ['Date', 'Receipt No', 'Time', 'Customer', 'Method', 'Amount', 'Allocated To'].join(','),
      ...pending.map(r => [
        r.posting_date,
        `"${r.name}"`,
        r.created_time ?? '',
        `"${(r.customer ?? '').replace(/"/g, '""')}"`,
        `"${(r.mode_of_payment ?? '').replace(/"/g, '""')}"`,
        ((r.payment_type === 'Pay' ? -1 : 1) * Number(r.paid_amount ?? 0)).toFixed(2),
        `"${(r.allocated_to ?? '').replace(/"/g, '""')}"`,
      ].join(',')),
    ]
    downloadCsv(lines, `handover_${staffUser}_${new Date().toISOString().slice(0, 10)}.csv`)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cash / Payments Hand-Over"
        subtitle="Pending receipts must be physically handed over. Supervisor ticks each one as money is counted."
        actions={
          <div className="flex items-center gap-2">
            <Btn variant="ghost" onClick={() => load(staffUser)} disabled={loading}>
              {loading ? 'Loading…' : 'Refresh'}
            </Btn>
            <Btn variant="ghost" onClick={exportCsv} disabled={!hasPending}>Export CSV</Btn>
          </div>
        }
      />

      {/* Staff selector */}
      <div className="flex items-end gap-4 flex-wrap bg-white border border-gray-200 rounded-lg px-4 py-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Staff Member</label>
          {isSupervisor ? (
            <select className={`${selectCls} w-72`} value={staffUser}
              onChange={e => { setStaffUser(e.target.value); load(e.target.value) }}>
              {!staffList.find(s => s.user_id === staffUser) && staffUser && (
                <option value={staffUser}>{staffUser} (no pending)</option>
              )}
              {staffList.map(s => (
                <option key={s.user_id} value={s.user_id}>
                  {s.full_name !== s.user_id ? `${s.full_name} — ${s.pending_count} pending` : `${s.user_id} — ${s.pending_count} pending`}
                </option>
              ))}
            </select>
          ) : (
            <div className="px-2 py-1.5 rounded border border-gray-200 bg-gray-50 text-gray-600 text-sm w-72">{staffUser || '—'}</div>
          )}
        </div>
        <div className="ml-auto self-end pb-1 text-xs text-gray-400">{loadedAt ? `Loaded: ${loadedAt}` : '—'}</div>
      </div>

      {error && <ErrorBox message={error} />}

      {lastConfirm && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 flex items-center gap-2">
          <span>✓</span>
          <span>
            {lastConfirm.confirmed} receipt{lastConfirm.confirmed !== 1 ? 's' : ''} confirmed
            by <strong>{lastConfirm.confirmed_by}</strong> at {fmtDateTime(lastConfirm.confirmed_at)}
          </span>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 rounded-full border-4 border-cm-green border-t-transparent animate-spin" />
        </div>
      )}

      {!loading && report && (
        <>
          {!hasPending && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-5 py-4 text-sm text-green-800 space-y-1">
              <p className="font-semibold">All receipts confirmed — nothing pending for {staffName}</p>
              <p className="text-xs text-green-700">Every receipt entered in the system has been signed off.</p>
            </div>
          )}

          {hasPending && (
            <div className="rounded-lg border-2 border-cm-green bg-cm-green/5 px-5 py-3 flex items-center justify-between">
              <div className="text-sm text-gray-700">
                <span className="font-semibold">{pending.length}</span> pending receipt{pending.length !== 1 ? 's' : ''}
                {dateRangeLabel && <span className="ml-2 text-gray-400 text-xs">{dateRangeLabel}</span>}
              </div>
              <div className="text-xl font-bold tabular-nums text-cm-green">{fmtMoney(grandNet)}</div>
            </div>
          )}

          {hasPending && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              <div className="lg:col-span-3 border border-gray-200 rounded-lg overflow-hidden bg-white">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                  <h3 className="text-sm font-semibold text-gray-700">Totals by payment method</h3>
                </div>
                <SummaryTable rows={summary} />
              </div>
              <div className="lg:col-span-2 border border-gray-200 rounded-lg p-5 space-y-5 bg-white">
                <h3 className="text-sm font-semibold text-gray-700 border-b border-gray-200 pb-2">Sign-off</h3>
                {['Handed over by', 'Received by', 'Date / Time'].map(label => (
                  <div key={label} className="space-y-1">
                    <div className="text-xs text-gray-500">{label}:</div>
                    <div className="border-b border-gray-400 h-6 w-full" />
                  </div>
                ))}
                <p className="text-[10px] text-gray-400 leading-snug">
                  This report lists all pending receipts. The net total equals the physical money to be handed over.
                </p>
              </div>
            </div>
          )}

          {hasPending && (
            <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">
                  Pending receipts
                  {isSupervisor && checked.size > 0 && (
                    <span className="ml-2 text-cm-green">{checked.size} selected</span>
                  )}
                </h3>
                <span className="text-xs text-gray-400">{pending.length} rows</span>
              </div>
              <div className="overflow-x-auto">
                <PendingTable rows={pending} checked={checked} onToggle={toggle} onToggleAll={toggleAll} isSupervisor={isSupervisor} />
              </div>
            </div>
          )}

          {isSupervisor && checked.size > 0 && (
            <div className="flex items-center justify-end gap-3">
              <span className="text-sm text-gray-500">
                {checked.size} receipt{checked.size !== 1 ? 's' : ''} selected
                {' · '}
                {fmtMoney(
                  pending
                    .filter(r => checked.has(r.name))
                    .reduce((s, r) => s + (r.payment_type === 'Pay' ? -1 : 1) * Number(r.paid_amount ?? 0), 0)
                )}
              </span>
              <Btn onClick={confirmChecked} disabled={confirming}>
                {confirming ? 'Confirming…' : `✓ Confirm ${checked.size} Receipt${checked.size !== 1 ? 's' : ''} Received`}
              </Btn>
            </div>
          )}

          <ConfirmedToday rows={confToday} />
        </>
      )}
    </div>
  )
}
