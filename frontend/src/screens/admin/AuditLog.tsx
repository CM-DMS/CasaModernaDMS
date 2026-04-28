import { useState, useCallback } from 'react'
import { PageHeader, FilterRow, inputCls, selectCls } from '../../components/shared/ui'
import { CM } from '../../components/ui/CMClassNames'
import { frappe } from '../../api/frappe'

const today = () => new Date().toISOString().slice(0, 10)
const sevenDaysAgo = () => {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString().slice(0, 10)
}

const EVENT_COLORS: Record<string, string> = {
  Login:     'bg-blue-100 text-blue-800',
  Logout:    'bg-gray-100 text-gray-600',
  Saved:     'bg-amber-100 text-amber-800',
  Submitted: 'bg-green-100 text-green-800',
  Cancelled: 'bg-red-100 text-red-700',
  Amended:   'bg-purple-100 text-purple-800',
  Deleted:   'bg-red-200 text-red-900',
}

interface AuditField { field: string; old: string; new: string }
interface AuditRowChange { child_doctype: string; row_name: string; diffs: AuditField[] }
interface AuditRow {
  type: string
  time: string
  display_name: string
  user: string
  ip_address: string
  event: string
  ref_doctype: string
  docname: string
  subject: string
  changed_count: number
  changes: AuditField[]
  row_changes: AuditRowChange[]
}

function EventBadge({ event }: { event: string }) {
  const cls = EVENT_COLORS[event] ?? 'bg-gray-100 text-gray-700'
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}>{event}</span>
  )
}

