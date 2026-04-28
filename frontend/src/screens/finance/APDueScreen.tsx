/**
 * APDueScreen — Accounts Payable due-date dashboard.
 *
 * Shows all unpaid supplier bills grouped by urgency:
 *   OVERDUE   — past due date
 *   DUE TODAY — due on today's date
 *   DUE THIS WEEK — due within 7 days
 *   DUE LATER — due after 7 days
 *
 * Route: /finance/ap-due
 */
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import { usePermissions } from '../../auth/PermissionsProvider'
import { PageHeader, ErrorBox, Btn, inputCls, selectCls } from '../../components/shared/ui'
import { fmtMoney, fmtDate } from '../../utils/fmt'

const todayStr = () => new Date().toISOString().slice(0, 10)

// ─── Urgency helpers ──────────────────────────────────────────────────────────

function urgencyGroup(daysOverdue: number) {
  if (daysOverdue > 0)   return 'overdue'
  if (daysOverdue === 0) return 'today'
  if (daysOverdue >= -7) return 'week'
  return 'later'
}

function urgencyLabel(daysOverdue: number) {
  if (daysOverdue > 0)   return `${daysOverdue}d OVERDUE`
  if (daysOverdue === 0) return 'Due Today'
  return `Due in ${Math.abs(daysOverdue)}d`
}

function urgencyClass(group: string) {
  return ({
    overdue: 'bg-red-100 text-red-800',
    today:   'bg-amber-100 text-amber-800',
    week:    'bg-yellow-50 text-yellow-800',
    later:   'bg-gray-50 text-gray-600',
  } as Record<string, string>)[group] ?? 'bg-gray-50 text-gray-600'
}

