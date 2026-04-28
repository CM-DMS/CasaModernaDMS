/**
 * VoucherApprovals — dedicated screen for Voucher Authorizers.
 *
 * Shows company-issued vouchers (Casa Moderna / Danzah) in "Pending Authorization".
 *
 * Route: /customers/vouchers/approvals
 */
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import {
  PageHeader, DetailSection, Btn,
} from '../../components/shared/ui'
import { CM } from '../../components/ui/CMClassNames'
import { fmtMoney, fmtDate } from '../../utils/fmt'
import { usePermissions } from '../../auth/PermissionsProvider'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PendingVoucher {
  name: string
  voucher_code: string
  voucher_source: string
  purchaser_customer: string
  purchaser_name?: string
  recipient_customer: string
  recipient_name?: string
  voucher_value: number
  valid_until: string
  status: string
  authorized_by_jason?: number
  notes?: string
  owner?: string
  creation?: string
  modified?: string
  modified_by?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SOURCE_STYLES: Record<string, string> = {
  'Casa Moderna': 'bg-green-50 text-green-700 border-green-200',
  'Danzah':       'bg-purple-50 text-purple-700 border-purple-200',
}

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000)
}

function fmtDatetime(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })
}

// ── History Panel ─────────────────────────────────────────────────────────────

interface HistoryEntry {
  owner: string
  creation: string
  changed?: Array<{ field: string; from: unknown; to: unknown }>
}

function humanVal(v: unknown) {
  if (v == null || v === '') return '—'
  if (v === 0 || v === '0') return 'No'
  if (v === 1 || v === '1') return 'Yes'
  return String(v)
}