function DiffPanel({ changes, rowChanges }: { changes: AuditField[]; rowChanges: AuditRowChange[] }) {
  if (!changes.length && !rowChanges.length) {
    return <p className="text-xs text-gray-400 py-1">No field changes recorded.</p>
  }
  const renderTable = (diffs: AuditField[]) => (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="text-left text-gray-500">
          <th className="pb-1 w-48 font-semibold">Field</th>
          <th className="pb-1 w-2/5 font-semibold text-red-600">Before</th>
          <th className="pb-1 font-semibold text-green-700">After</th>
        </tr>
      </thead>
      <tbody>
        {diffs.map((c, i) => (
          <tr key={i} className="border-t border-gray-100 align-top">
            <td className="py-1 pr-3 font-medium text-gray-700">{c.field}</td>
            <td className="py-1 pr-3 text-red-700 break-words">
              {c.old ? <span className="line-through opacity-75">{c.old}</span> : <span className="text-gray-400">—</span>}
            </td>
            <td className="py-1 text-green-800 break-words">{c.new || <span className="text-gray-400">—</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )

  return (
    <div className="space-y-4">
      {changes.length > 0 && renderTable(changes)}
      {rowChanges.map((rc, ri) => (
        <div key={ri}>
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
            {rc.child_doctype} — row {rc.row_name}
          </p>
          {renderTable(rc.diffs)}
        </div>
      ))}
    </div>
  )
}

function AuditRowComp({ row, idx, expanded, onToggle }: {
  row: AuditRow; idx: number; expanded: boolean; onToggle: () => void
}) {
  const isDoc = row.type === 'version'
  const userName = row.display_name || row.user || '—'

  return (
    <>
      <tr
        className={`border-b border-gray-100 hover:bg-gray-50 transition-colors${isDoc && row.changed_count > 0 ? ' cursor-pointer' : ''}`}
        onClick={isDoc && row.changed_count > 0 ? onToggle : undefined}
      >
        <td className="py-2 pl-4 pr-2 text-xs text-gray-500 whitespace-nowrap">{row.time.slice(0, 16).replace('T', ' ')}</td>
        <td className="py-2 px-2 text-xs">
          <div className="font-medium text-gray-800">{userName}</div>
          {row.ip_address && <div className="text-gray-400 text-[11px]">{row.ip_address}</div>}
        </td>
        <td className="py-2 px-2"><EventBadge event={row.event} /></td>
        <td className="py-2 px-2 text-xs text-gray-700">
          {isDoc ? (
            <>
              <span className="text-gray-400 text-[11px]">{row.ref_doctype}</span>
              <div className="font-medium">{row.docname}</div>
            </>
          ) : (
            <span className="text-gray-600">{row.subject}</span>
          )}
        </td>
        <td className="py-2 pr-4 text-xs text-right">
          {isDoc && row.changed_count > 0 ? (
            <span className="text-blue-600 font-medium select-none">
              {row.changed_count} field{row.changed_count !== 1 ? 's' : ''} {expanded ? '▴' : '▾'}
            </span>
          ) : isDoc ? (
            <span className="text-gray-300 text-[11px]">no diff</span>
          ) : null}
        </td>
      </tr>
      {expanded && isDoc && (
        <tr className="bg-blue-50/40 border-b border-gray-200">
          <td colSpan={5} className="px-8 py-3">
            <DiffPanel changes={row.changes} rowChanges={row.row_changes} />
          </td>
        </tr>
      )}
    </>
  )
}

export function AuditLog() {
  const [fromDate, setFromDate]   = useState(sevenDaysAgo())
  const [toDate, setToDate]       = useState(today())
  const [user, setUser]           = useState('')
  const [eventType, setEventType] = useState('all')
  const [docType, setDocType]     = useState('')
  const [rows, setRows]           = useState<AuditRow[]>([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [searched, setSearched]   = useState(false)
  const [expanded, setExpanded]   = useState<Set<number>>(new Set())

  const toggleExpand = useCallback((idx: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx); else next.add(idx)
      return next
    })
  }, [])

  const runSearch = useCallback(async () => {
    setLoading(true)
    setError(null)
    setExpanded(new Set())
    try {
      const data = await frappe.call<AuditRow[]>(
        'casamoderna_dms.audit_api.get_audit_log',
        { from_date: fromDate, to_date: toDate, user, event_type: eventType, ref_doctype: docType, limit: 300 },
      )
      setRows(Array.isArray(data) ? data : [])
      setSearched(true)
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to load audit log')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [fromDate, toDate, user, eventType, docType])

  return (
    <div className="space-y-4">
      <PageHeader title="Audit Log" subtitle="Login events and document changes" />

      <FilterRow>
        <label className="flex items-center gap-1 text-xs font-medium text-gray-600">
          From
          <input type="date" className={inputCls + ' ml-1'} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </label>
        <label className="flex items-center gap-1 text-xs font-medium text-gray-600">
          To
          <input type="date" className={inputCls + ' ml-1'} value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </label>
        <input className={inputCls + ' w-40'} value={user} onChange={(e) => setUser(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && runSearch()} placeholder="Filter by user…" />
        <select className={selectCls + ' w-44'} value={eventType} onChange={(e) => setEventType(e.target.value)}>
          <option value="all">All events</option>
          <option value="login">Login / Logout only</option>
          <option value="change">Document changes only</option>
        </select>
        {(eventType === 'all' || eventType === 'change') && (
          <input className={inputCls + ' w-44'} value={docType}
            onChange={(e) => setDocType(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
            placeholder="e.g. Sales Order" />
        )}
        <button onClick={runSearch} disabled={loading} className={CM.btn.primary}>
          {loading ? 'Loading…' : 'Search'}
        </button>
      </FilterRow>

      {error && <div className="text-sm text-red-600 px-1">{error}</div>}

      {searched && rows.length === 0 && (
        <div className="text-sm text-gray-400 px-1 py-4">No activity found for the selected filters.</div>
      )}

      {searched && rows.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="py-2 pl-4 pr-2 text-left text-xs font-semibold text-gray-500 w-36">Time</th>
                <th className="py-2 px-2 text-left text-xs font-semibold text-gray-500 w-44">User</th>
                <th className="py-2 px-2 text-left text-xs font-semibold text-gray-500 w-28">Event</th>
                <th className="py-2 px-2 text-left text-xs font-semibold text-gray-500">Document / Subject</th>
                <th className="py-2 pr-4 text-right text-xs font-semibold text-gray-500 w-28">Changes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <AuditRowComp key={i} idx={i} row={row} expanded={expanded.has(i)} onToggle={() => toggleExpand(i)} />
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
            {rows.length} record{rows.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {!searched && !loading && (
        <div className="text-sm text-gray-400 px-1 py-4">Set filters and click Search to load the audit log.</div>
      )}
    </div>
  )
}
