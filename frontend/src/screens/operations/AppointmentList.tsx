/**
 * AppointmentList — CM Customer Appointment list screen.
 *
 * Route: /operations/appointments
 */
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { appointmentsApi, type AppointmentDoc } from '../../api/operations'
import {
  PageHeader, DetailSection, Btn, inputCls, selectCls,
} from '../../components/shared/ui'
import { CM } from '../../components/ui/CMClassNames'

const STATUS_OPTIONS = ['', 'Scheduled', 'Completed', 'Cancelled']

const TYPE_ICONS: Record<string, string> = {
  'Kitchen Consultation':   '🍳',
  'Tiles Consultation':     '🔲',
  'Furniture Consultation': '🛋️',
  'Site Measurement':       '📐',
  'After Sales Service':    '🔧',
}

function statusPill(status?: string) {
  const map: Record<string, string> = {
    Scheduled: 'bg-blue-50 text-blue-700',
    Completed: 'bg-green-50 text-green-700',
    Cancelled: 'bg-gray-100 text-gray-500',
  }
  return `text-[11px] font-semibold px-2 py-0.5 rounded-full ${map[status ?? ''] ?? 'bg-gray-100 text-gray-500'}`
}

export function AppointmentList() {
  const navigate = useNavigate()

  const [rows,    setRows]    = useState<AppointmentDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [mine,    setMine]    = useState(false)
  const [status,  setStatus]  = useState('')
  const [q,       setQ]       = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    appointmentsApi
      .list({ status: status || undefined, mine: mine || undefined })
      .then((data) => setRows(Array.isArray(data) ? (data as AppointmentDoc[]) : []))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [status, mine])

  useEffect(() => { load() }, [load])

  const filtered = q
    ? rows.filter((r) =>
        [r.customer_name, r.appointment_type, r.salesperson].some(
          (f) => (f ?? '').toLowerCase().includes(q.toLowerCase()),
        ),
      )
    : rows

  return (
    <div className="space-y-4">
      <PageHeader
        title="Appointments"
        subtitle={`${filtered.length} record${filtered.length !== 1 ? 's' : ''}`}
        actions={<Btn onClick={() => navigate('/operations/appointments/new')}>+ New Appointment</Btn>}
      />

      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className={CM.label}>Search</label>
          <input
            className={`${inputCls} w-48`}
            placeholder="Customer / type / salesperson…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div>
          <label className={CM.label}>Status</label>
          <select className={`${selectCls} w-36`} value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s || 'All statuses'}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1.5 pb-1">
          <input id="apt-mine" type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="accent-green-600" />
          <label htmlFor="apt-mine" className="text-sm text-gray-600 cursor-pointer">Mine only</label>
        </div>
        <Btn variant="ghost" onClick={load}>Refresh</Btn>
      </div>

      {error && <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{error}</div>}

      <DetailSection title="">
        {loading ? (
          <div className="py-10 text-center text-sm text-gray-400 animate-pulse">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">No appointments found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  <th className="text-left px-4 py-2">Type</th>
                  <th className="text-left px-3 py-2">Customer</th>
                  <th className="text-left px-3 py-2">Date</th>
                  <th className="text-left px-3 py-2">Time</th>
                  <th className="text-left px-3 py-2">Location</th>
                  <th className="text-left px-3 py-2">Assigned To</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.name}
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/operations/appointments/${encodeURIComponent(r.name!)}`)}
                  >
                    <td className="px-4 py-2.5">
                      <span className="mr-1">{TYPE_ICONS[r.appointment_type ?? ''] ?? '📅'}</span>
                      <span className="text-[11px]">{r.appointment_type}</span>
                    </td>
                    <td className="px-3 py-2.5 font-medium">{r.customer_name}</td>
                    <td className="px-3 py-2.5">{r.appointment_date}</td>
                    <td className="px-3 py-2.5">
                      {r.start_time
                        ? `${r.start_time.slice(0, 5)}${r.end_time ? ' – ' + r.end_time.slice(0, 5) : ''}`
                        : '—'}
                    </td>
                    <td className="px-3 py-2.5">{r.location || '—'}</td>
                    <td className="px-3 py-2.5 text-gray-500">{r.salesperson || '—'}</td>
                    <td className="px-3 py-2.5">
                      <span className={statusPill(r.status)}>{r.status}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        className="text-xs text-green-700 hover:underline font-medium"
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/operations/appointments/${encodeURIComponent(r.name!)}/edit`)
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
