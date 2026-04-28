/**
 * LeaveRequestList — CM Leave Request list screen.
 *
 * Route: /operations/leave
 */
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { leaveRequestsApi, type LeaveRequestDoc } from '../../api/operations'
import { usePermissions } from '../../auth/PermissionsProvider'
import {
  PageHeader, DetailSection, Btn, selectCls,
} from '../../components/shared/ui'
import { CM } from '../../components/ui/CMClassNames'
import { fmtDate } from '../../utils/fmt'

const STATUS_OPTIONS = ['', 'Pending', 'Approved', 'Rejected', 'Cancelled']

const LEAVE_ICONS: Record<string, string> = {
  'Annual Leave':   '🌴',
  'Sick Leave':     '🤒',
  'Personal Leave': '👤',
  'Unpaid Leave':   '📋',
  'Other':          '📝',
}

function statusPill(status?: string) {
  const map: Record<string, string> = {
    Pending:   'bg-yellow-50 text-yellow-700',
    Approved:  'bg-green-50 text-green-700',
    Rejected:  'bg-red-50 text-red-700',
    Cancelled: 'bg-gray-100 text-gray-500',
  }
  return `text-[11px] font-semibold px-2 py-0.5 rounded-full ${map[status ?? ''] ?? 'bg-gray-100 text-gray-500'}`
}

export function LeaveRequestList() {
  const navigate = useNavigate()
  const { can }  = usePermissions()

  const [rows,    setRows]    = useState<LeaveRequestDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [mine,    setMine]    = useState(!can('canAdmin') && !can('canOperations'))
  const [status,  setStatus]  = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    leaveRequestsApi
      .list({ status: status || undefined, mine: mine || undefined })
      .then((data) => setRows(Array.isArray(data) ? (data as LeaveRequestDoc[]) : []))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [status, mine])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Leave Requests"
        subtitle={`${rows.length} record${rows.length !== 1 ? 's' : ''}`}
        actions={<Btn onClick={() => navigate('/operations/leave/new')}>+ Request Leave</Btn>}
      />

      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className={CM.label}>Status</label>
          <select className={`${selectCls} w-36`} value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s || 'All statuses'}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1.5 pb-1">
          <input id="lve-mine" type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="accent-green-600" />
          <label htmlFor="lve-mine" className="text-sm text-gray-600 cursor-pointer">My requests only</label>
        </div>
        <Btn variant="ghost" onClick={load}>Refresh</Btn>
      </div>

      {error && <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{error}</div>}

      <DetailSection title="">
        {loading ? (
          <div className="py-10 text-center text-sm text-gray-400 animate-pulse">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">No leave requests found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  <th className="text-left px-4 py-2">Employee</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-left px-3 py-2">From</th>
                  <th className="text-left px-3 py-2">To</th>
                  <th className="text-right px-3 py-2">Days</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Reviewed By</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.name}
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/operations/leave/${encodeURIComponent(r.name!)}`)}
                  >
                    <td className="px-4 py-2.5 font-medium">{r.employee_name || r.employee_user}</td>
                    <td className="px-3 py-2.5">
                      <span className="mr-1">{LEAVE_ICONS[r.leave_type ?? ''] ?? '📋'}</span>
                      {r.leave_type}
                    </td>
                    <td className="px-3 py-2.5">{r.from_date ? fmtDate(r.from_date) : '—'}</td>
                    <td className="px-3 py-2.5">{r.to_date ? fmtDate(r.to_date) : '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.total_days}</td>
                    <td className="px-3 py-2.5">
                      <span className={statusPill(r.status)}>{r.status}</span>
                    </td>
                    <td className="px-3 py-2.5 text-gray-500">{r.reviewed_by || '—'}</td>
                    <td className="px-3 py-2.5">
                      <button
                        className="text-xs text-green-700 hover:underline font-medium"
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/operations/leave/${encodeURIComponent(r.name!)}/edit`)
                        }}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DetailSection>
    </div>
  )
}