function rowBorder(group: string) {
  return ({
    overdue: 'border-l-4 border-l-red-400',
    today:   'border-l-4 border-l-amber-400',
    week:    'border-l-4 border-l-yellow-300',
    later:   '',
  } as Record<string, string>)[group] ?? ''
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, count, amount, accent }: {
  label: string; count: number; amount: number; accent: 'red'|'amber'|'yellow'|'gray'
}) {
  const accentMap: Record<string, string> = {
    red:    'border-red-300 bg-red-50',
    amber:  'border-amber-300 bg-amber-50',
    yellow: 'border-yellow-200 bg-yellow-50',
    gray:   'border-gray-200 bg-white',
  }
  return (
    <div className={`rounded-lg border px-4 py-3 space-y-0.5 ${accentMap[accent]}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className="text-lg font-bold tabular-nums text-gray-900">{count} bill{count !== 1 ? 's' : ''}</div>
      <div className="text-sm tabular-nums font-semibold text-gray-700">{fmtMoney(amount)}</div>
    </div>
  )
}

// ─── Inline Pay Panel ─────────────────────────────────────────────────────────

interface Bill {
  bill_name: string
  supplier_name: string
  bill_no?: string
  posting_date: string
  due_date?: string
  days_overdue: number
  amount_due: number
}

function PayPanel({ bill, modes, onPaid, onCancel }: {
  bill: Bill
  modes: string[]
  onPaid: (billName: string, result: Record<string, unknown>) => void
  onCancel: () => void
}) {
  const [amount, setAmount]               = useState(Number(bill.amount_due).toFixed(2))
  const [mop, setMop]                     = useState(modes[0] ?? '')
  const [referenceNo, setReferenceNo]     = useState('')
  const [referenceDate, setReferenceDate] = useState('')
  const [postingDate, setPostingDate]     = useState(todayStr())
  const [remarks, setRemarks]             = useState('')
  const [posting, setPosting]             = useState(false)
  const [error, setError]                 = useState<string | null>(null)

  const handlePost = async () => {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError('Enter a valid amount.'); return }
    if (!mop)             { setError('Select a mode of payment.'); return }
    setPosting(true)
    setError(null)
    try {
      const result = await frappe.call<Record<string, unknown>>(
        'casamoderna_dms.ap_payment_api.make_ap_payment',
        { bill_name: bill.bill_name, amount: amt, mode_of_payment: mop,
          posting_date: postingDate, reference_no: referenceNo,
          reference_date: referenceDate, remarks },
      )
      onPaid(bill.bill_name, result)
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Payment failed')
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-blue-900">
          Pay: {bill.bill_name}
          <span className="ml-2 text-blue-600 font-normal">Outstanding {fmtMoney(bill.amount_due)}</span>
        </p>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-sm">✕ Cancel</button>
      </div>
      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500">Amount (€)</label>
          <input type="number" min="0.01" step="0.01" className={inputCls}
            value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500">Mode of Payment</label>
          <select className={selectCls} value={mop} onChange={e => setMop(e.target.value)}>
            {modes.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500">Posting Date</label>
          <input type="date" className={inputCls} value={postingDate} onChange={e => setPostingDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500">Reference No</label>
          <input className={inputCls} value={referenceNo} onChange={e => setReferenceNo(e.target.value)} placeholder="Cheque / card ref" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500">Reference Date</label>
          <input type="date" className={inputCls} value={referenceDate} onChange={e => setReferenceDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-500">Remarks</label>
          <input className={inputCls} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Optional note" />
        </div>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Btn onClick={handlePost} disabled={posting}>{posting ? 'Posting…' : 'Post Payment'}</Btn>
        <Btn variant="ghost" onClick={onCancel} disabled={posting}>Cancel</Btn>
      </div>
    </div>
  )
}

// ─── Bill Row ─────────────────────────────────────────────────────────────────

function BillRow({ bill, modes, canPay, onPaid }: {
  bill: Bill
  modes: string[]
  canPay: boolean
  onPaid: (billName: string, result: Record<string, unknown>) => void
}) {
  const navigate = useNavigate()
  const [showPay, setShowPay] = useState(false)
  const group = urgencyGroup(bill.days_overdue)

  const handlePaid = (billName: string, result: Record<string, unknown>) => {
    setShowPay(false)
    onPaid(billName, result)
  }

  return (
    <div className={`rounded border border-gray-200 bg-white mb-2 ${rowBorder(group)}`}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase ${urgencyClass(group)}`}>
          {urgencyLabel(bill.days_overdue)}
        </span>
        <span className="text-xs text-gray-500 w-24 shrink-0">
          {bill.due_date ? fmtDate(bill.due_date) : '—'}
        </span>
        <span className="font-medium text-sm flex-1 min-w-[120px]">{bill.supplier_name}</span>
        <button className="font-mono text-xs text-cm-green underline underline-offset-2 hover:text-green-700"
          onClick={() => navigate(`/finance/bills/${encodeURIComponent(bill.bill_name)}`)}>
          {bill.bill_name}
        </button>
        {bill.bill_no && <span className="text-xs text-gray-500">{bill.bill_no}</span>}
        <span className="text-xs text-gray-400 w-24 shrink-0 text-right">Inv: {fmtDate(bill.posting_date)}</span>
        <span className="tabular-nums font-bold text-sm text-gray-900 w-28 text-right">{fmtMoney(bill.amount_due)}</span>
        {canPay && !showPay && <Btn onClick={() => setShowPay(true)}>Pay</Btn>}
        {canPay && showPay && <Btn variant="ghost" onClick={() => setShowPay(false)}>Cancel</Btn>}
      </div>
      {showPay && (
        <div className="px-4 pb-4">
          <PayPanel bill={bill} modes={modes} onPaid={handlePaid} onCancel={() => setShowPay(false)} />
        </div>
      )}
    </div>
  )
}

// ─── Group Section ────────────────────────────────────────────────────────────