function HistoryPanel({ voucherName }: { voucherName: string }) {
  const [history, setHistory] = useState<HistoryEntry[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    frappe.call<HistoryEntry[]>('casamoderna_dms.voucher_api.get_voucher_history', { voucher_name: voucherName })
      .then((h) => setHistory(Array.isArray(h) ? h : []))
      .catch((e: Error) => setError(e.message || 'Failed to load history'))
      .finally(() => setLoading(false))
  }, [voucherName])

  if (loading) return <p className="text-xs text-gray-400 italic py-2">Loading history…</p>
  if (error)   return <p className="text-xs text-red-500 py-2">{error}</p>
  if (!history?.length) return <p className="text-xs text-gray-400 italic py-2">No change history recorded yet.</p>

  return (
    <ol className="relative border-l border-gray-200 ml-2 space-y-3 mt-2">
      {history.map((entry, i) => (
        <li key={i} className="ml-4">
          <span className="absolute -left-1.5 w-3 h-3 rounded-full bg-gray-300 border border-white" />
          <div className="text-[11px] text-gray-500 mb-0.5">
            <span className="font-medium text-gray-700">{entry.owner}</span>{' — '}{fmtDatetime(entry.creation)}
          </div>
          {entry.changed?.length ? (
            <ul className="space-y-0.5">
              {entry.changed.map((c, j) => (
                <li key={j} className="text-[11px] text-gray-600">
                  <span className="font-medium">{c.field.replace(/_/g, ' ')}</span>{': '}
                  <span className="line-through text-gray-400">{humanVal(c.from)}</span>{' → '}
                  <span className="text-gray-800">{humanVal(c.to)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-gray-400 italic">No field changes recorded</p>
          )}
        </li>
      ))}
    </ol>
  )
}

// ── VoucherCard ───────────────────────────────────────────────────────────────

function VoucherCard({
  voucher, onApproved, onRejected,
}: {
  voucher: PendingVoucher
  onApproved: (name: string, newStatus: string) => void
  onRejected: (name: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [rejectNote, setRejectNote] = useState('')
  const [acting, setActing] = useState(false)
  const [error, setError] = useState('')
  const [localDoc, setLocalDoc] = useState(voucher)
  const { can } = usePermissions()
  const isAuthorizer = can('canAuthorizeVouchers')

  const days = daysUntil(localDoc.valid_until)
  const expiryClass =
    days < 0  ? 'text-red-600 font-semibold' :
    days <= 7 ? 'text-amber-600 font-semibold' :
    'text-gray-700'

  const handleApprove = async () => {
    setError('')
    setActing(true)
    try {
      const res = await frappe.call<{ status: string; authorized_by_jason: number }>(
        'casamoderna_dms.voucher_api.authorize_voucher',
        { voucher_name: localDoc.name },
      )
      const updated = { ...localDoc, status: res?.status ?? localDoc.status, authorized_by_jason: res?.authorized_by_jason ?? localDoc.authorized_by_jason }
      setLocalDoc(updated)
      if (res?.status === 'Authorized') {
        onApproved(localDoc.name, 'Authorized')
      } else {
        onApproved(localDoc.name, 'Pending Authorization')
      }
    } catch (e: unknown) {
      setError((e as Error).message || 'Action failed')
    } finally {
      setActing(false)
    }
  }

  const handleReject = async () => {
    setError('')
    setActing(true)
    try {
      await frappe.call('casamoderna_dms.voucher_api.reject_voucher', { voucher_name: localDoc.name, reason: rejectNote })
      setShowReject(false)
      onRejected(localDoc.name)
    } catch (e: unknown) {
      setError((e as Error).message || 'Action failed')
    } finally {
      setActing(false)
    }
  }

  return (
    <div className={`bg-white border rounded-lg shadow-sm overflow-hidden transition-all ${
      localDoc.status === 'Authorized' ? 'border-green-300' : 'border-gray-200'
    }`}>
      {/* Header row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 select-none"
        onClick={() => setExpanded((p) => !p)}
      >
        <div className="w-40 shrink-0">
          <span className="font-mono text-sm font-bold text-cm-green tracking-widest block">{localDoc.voucher_code}</span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${SOURCE_STYLES[localDoc.voucher_source] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
            {localDoc.voucher_source}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-xs text-gray-500">
            <span className="font-medium text-gray-700">{localDoc.purchaser_name || localDoc.purchaser_customer}</span>
            <span className="mx-1 text-gray-300">→</span>
            <span className="font-medium text-gray-700">{localDoc.recipient_name || localDoc.recipient_customer}</span>
          </div>
        </div>

        <span className="tabular-nums text-sm font-semibold text-gray-800 shrink-0 w-20 text-right">{fmtMoney(localDoc.voucher_value)}</span>

        <span className={`text-xs shrink-0 w-24 text-right ${expiryClass}`}>
          {localDoc.valid_until ? fmtDate(localDoc.valid_until) : '—'}
          <span className="block text-[10px] font-normal">
            {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`}
          </span>
        </span>

        <div className="shrink-0 flex items-center gap-1.5 text-xs">
          <span className={`w-2.5 h-2.5 rounded-full ${localDoc.authorized_by_jason ? 'bg-green-500' : 'bg-gray-300'}`} />
          <span className={localDoc.authorized_by_jason ? 'text-green-700 font-medium' : 'text-gray-400'}>
            Jason {localDoc.authorized_by_jason ? '✓' : '(pending)'}
          </span>
        </div>

        <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
          localDoc.status === 'Authorized' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
        }`}>
          {localDoc.status}
        </span>

        <span className="text-gray-400 text-xs ml-1">{expanded ? '▲' : '▼'}</span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-5 bg-gray-50">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className={CM.sectionTitle}>Purchaser</p>
              <p className="text-sm font-medium">{localDoc.purchaser_name || '—'}</p>
              <p className="text-[11px] text-gray-400 font-mono">{localDoc.purchaser_customer}</p>
            </div>
            <div>
              <p className={CM.sectionTitle}>Recipient</p>
              <p className="text-sm font-medium">{localDoc.recipient_name || '—'}</p>
              <p className="text-[11px] text-gray-400 font-mono">{localDoc.recipient_customer}</p>
            </div>
            <div>
              <p className={CM.sectionTitle}>Voucher Value</p>
              <p className="text-sm font-semibold text-gray-800">{fmtMoney(localDoc.voucher_value)}</p>
            </div>
            <div>
              <p className={CM.sectionTitle}>Valid Until</p>
              <p className={`text-sm font-medium ${expiryClass}`}>{localDoc.valid_until ? fmtDate(localDoc.valid_until) : '—'}</p>
            </div>
            <div>
              <p className={CM.sectionTitle}>Created By</p>
              <p className="text-sm">{localDoc.owner || '—'}</p>
              <p className="text-[11px] text-gray-400">{fmtDatetime(localDoc.creation ?? '')}</p>
            </div>
            <div>
              <p className={CM.sectionTitle}>Last Modified</p>
              <p className="text-sm">{localDoc.modified_by || '—'}</p>
              <p className="text-[11px] text-gray-400">{fmtDatetime(localDoc.modified ?? '')}</p>
            </div>
          </div>

          {localDoc.notes && (
            <div>
              <p className={CM.sectionTitle + ' mb-1'}>Notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap bg-white border border-gray-200 rounded px-3 py-2">{localDoc.notes}</p>
            </div>
          )}

          <div>
            <p className={CM.sectionTitle + ' mb-2'}>Authorization Status</p>
            <div className="flex gap-6">
              <div className={`flex items-center gap-2 px-3 py-2 rounded border ${localDoc.authorized_by_jason ? 'bg-green-50 border-green-300' : 'bg-white border-gray-200'}`}>
                <span className={`w-3 h-3 rounded-full ${localDoc.authorized_by_jason ? 'bg-green-500' : 'bg-gray-200'}`} />
                <div>
                  <p className="text-xs font-semibold">Jason Falzon</p>
                  <p className={`text-[11px] ${localDoc.authorized_by_jason ? 'text-green-600' : 'text-gray-400'}`}>
                    {localDoc.authorized_by_jason ? 'Approved ✓' : 'Awaiting approval'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <p className={CM.sectionTitle + ' mb-1'}>Change History</p>
            <HistoryPanel voucherName={localDoc.name} />
          </div>

          {error && (
            <div className="rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          {isAuthorizer && localDoc.status === 'Pending Authorization' && (
            <div className="space-y-3">
              {!showReject ? (
                <div className="flex gap-2 flex-wrap">
                  {!localDoc.authorized_by_jason && (
                    <Btn onClick={handleApprove} disabled={acting}>{acting ? 'Approving…' : '✓ Approve'}</Btn>
                  )}
                  {localDoc.authorized_by_jason && (
                    <span className="text-xs text-green-600 font-medium py-1.5">You have already approved this voucher.</span>
                  )}
                  <button className={CM.btn.danger} onClick={() => setShowReject(true)} disabled={acting}>✕ Reject</button>
                </div>
              ) : (
                <div className="space-y-2 bg-red-50 border border-red-200 rounded p-3">
                  <p className="text-xs font-semibold text-red-700">Confirm rejection</p>
                  <textarea
                    rows={2} value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                    className={CM.textarea + ' resize-none'}
                    placeholder="Reason (optional)…"
                  />
                  <div className="flex gap-2">
                    <button className={CM.btn.danger} onClick={handleReject} disabled={acting}>{acting ? 'Rejecting…' : 'Confirm Reject'}</button>
                    <Btn variant="ghost" onClick={() => { setShowReject(false); setRejectNote('') }} disabled={acting}>Cancel</Btn>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Summary Bar ───────────────────────────────────────────────────────────────

function SummaryBar({ vouchers }: { vouchers: PendingVoucher[] }) {
  const total        = vouchers.length
  const jasonPending = vouchers.filter((v) => !v.authorized_by_jason).length

  return (
    <div className="grid grid-cols-2 gap-3">
      {[
        { label: 'Pending Total',  value: total,        color: 'text-amber-700' },
        { label: 'Awaiting Jason', value: jasonPending, color: 'text-blue-700' },
      ].map(({ label, value, color }) => (
        <div key={label} className="bg-white border border-gray-200 rounded p-3 text-center">
          <p className={`text-2xl font-bold ${color}`}>{value}</p>
          <p className="text-[10px] uppercase tracking-wider text-gray-500 mt-0.5">{label}</p>
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function VoucherApprovals() {
  const navigate = useNavigate()
  const [vouchers, setVouchers] = useState<PendingVoucher[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastLoad, setLastLoad] = useState<Date | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    frappe.call<PendingVoucher[]>('casamoderna_dms.voucher_api.get_pending_authorizations')
      .then((data) => {
        setVouchers(Array.isArray(data) ? data : [])
        setLastLoad(new Date())
      })
      .catch((e: Error) => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const handleApproved = (name: string, newStatus: string) => {
    if (newStatus === 'Authorized') {
      setVouchers((prev) => prev.filter((v) => v.name !== name))
    } else {
      load()
    }
  }

  const handleRejected = (name: string) => {
    setVouchers((prev) => prev.filter((v) => v.name !== name))
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pending Authorisations"
        subtitle="Company-issued vouchers (Casa Moderna / Danzah) awaiting approval"
        actions={
          <div className="flex items-center gap-2">
            {lastLoad && (
              <span className="text-[11px] text-gray-400">
                Updated {lastLoad.toLocaleTimeString('en-GB', { timeStyle: 'short' })}
              </span>
            )}
            <Btn variant="ghost" onClick={load} disabled={loading}>↻ Refresh</Btn>
            <Btn variant="ghost" onClick={() => navigate('/customers/vouchers')}>All Vouchers</Btn>
          </div>
        }
      />

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {!loading && !error && (
        <>
          <SummaryBar vouchers={vouchers} />

          {vouchers.length === 0 ? (
            <DetailSection title="">
              <div className="py-10 text-center text-gray-400">
                <p className="text-3xl mb-2">✅</p>
                <p className="font-medium text-gray-600">No vouchers pending authorization</p>
                <p className="text-sm mt-1">All vouchers have been processed.</p>
              </div>
            </DetailSection>
          ) : (
            <div className="space-y-2">
              <div className="hidden md:flex items-center gap-3 px-4 py-1 text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
                <span className="w-32 shrink-0">Code</span>
                <span className="flex-1">Purchaser → Recipient</span>
                <span className="w-20 text-right">Value</span>
                <span className="w-24 text-right">Valid Until</span>
                <span className="w-36">Approval</span>
                <span className="w-24">Status</span>
                <span className="w-4" />
              </div>
              {vouchers.map((v) => (
                <VoucherCard
                  key={v.name}
                  voucher={v}
                  onApproved={handleApproved}
                  onRejected={handleRejected}
                />
              ))}
            </div>
          )}
        </>
      )}

      {loading && (
        <div className="py-10 text-center text-sm text-gray-400 animate-pulse">
          Loading pending authorizations…
        </div>
      )}
    </div>
  )
}
