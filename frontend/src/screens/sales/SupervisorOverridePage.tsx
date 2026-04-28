/**
 * SupervisorOverridePage — approve / reject price override requests.
 * Route: /supervisor/price-overrides
 * Access: canPriceSupervisor
 *
 * Polls get_pending_override_requests every 5 seconds.
 * Shows today's resolved requests below the pending table.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import { usePermissions } from '../../auth/PermissionsProvider'
import { fmtMoney } from '../../utils/fmt'
import { PageHeader } from '../../components/shared/ui'

function fmtTime(dt: string | null | undefined): string {
  if (!dt) return '—'
  try {
    return new Date(dt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  } catch { return dt }
}

function fmtDateTime(dt: string | null | undefined): string {
  if (!dt) return '—'
  try {
    return new Date(dt).toLocaleString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return dt }
}

interface OverrideRequest {
  name: string
  salesperson: string
  sales_doctype: string
  doc_name: string
  item_code: string
  item_name: string
  standard_rate: number
  requested_rate: number
  creation: string
  resolved_at?: string
  status?: string
}

function DiffCell({ standard, requested }: { standard: number; requested: number }) {
  const diff = Number(standard) - Number(requested)
  if (diff <= 0) return <span className="tabular-nums text-gray-500">{fmtMoney(requested)}</span>
  return (
    <span className="tabular-nums text-red-600 font-medium">
      {fmtMoney(requested)}{' '}
      <span className="text-[10px] font-normal text-red-400">(-{fmtMoney(diff)})</span>
    </span>
  )
}

export function SupervisorOverridePage() {
  const { can }  = usePermissions()
  const navigate = useNavigate()

  const [pending,     setPending]     = useState<OverrideRequest[]>([])
  const [resolved,    setResolved]    = useState<OverrideRequest[]>([])
  const [loadError,   setLoadError]   = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [acting,      setActing]      = useState<string | null>(null)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const hasAccess = can('canPriceSupervisor')

  const fetchPending = useCallback(async () => {
    try {
      const res = await frappe.callGet<{ message?: OverrideRequest[] }>(
        'casamoderna_dms.price_override_api.get_pending_override_requests',
      )
      setPending((res as unknown as { message?: OverrideRequest[] })?.message ?? (res as unknown as OverrideRequest[]) ?? [])
      setLoadError(null)
    } catch (err) {
      setLoadError((err as Error).message || 'Failed to load requests')
    }
  }, [])

  const fetchResolved = useCallback(async () => {
    try {
      const res = await frappe.callGet<{ message?: OverrideRequest[] }>(
        'casamoderna_dms.price_override_api.get_resolved_override_requests',
      )
      setResolved((res as unknown as { message?: OverrideRequest[] })?.message ?? (res as unknown as OverrideRequest[]) ?? [])
    } catch { /* non-critical */ }
  }, [])

  useEffect(() => {
    if (!hasAccess) return
    fetchPending()
    fetchResolved()
    pollRef.current = setInterval(() => { fetchPending(); fetchResolved() }, 5000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [hasAccess, fetchPending, fetchResolved])

  const handleAction = useCallback(async (requestName: string, action: 'approve' | 'reject') => {
    setActing(requestName)
    setActionError(null)
    const method = action === 'approve'
      ? 'casamoderna_dms.price_override_api.approve_override_request'
      : 'casamoderna_dms.price_override_api.reject_override_request'
    try {
      await frappe.call(method, { request_name: requestName })
      await Promise.all([fetchPending(), fetchResolved()])
    } catch (err) {
      setActionError((err as Error).message || `Failed to ${action} request`)
    } finally {
      setActing(null)
    }
  }, [fetchPending, fetchResolved])

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <div className="text-4xl">🔒</div>
        <div className="text-lg font-semibold text-gray-700">Access Denied</div>
        <p className="text-sm text-gray-500 max-w-xs">
          You need the <strong>CasaModerna Price Supervisor</strong> role to access this page.
        </p>
        <button
          className="mt-2 px-4 py-2 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          onClick={() => navigate(-1)}
        >
          ← Go Back
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Price Override Requests"
        subtitle="Review and approve below-floor price requests from salespersons"
      />

      {loadError && (
        <div className="mx-6 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{loadError}</div>
      )}
      {actionError && (
        <div className="mx-6 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 flex items-start gap-2">
          <span className="flex-1">{actionError}</span>
          <button className="text-red-400 hover:text-red-700" onClick={() => setActionError(null)}>✕</button>
        </div>
      )}

      <div className="mx-6 space-y-6">
        {/* ── Pending requests ────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">Pending Approval</h2>
            {pending.length > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                {pending.length}
              </span>
            )}
          </div>

          {pending.length === 0 ? (
            <div className="rounded border border-dashed border-gray-200 py-10 text-center text-sm text-gray-400 bg-gray-50">
              No requests pending — checking every 5 seconds
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Time</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Salesperson</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Document</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Item</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Standard</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Requested</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pending.map((req) => {
                    const isActing = acting === req.name
                    return (
                      <tr key={req.name} className={`hover:bg-gray-50 transition-colors ${isActing ? 'opacity-50' : ''}`}>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap tabular-nums">
                          {fmtTime(req.creation)}
                        </td>
                        <td className="px-3 py-2 text-gray-700">{req.salesperson}</td>
                        <td className="px-3 py-2">
                          <div className="text-gray-600 text-[10px]">{req.sales_doctype}</div>
                          <div className="text-gray-800 font-medium">{req.doc_name || <span className="text-gray-400 italic">New document</span>}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-800">{req.item_name || req.item_code}</div>
                          <div className="text-[10px] text-gray-400">{req.item_code}</div>
                          <div className="text-[10px] text-gray-300 mt-0.5">{req.name}</div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-500">{fmtMoney(req.standard_rate)}</td>
                        <td className="px-3 py-2 text-right">
                          <DiffCell standard={req.standard_rate} requested={req.requested_rate} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              disabled={isActing}
                              onClick={() => handleAction(req.name, 'approve')}
                              className="px-2.5 py-1 rounded bg-emerald-600 text-white text-[11px] font-semibold hover:bg-emerald-700 disabled:opacity-40 transition-colors"
                            >
                              {isActing ? '…' : 'Approve'}
                            </button>
                            <button
                              type="button"
                              disabled={isActing}
                              onClick={() => handleAction(req.name, 'reject')}
                              className="px-2.5 py-1 rounded bg-red-100 text-red-700 text-[11px] font-semibold hover:bg-red-200 disabled:opacity-40 transition-colors"
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Today's resolved requests ────────────────────────────── */}
        {resolved.length > 0 && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Resolved Today</h2>
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Resolved</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Salesperson</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Document</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Item</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Standard</th>
                    <th className="text-right px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Approved At</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {resolved.map((req) => (
                    <tr key={req.name} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap tabular-nums">
                        {fmtDateTime(req.resolved_at)}
                      </td>
                      <td className="px-3 py-2 text-gray-700">{req.salesperson}</td>
                      <td className="px-3 py-2">
                        <div className="text-gray-600 text-[10px]">{req.sales_doctype}</div>
                        <div className="text-gray-800 font-medium">{req.doc_name || <span className="text-gray-400 italic">New</span>}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-800">{req.item_name || req.item_code}</div>
                        <div className="text-[10px] text-gray-400">{req.item_code}</div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-500">{fmtMoney(req.standard_rate)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                        <DiffCell standard={req.standard_rate} requested={req.requested_rate} />
                      </td>
                      <td className="px-3 py-2">
                        {req.status === 'Approved' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-semibold">
                            ✅ Approved
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-semibold">
                            ❌ Rejected
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
