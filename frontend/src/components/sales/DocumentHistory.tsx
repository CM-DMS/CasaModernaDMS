/**
 * DocumentHistory — rich audit trail panel for saved documents.
 *
 * Rich audit trail panel for saved documents. Calls get_doc_history() which
 * merges creation + Version track_changes entries into a chronological timeline.
 */
import { useState, useEffect } from 'react'
import { frappe } from '../../api/frappe'

function fmtTs(ts: string | null | undefined) {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ts
  }
}

const EVENT_STYLES: Record<string, { dot: string; badge: string }> = {
  Created: { dot: 'bg-gray-400', badge: 'bg-gray-100 text-gray-600' },
  Saved: { dot: 'bg-amber-400', badge: 'bg-amber-100 text-amber-800' },
  Submitted: { dot: 'bg-green-500', badge: 'bg-green-100 text-green-800' },
  Cancelled: { dot: 'bg-red-500', badge: 'bg-red-100 text-red-700' },
  Amended: { dot: 'bg-purple-500', badge: 'bg-purple-100 text-purple-800' },
}

function EventBadge({ event }: { event: string }) {
  const s = EVENT_STYLES[event] ?? { badge: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${s.badge}`}>
      {event}
    </span>
  )
}

function DotLine({ event, isLast }: { event: string; isLast: boolean }) {
  const s = EVENT_STYLES[event] ?? { dot: 'bg-gray-400' }
  return (
    <div className="flex flex-col items-center mr-2 flex-shrink-0" style={{ width: 14 }}>
      <div className={`w-2.5 h-2.5 rounded-full mt-1 ${s.dot}`} />
      {!isLast && <div className="w-px flex-1 bg-gray-200 mt-0.5" />}
    </div>
  )
}

interface HistoryChange {
  raw_field: string
  label: string
  old: string
  new: string
}

interface HistoryEvent {
  id: string
  event: string
  user: string
  display_name?: string
  time: string
  summary: { grand_total?: string; status?: string }
  changes: HistoryChange[]
  row_summary?: string
}

function HistoryEntry({ entry, isLast }: { entry: HistoryEvent; isLast: boolean }) {
  const [open, setOpen] = useState(false)
  const hasDetails = entry.changes.length > 0 || !!entry.row_summary
  const displayName = entry.display_name || entry.user?.split('@')[0] || 'System'

  return (
    <div className="flex">
      <DotLine event={entry.event} isLast={isLast} />
      <div className="flex-1 pb-3">
        <div className="flex items-start gap-2 flex-wrap">
          <EventBadge event={entry.event} />
          <span className="text-[11px] font-medium text-gray-700">{displayName}</span>
          <span className="text-[10px] text-gray-400 ml-auto whitespace-nowrap">
            {fmtTs(entry.time)}
          </span>
        </div>

        {(entry.summary.grand_total || entry.summary.status) && (
          <div className="flex gap-2 mt-1 flex-wrap">
            {entry.summary.grand_total && (
              <span className="text-[11px] font-semibold text-gray-800">
                {entry.summary.grand_total}
              </span>
            )}
            {entry.summary.status && (
              <span className="text-[10px] text-gray-500 italic">{entry.summary.status}</span>
            )}
          </div>
        )}

        {entry.row_summary && (
          <div className="text-[10px] text-gray-400 mt-0.5">{entry.row_summary}</div>
        )}

        {hasDetails && (
          <button
            type="button"
            className="mt-1 text-[10px] text-blue-500 hover:text-blue-700 select-none"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? 'Hide changes ▲' : 'Show changes ▾'}
          </button>
        )}

        {open && entry.changes.length > 0 && (
          <table className="mt-1 w-full text-[10px] border-collapse">
            <thead>
              <tr className="text-left text-gray-400">
                <th className="pb-0.5 w-32 font-semibold">Field</th>
                <th className="pb-0.5 w-2/5 font-semibold">Before</th>
                <th className="pb-0.5 font-semibold">After</th>
              </tr>
            </thead>
            <tbody>
              {entry.changes.map((c) => (
                <tr key={c.raw_field} className="border-t border-gray-100 align-top">
                  <td className="py-0.5 pr-2 font-medium text-gray-600">{c.label}</td>
                  <td className="py-0.5 pr-2 text-red-600 break-all">
                    {c.old !== '—' ? (
                      <span className="line-through opacity-70">{c.old}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="py-0.5 text-green-700 break-all">
                    {c.new || <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

interface Props {
  doctype: string
  docName: string | null | undefined
}

export function DocumentHistory({ doctype, docName }: Props) {
  const [events, setEvents] = useState<HistoryEvent[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!docName || docName === 'new') return
    setLoading(true)
    frappe
      .call('casamoderna_dms.audit_api.get_doc_history', {
        doctype,
        docname: docName,
      })
      .then((data: any) => setEvents(Array.isArray(data) ? data : []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false))
  }, [doctype, docName])

  if (!docName || docName === 'new') return null

  if (loading) {
    return (
      <div className="text-[11px] text-gray-400 py-2 text-center">Loading history…</div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="text-[11px] text-gray-400 py-2 text-center">No history yet.</div>
    )
  }

  const displayed = [...events].reverse()

  return (
    <div className="px-1">
      {displayed.map((entry, idx) => (
        <HistoryEntry key={entry.id} entry={entry} isLast={idx === displayed.length - 1} />
      ))}
    </div>
  )
}