function GroupSection({ heading, accentClass, bills, modes, canPay, onPaid }: {
  heading: string; accentClass: string; bills: Bill[]; modes: string[]; canPay: boolean
  onPaid: (billName: string, result: Record<string, unknown>) => void
}) {
  if (!bills.length) return null
  const total = bills.reduce((s, r) => s + Number(r.amount_due ?? 0), 0)
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 mb-2">
        <span className={`inline-block w-2 h-2 rounded-full ${accentClass}`} />
        <span className="text-sm font-semibold text-gray-700">{heading}</span>
        <span className="text-gray-400 font-normal text-sm">— {bills.length} bill{bills.length !== 1 ? 's' : ''} · {fmtMoney(total)}</span>
      </div>
      {bills.map(b => (
        <BillRow key={b.bill_name} bill={b} modes={modes} canPay={canPay} onPaid={onPaid} />
      ))}
    </div>
  )
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function APDueScreen() {
  const { can }  = usePermissions()
  const navigate = useNavigate()

  const [rows, setRows]       = useState<Bill[] | null>(null)
  const [modes, setModes]     = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const canPay = can('canFinance') || can('canFinanceAccounting')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [bills, modeList] = await Promise.all([
        frappe.call<Bill[]>('casamoderna_dms.ap_payment_api.get_ap_due_list'),
        frappe.call<Array<string | { name: string }>>('casamoderna_dms.ap_payment_api.get_payment_modes'),
      ])
      setRows(Array.isArray(bills) ? bills : [])
      setModes(
        Array.isArray(modeList)
          ? modeList.map(m => (typeof m === 'string' ? m : m.name))
          : [],
      )
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handlePaid = useCallback((billName: string, result: Record<string, unknown>) => {
    const entry  = result.payment_entry as string | undefined
    const mop    = result.mode_of_payment as string | undefined
    const amount = result.amount as number | undefined
    setSuccess(`Payment ${entry ?? ''} posted — ${mop ?? ''} €${Number(amount ?? 0).toFixed(2)}`)
    setRows(prev => prev ? prev.filter(r => r.bill_name !== billName) : prev)
    setTimeout(() => setSuccess(null), 8000)
  }, [])

  const overdue  = (rows ?? []).filter(r => r.days_overdue > 0)
  const dueToday = (rows ?? []).filter(r => r.days_overdue === 0)
  const dueWeek  = (rows ?? []).filter(r => r.days_overdue < 0 && r.days_overdue >= -7)
  const dueLater = (rows ?? []).filter(r => r.days_overdue < -7)
  const sum = (arr: Bill[]) => arr.reduce((s, r) => s + Number(r.amount_due ?? 0), 0)

  return (
    <div className="space-y-4">
      <PageHeader
        title="AP Due"
        subtitle="Supplier bills to pay"
        actions={
          <div className="flex items-center gap-2">
            <Btn variant="ghost" onClick={load} disabled={loading}>
              {loading ? 'Loading…' : '↻ Refresh'}
            </Btn>
            <Btn onClick={() => navigate('/finance/bills/new')}>+ New Bill</Btn>
          </div>
        }
      />

      {error && <ErrorBox message={error} />}

      {success && (
        <div className="rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 font-medium">
          ✓ {success}
        </div>
      )}

      {/* KPI row */}
      {rows !== null && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="Overdue"        count={overdue.length}  amount={sum(overdue)}   accent="red" />
          <KpiCard label="Due Today"      count={dueToday.length} amount={sum(dueToday)}  accent="amber" />
          <KpiCard label="Due This Week"  count={dueWeek.length}  amount={sum(dueWeek)}   accent="yellow" />
          <KpiCard label="Due Later"      count={dueLater.length} amount={sum(dueLater)}  accent="gray" />
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 rounded-full border-4 border-cm-green border-t-transparent animate-spin" />
        </div>
      )}

      {!loading && rows !== null && rows.length === 0 && (
        <div className="rounded border border-gray-200 bg-white p-10 text-center">
          <p className="text-sm text-gray-400">No unpaid bills. All clear.</p>
        </div>
      )}

      {!loading && rows !== null && rows.length > 0 && (
        <div className="space-y-6">
          <GroupSection heading="Overdue"       accentClass="bg-red-500"    bills={overdue}  modes={modes} canPay={canPay} onPaid={handlePaid} />
          <GroupSection heading="Due Today"     accentClass="bg-amber-400"  bills={dueToday} modes={modes} canPay={canPay} onPaid={handlePaid} />
          <GroupSection heading="Due This Week" accentClass="bg-yellow-300" bills={dueWeek}  modes={modes} canPay={canPay} onPaid={handlePaid} />
          <GroupSection heading="Due Later"     accentClass="bg-gray-300"   bills={dueLater} modes={modes} canPay={canPay} onPaid={handlePaid} />
        </div>
      )}
    </div>
  )
}
