/**
 * PriceOverrideRequestModal — TypeScript port of V2 PriceOverrideRequestModal.jsx.
 *
 * Shown when a salesperson attempts to save a document with items priced below
 * their standard offer floor. Creates CM Price Override Requests and polls for
 * supervisor approval.
 */
import { useEffect, useRef, useState } from 'react'
import { frappe } from '../../api/frappe'
import { fmtMoneyExact } from '../../utils/pricing'

const EUR = (v: unknown) => (v != null ? fmtMoneyExact(Number(v)) : '—')

const STATUS_ICON: Record<string, string> = {
  Pending: '⏳',
  Approved: '✅',
  Rejected: '❌',
}

const STATUS_COLOR: Record<string, string> = {
  Pending: 'text-amber-600',
  Approved: 'text-emerald-600 font-semibold',
  Rejected: 'text-red-600 font-semibold',
}

interface BelowFloorItem {
  item_code: string
  item_name?: string
  cm_final_offer_inc_vat?: number
  rate?: number
  [key: string]: unknown
}

interface OverrideRequest {
  name: string
  item_code: string
  item_name?: string
  standard_rate: number
  requested_rate: number
  status: string
}

interface Props {
  isOpen: boolean
  salesDoctype: string
  docName: string | null | undefined
  belowFloorItems: BelowFloorItem[]
  onAllApproved: (requestNames: string[]) => void
  onRejected: () => void
  onClose: () => void
}

export function PriceOverrideRequestModal({
  isOpen,
  salesDoctype,
  docName,
  belowFloorItems,
  onAllApproved,
  onRejected,
  onClose,
}: Props) {
  const [phase, setPhase] = useState<'submitting' | 'waiting' | 'error'>('submitting')
  const [requests, setRequests] = useState<OverrideRequest[]>([])
  const [error, setError] = useState<string | null>(null)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Submit requests on open
  useEffect(() => {
    if (!isOpen || !belowFloorItems?.length) return

    setPhase('submitting')
    setError(null)
    setRequests([])

    const items = belowFloorItems.map((r) => ({
      item_code: r.item_code,
      item_name: r.item_name || r.item_code,
      standard_rate: r.cm_final_offer_inc_vat ?? 0,
      requested_rate: Number(r.rate) || 0,
    }))

    frappe
      .call('casamoderna_dms.price_override_api.create_override_requests', {
        sales_doctype: salesDoctype,
        doc_name: docName || '',
        items_json: JSON.stringify(items),
      })
      .then((res: any) => {
        const created = res?.message ?? res
        if (!Array.isArray(created) || created.length === 0) {
          throw new Error('No requests were created')
        }
        setRequests(created)
        setPhase('waiting')
      })
      .catch((err: any) => {
        setError(err.message || 'Failed to submit override requests')
        setPhase('error')
      })
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // Polling
  useEffect(() => {
    if (phase !== 'waiting' || requests.length === 0) return

    const poll = async () => {
      try {
        const names = requests.map((r) => r.name)
        const res: any = await frappe.callGet(
          'casamoderna_dms.price_override_api.get_override_request_status',
          { request_names_json: JSON.stringify(names) },
        )
        const statusMap: Record<string, string> = res?.message ?? res ?? {}

        setRequests((prev) =>
          prev.map((r) => ({ ...r, status: statusMap[r.name] ?? r.status })),
        )

        const statuses = names.map((n) => statusMap[n] ?? 'Pending')
        if (statuses.every((s) => s === 'Approved')) {
          if (pollRef.current) clearInterval(pollRef.current)
          onAllApproved(names)
        } else if (statuses.some((s) => s === 'Rejected')) {
          if (pollRef.current) clearInterval(pollRef.current)
          onRejected()
        }
      } catch {
        // Silently ignore poll errors
      }
    }

    pollRef.current = setInterval(poll, 4000)
    poll()

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [phase, requests.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  if (!isOpen) return null

  const canCancel = phase !== 'submitting'

  const diff = (req: OverrideRequest) => {
    const d = Number(req.standard_rate) - Number(req.requested_rate)
    return d > 0 ? `-${EUR(d)}` : EUR(d)
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={canCancel ? onClose : undefined}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-800">Supervisor Approval Required</div>
            <div className="text-[11px] text-gray-500 mt-0.5">
              One or more prices are below the standard offer — awaiting supervisor approval.
            </div>
          </div>
          {canCancel && (
            <button
              type="button"
              className="text-gray-400 hover:text-gray-700 ml-3"
              onClick={onClose}
              title="Cancel save"
            >
              ✕
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          {phase === 'submitting' && (
            <div className="flex items-center gap-3 py-4 text-sm text-gray-500">
              <div className="h-5 w-5 rounded-full border-2 border-cm-green border-t-transparent animate-spin flex-shrink-0" />
              Submitting approval requests…
            </div>
          )}

          {phase === 'error' && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {phase === 'waiting' && (
            <>
              <p className="text-[11px] text-gray-500 mb-3">
                A supervisor must approve each item on the{' '}
                <strong>Price Overrides</strong> page before the document can be saved.
              </p>

              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-1 pr-2 font-semibold text-gray-500 text-[10px] uppercase tracking-wide">Item</th>
                    <th className="text-right py-1 px-2 font-semibold text-gray-500 text-[10px] uppercase tracking-wide">Standard</th>
                    <th className="text-right py-1 px-2 font-semibold text-gray-500 text-[10px] uppercase tracking-wide">Requested</th>
                    <th className="text-right py-1 px-2 font-semibold text-gray-500 text-[10px] uppercase tracking-wide">Diff</th>
                    <th className="text-center py-1 pl-2 font-semibold text-gray-500 text-[10px] uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((req) => (
                    <tr key={req.name} className="border-b border-gray-50">
                      <td className="py-2 pr-2 text-gray-800 font-medium">
                        <div>{req.item_name || req.item_code}</div>
                        <div className="text-[10px] text-gray-400">{req.name}</div>
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums text-gray-500">{EUR(req.standard_rate)}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-gray-800">{EUR(req.requested_rate)}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-red-600">{diff(req)}</td>
                      <td className="py-2 pl-2 text-center">
                        <span className={STATUS_COLOR[req.status] || 'text-gray-500'}>
                          {STATUS_ICON[req.status] || '?'} {req.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-3 flex items-center gap-2 text-[11px] text-gray-400">
                <div className="h-3 w-3 rounded-full border border-cm-green border-t-transparent animate-spin flex-shrink-0" />
                Checking for supervisor response every 4 seconds…
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-4 flex justify-end">
          {canCancel && (
            <button
              type="button"
              className="px-3 py-1.5 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
              onClick={onClose}
            >
              Cancel Save
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
