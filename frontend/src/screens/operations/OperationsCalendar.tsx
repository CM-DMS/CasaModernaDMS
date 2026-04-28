/**
 * OperationsCalendar — Unified operations calendar.
 * Shows Appointments, Deliveries, and Leave in month / week / day views.
 *
 * Route: /operations/calendar
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getAppointmentEvents,
  getDeliveryEvents,
  getLeaveEvents,
  smsApi,
  deliverySchedulingApi,
  type DeliveryNoteRow,
  type EmployeeRow,
} from '../../api/operations'

// ─── Helpers ────────────────────────────────────────────────────────────────

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]
const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function toISO(d: Date): string {
  const yyyy = d.getFullYear()
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const dd   = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function isDateInRange(date: Date, from: string, to: string): boolean {
  const d = new Date(date.toDateString())
  const f = new Date(from + 'T00:00:00')
  const t = new Date(to + 'T00:00:00')
  return d >= f && d <= t
}

// ─── Salesperson colours ─────────────────────────────────────────────────────

const SALESPERSON_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  kylie:     { bg: 'bg-blue-100',   text: 'text-blue-900',   border: 'border-blue-500',   dot: 'bg-blue-500'   },
  stephanie: { bg: 'bg-pink-100',   text: 'text-pink-900',   border: 'border-pink-500',   dot: 'bg-pink-500'   },
  melanie:   { bg: 'bg-purple-100', text: 'text-purple-900', border: 'border-purple-500', dot: 'bg-purple-500' },
  safaa:     { bg: 'bg-yellow-100', text: 'text-yellow-900', border: 'border-yellow-500', dot: 'bg-yellow-500' },
  marcelle:  { bg: 'bg-rose-100',   text: 'text-rose-900',   border: 'border-rose-500',   dot: 'bg-rose-500'   },
  brian:     { bg: 'bg-indigo-100', text: 'text-indigo-900', border: 'border-indigo-500', dot: 'bg-indigo-500' },
  lee:       { bg: 'bg-violet-100', text: 'text-violet-900', border: 'border-violet-500', dot: 'bg-violet-500' },
  jason:     { bg: 'bg-teal-100',   text: 'text-teal-900',   border: 'border-teal-500',   dot: 'bg-teal-500'   },
}

function salespersonColorClass(salesperson?: string): string | null {
  if (!salesperson) return null
  const key = salesperson.split('@')[0].split('.')[0].toLowerCase()
  const c = SALESPERSON_COLORS[key]
  if (!c) return null
  return `${c.bg} ${c.text} border-l-2 ${c.border}`
}

// ─── Event colour helpers ────────────────────────────────────────────────────

function appointmentColor(evt: CalEvent): string {
  if (evt.status === 'Cancelled') return 'bg-gray-200 text-gray-500 line-through'
  if (evt.status === 'Completed') return 'bg-green-100 text-green-800 border-l-2 border-green-500'
  if (evt.appointment_type === 'Site Measurement') return 'bg-purple-100 text-purple-800 border-l-2 border-purple-500'
  const sp = salespersonColorClass(evt.salesperson)
  if (sp) return sp
  return 'bg-blue-100 text-blue-800 border-l-2 border-blue-500'
}

function deliveryColor(evt: CalEvent): string {
  if (evt.status === 'Completed') return 'bg-green-100 text-green-800 border-l-2 border-green-500'
  if (evt.status === 'Cancelled') return 'bg-red-100 text-red-700 border-l-2 border-red-400'
  const t = toISO(new Date())
  if ((evt.cm_delivery_date ?? '') < t) return 'bg-orange-100 text-orange-800 border-l-2 border-orange-400'
  return 'bg-sky-100 text-sky-800 border-l-2 border-sky-500'
}

function leaveColor(evt: CalEvent): string {
  const lt = (evt.leave_type ?? '').toLowerCase()
  if (lt.includes('sick') || lt.includes('medical')) return 'bg-red-100 text-red-800 border-l-2 border-red-400'
  if (lt.includes('annual') || lt.includes('vacation')) return 'bg-yellow-100 text-yellow-800 border-l-2 border-yellow-400'
  return 'bg-gray-100 text-gray-700 border-l-2 border-gray-400'
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface DisplayInfo { icon: string; label: string; sub: string | null; colorClass: string }

interface CalEvent {
  name: string
  _type: 'appointment' | 'delivery' | 'leave'
  _display: DisplayInfo
  // appointment
  appointment_date?: string
  appointment_type?: string
  status?: string
  start_time?: string
  end_time?: string
  location?: string
  salesperson?: string
  notes?: string
  customer_name?: string
  // delivery
  cm_delivery_date?: string
  cm_delivery_time_slot?: string
  cm_delivery_team?: string
  // leave
  from_date?: string
  to_date?: string
  employee_name?: string
  employee?: string
  leave_type?: string
  total_leave_days?: number
}

// ─── Event chip ─────────────────────────────────────────────────────────────

function EventChip({ evt, onClick }: { evt: CalEvent; onClick: (e: CalEvent) => void }) {
  const { colorClass, icon, label } = evt._display
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(evt) }}
      title={`${label}${evt._display.sub ? ' — ' + evt._display.sub : ''}`}
      className={`w-full text-left truncate text-[10px] px-1 py-0.5 rounded mb-0.5 ${colorClass} hover:opacity-80 transition-opacity`}
    >
      <span className="mr-0.5">{icon}</span>
      <span className="font-medium truncate">{label}</span>
    </button>
  )
}

// ─── Event detail modal ──────────────────────────────────────────────────────

function EventModal({
  evt,
  onClose,
  onNavigate,
}: {
  evt: CalEvent
  onClose: () => void
  onNavigate: (path: string) => void
}) {
  const { icon, label, sub } = evt._display
  const [smsSending, setSmsSending] = useState(false)
  const [smsStatus,  setSmsStatus]  = useState<'sent' | 'error' | null>(null)

  const handleSendSms = async () => {
    if (!evt.name) return
    setSmsSending(true)
    setSmsStatus(null)
    try {
      if (evt._type === 'delivery')     await smsApi.resendDelivery(evt.name)
      else if (evt._type === 'appointment') await smsApi.resendConsultation(evt.name)
      setSmsStatus('sent')
    } catch {
      setSmsStatus('error')
    } finally {
      setSmsSending(false)
    }
  }

  const navPath =
    evt._type === 'appointment' ? `/operations/appointments/${encodeURIComponent(evt.name)}`
    : evt._type === 'delivery'  ? `/warehouse/delivery-notes/${encodeURIComponent(evt.name)}`
    : evt._type === 'leave'     ? `/operations/leave/${encodeURIComponent(evt.name)}`
    : null

  const rows: [string, string | number | null | undefined][] = []
  if (evt._type === 'appointment') {
    rows.push(['Type', evt.appointment_type])
    rows.push(['Status', evt.status])
    rows.push(['Date', evt.appointment_date])
    if (evt.start_time) rows.push(['Time', `${evt.start_time}${evt.end_time ? ' – ' + evt.end_time : ''}`])
    rows.push(['Location', evt.location])
    if (evt.salesperson) rows.push(['Salesperson', evt.salesperson])
    if (evt.notes) rows.push(['Notes', evt.notes])
  } else if (evt._type === 'delivery') {
    rows.push(['Status', evt.status])
    rows.push(['Delivery Date', evt.cm_delivery_date])
    if (evt.cm_delivery_time_slot) rows.push(['Slot', evt.cm_delivery_time_slot])
    if (evt.cm_delivery_team) rows.push(['Team', evt.cm_delivery_team])
  } else if (evt._type === 'leave') {
    rows.push(['Employee', evt.employee_name || evt.employee])
    rows.push(['Leave Type', evt.leave_type])
    rows.push(['From', evt.from_date])
    rows.push(['To', evt.to_date])
    rows.push(['Days', evt.total_leave_days])
    rows.push(['Status', evt.status])
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-80 max-w-full p-5 relative" onClick={(e) => e.stopPropagation()}>
        <button className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 text-lg leading-none" onClick={onClose}>×</button>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl">{icon}</span>
          <div>
            <div className="font-semibold text-gray-900 text-sm">{label}</div>
            {sub && <div className="text-[11px] text-gray-500">{sub}</div>}
          </div>
        </div>
        <dl className="space-y-1.5">
          {rows.map(([k, v]) => v != null && (
            <div key={k} className="flex gap-2 text-[12px]">
              <dt className="w-24 text-gray-500 shrink-0">{k}</dt>
              <dd className="text-gray-900 min-w-0 break-words">{String(v)}</dd>
            </div>
          ))}
        </dl>
        {(evt._type === 'delivery' || evt._type === 'appointment') && (
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={handleSendSms}
              disabled={smsSending}
              className="text-xs px-2.5 py-1 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {smsSending ? 'Sending…' : '📱 Send SMS'}
            </button>
            {smsStatus === 'sent'  && <span className="text-[11px] text-green-700 font-medium">✓ Sent</span>}
            {smsStatus === 'error' && <span className="text-[11px] text-red-600 font-medium">✗ Failed</span>}
          </div>
        )}
        {navPath && (
          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
            <span className="text-[10px] text-gray-400 font-mono">{evt.name}</span>
            <button onClick={() => onNavigate(navPath)} className="text-xs text-green-700 font-medium hover:underline">Open →</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Schedule Delivery modal ─────────────────────────────────────────────────

const TIME_SLOTS = ['Morning (08:00-12:00)', 'Afternoon (12:00-16:00)', 'Evening (16:00-19:00)', 'All Day']

function ScheduleDeliveryModal({
  initialDate,
  onClose,
  onSaved,
}: {
  initialDate: string
  onClose: () => void
  onSaved: () => void
}) {
  const [dnSearch,     setDnSearch]     = useState('')
  const [dnResults,    setDnResults]    = useState<DeliveryNoteRow[]>([])
  const [selectedDn,   setSelectedDn]   = useState<DeliveryNoteRow | null>(null)
  const [date,         setDate]         = useState(initialDate)
  const [slot,         setSlot]         = useState('')
  const [team,         setTeam]         = useState('')
  const [instructions, setInstructions] = useState('')
  const [employees,    setEmployees]    = useState<EmployeeRow[]>([])
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    deliverySchedulingApi.getEmployees()
      .then((r) => setEmployees(Array.isArray(r) ? (r as EmployeeRow[]) : []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (dnSearch.length < 1) { setDnResults([]); return }
    const t = setTimeout(() => {
      deliverySchedulingApi.searchUnscheduled(dnSearch)
        .then((r) => setDnResults(Array.isArray(r) ? (r as DeliveryNoteRow[]) : []))
        .catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [dnSearch])

  async function handleSave() {
    if (!selectedDn) { setError('Select a Delivery Note first.'); return }
    if (!date)       { setError('Choose a delivery date.'); return }
    setSaving(true)
    setError(null)
    try {
      await deliverySchedulingApi.schedule({ dn_name: selectedDn.name, delivery_date: date, time_slot: slot, team, instructions })
      onSaved()
    } catch (e: unknown) {
      setError((e as Error).message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-96 max-w-full mx-4 p-5 relative" onClick={(e) => e.stopPropagation()}>
        <button className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 text-lg leading-none" onClick={onClose}>×</button>
        <h2 className="font-semibold text-gray-900 text-sm mb-4">🚚 Schedule Delivery</h2>

        <div className="mb-3 relative">
          <label className="block text-[11px] text-gray-500 mb-1">Delivery Note *</label>
          {selectedDn ? (
            <div className="flex items-center justify-between px-3 py-2 border border-green-400 rounded-lg bg-green-50">
              <div>
                <span className="text-sm font-medium text-gray-900">{selectedDn.name}</span>
                <span className="ml-2 text-[11px] text-gray-500">{selectedDn.customer_name}</span>
              </div>
              <button className="text-gray-400 hover:text-gray-700 text-xs ml-2 shrink-0" onClick={() => { setSelectedDn(null); setDnSearch(''); setTimeout(() => searchRef.current?.focus(), 50) }}>✕</button>
            </div>
          ) : (
            <>
              <input
                ref={searchRef}
                type="text"
                value={dnSearch}
                onChange={(e) => setDnSearch(e.target.value)}
                placeholder="Search DN number or customer…"
                autoFocus
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
              />
              {dnResults.length > 0 && (
                <ul className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                  {dnResults.map((dn) => (
                    <li key={dn.name}>
                      <button className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex justify-between" onClick={() => { setSelectedDn(dn); setDnSearch(''); setDnResults([]) }}>
                        <span className="font-medium">{dn.name}</span>
                        <span className="text-gray-500 text-[11px] truncate ml-2">{dn.customer_name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <div className="mb-3">
          <label className="block text-[11px] text-gray-500 mb-1">Delivery Date *</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-green-500" />
        </div>
        <div className="mb-3">
          <label className="block text-[11px] text-gray-500 mb-1">Time Slot</label>
          <select value={slot} onChange={(e) => setSlot(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-500">
            <option value="">— Select slot —</option>
            {TIME_SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="mb-3">
          <label className="block text-[11px] text-gray-500 mb-1">Delivery Team</label>
          <select value={team} onChange={(e) => setTeam(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-500">
            <option value="">— Select team member —</option>
            {employees.map((emp) => <option key={emp.name} value={emp.name}>{emp.employee_name || emp.name}</option>)}
          </select>
        </div>
        <div className="mb-4">
          <label className="block text-[11px] text-gray-500 mb-1">Instructions</label>
          <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={2} placeholder="Optional notes for the delivery team…" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-green-500 resize-none" />
        </div>

        {error && <div className="text-xs text-red-600 mb-3">{error}</div>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-1.5 text-xs rounded bg-green-700 text-white hover:bg-green-800 disabled:opacity-50 transition-colors font-medium">
            {saving ? 'Saving…' : 'Schedule Delivery'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Month grid ──────────────────────────────────────────────────────────────

function MonthGrid({
  year, month, events, onDayClick, onEventClick, onScheduleClick,
}: {
  year: number; month: number; events: CalEvent[]
  onDayClick: (d: Date) => void
  onEventClick: (e: CalEvent) => void
  onScheduleClick: (d: Date) => void
}) {
  const firstDay = new Date(year, month, 1).getDay()
  const totalDays = daysInMonth(year, month)
  const today = new Date()

  const cells: (Date | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= totalDays; d++) cells.push(new Date(year, month, d))

  function eventsForDay(date: Date) {
    const iso = toISO(date)
    return events.filter((e) => {
      if (e._type === 'appointment') return e.appointment_date === iso
      if (e._type === 'delivery')    return e.cm_delivery_date === iso
      if (e._type === 'leave')       return e.from_date && e.to_date && isDateInRange(date, e.from_date, e.to_date)
      return false
    })
  }

  return (
    <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden border border-gray-200">
      {DAYS_SHORT.map((d) => (
        <div key={d} className="bg-gray-50 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wide py-2">{d}</div>
      ))}
      {cells.map((date, idx) => {
        if (!date) return <div key={`blank-${idx}`} className="bg-white min-h-[90px]" />
        const dayEvts = eventsForDay(date)
        const isToday = sameDay(date, today)
        return (
          <div
            key={date.getDate()}
            className={`bg-white min-h-[90px] p-1 group hover:bg-gray-50 transition-colors ${isToday ? 'ring-2 ring-inset ring-green-600' : ''}`}
            onClick={() => onDayClick(date)}
          >
            <div className="flex items-start justify-between mb-1">
              <div className={`text-[11px] font-semibold w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-green-700 text-white' : 'text-gray-700'}`}>
                {date.getDate()}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onScheduleClick(date) }}
                title="Schedule delivery"
                className="invisible group-hover:visible text-gray-300 hover:text-sky-500 text-[16px] leading-none w-5 h-5 flex items-center justify-center"
              >+</button>
            </div>
            {dayEvts.slice(0, 3).map((e) => <EventChip key={e.name + e._type} evt={e} onClick={onEventClick} />)}
            {dayEvts.length > 3 && <div className="text-[9px] text-gray-400 px-1">+{dayEvts.length - 3} more</div>}
          </div>
        )
      })}
    </div>
  )
}

// ─── Week grid ───────────────────────────────────────────────────────────────

function WeekGrid({ weekStart, events, onEventClick }: { weekStart: Date; events: CalEvent[]; onEventClick: (e: CalEvent) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const today = new Date()

  function eventsForDay(date: Date) {
    const iso = toISO(date)
    return events.filter((e) => {
      if (e._type === 'appointment') return e.appointment_date === iso
      if (e._type === 'delivery')    return e.cm_delivery_date === iso
      if (e._type === 'leave')       return e.from_date && e.to_date && isDateInRange(date, e.from_date, e.to_date)
      return false
    })
  }

  return (
    <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden border border-gray-200">
      {days.map((date) => {
        const isToday = sameDay(date, today)
        return (
          <div key={toISO(date)} className="bg-gray-50 text-center py-2">
            <div className="text-[10px] text-gray-500 uppercase">{DAYS_SHORT[date.getDay()]}</div>
            <div className={`mx-auto mt-0.5 w-7 h-7 flex items-center justify-center rounded-full text-[12px] font-bold ${isToday ? 'bg-green-700 text-white' : 'text-gray-700'}`}>
              {date.getDate()}
            </div>
          </div>
        )
      })}
      {days.map((date) => {
        const dayEvts = eventsForDay(date)
        return (
          <div key={toISO(date) + '-evts'} className="bg-white min-h-[160px] p-1">
            {dayEvts.map((e) => <EventChip key={e.name + e._type} evt={e} onClick={onEventClick} />)}
            {dayEvts.length === 0 && <div className="text-[10px] text-gray-300 pt-2 text-center">—</div>}
          </div>
        )
      })}
    </div>
  )
}

// ─── Day list ─────────────────────────────────────────────────────────────────

function DayList({ date, events, onEventClick, onScheduleClick }: {
  date: Date; events: CalEvent[]
  onEventClick: (e: CalEvent) => void
  onScheduleClick: (d: Date) => void
}) {
  const iso = toISO(date)
  const dayEvts = events.filter((e) => {
    if (e._type === 'appointment') return e.appointment_date === iso
    if (e._type === 'delivery')    return e.cm_delivery_date === iso
    if (e._type === 'leave')       return e.from_date && e.to_date && isDateInRange(date, e.from_date, e.to_date)
    return false
  })

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <span className="font-semibold text-gray-700 text-sm">
          {date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </span>
        <button onClick={() => onScheduleClick(date)} className="text-xs text-sky-600 font-medium hover:underline flex items-center gap-1">
          <span>🚚</span> Schedule delivery
        </button>
      </div>
      {dayEvts.length === 0 ? (
        <div className="px-4 py-8 text-center text-gray-400 text-sm">No events this day.</div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {dayEvts.map((e) => (
            <li key={e.name + e._type}>
              <button className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-start gap-3" onClick={() => onEventClick(e)}>
                <span className="text-lg">{e._display.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900">{e._display.label}</div>
                  {e._display.sub && <div className="text-[11px] text-gray-500">{e._display.sub}</div>}
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${e._display.colorClass}`}>{e._type}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Legend ──────────────────────────────────────────────────────────────────

function Legend() {
  const statusItems = [
    { color: 'bg-green-400',  label: 'Completed' },
    { color: 'bg-gray-300',   label: 'Cancelled' },
    { color: 'bg-purple-400', label: 'Site Measurement' },
    { color: 'bg-sky-400',    label: 'Delivery Scheduled' },
    { color: 'bg-orange-400', label: 'Delivery Overdue' },
    { color: 'bg-yellow-400', label: 'Annual Leave' },
    { color: 'bg-red-400',    label: 'Sick Leave' },
  ]
  const salesTeam = Object.entries(SALESPERSON_COLORS).map(([name, c]) => ({
    dot: c.dot,
    label: name.charAt(0).toUpperCase() + name.slice(1),
  }))

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-600">
        {statusItems.map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1">
            <span className={`inline-block w-2.5 h-2.5 rounded-sm ${color}`} />
            {label}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-600">
        <span className="text-gray-400 font-medium">Sales team:</span>
        {salesTeam.map(({ dot, label }) => (
          <span key={label} className="flex items-center gap-1">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${dot}`} />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Filter toggles ──────────────────────────────────────────────────────────

interface CalFilters { appointments: boolean; deliveries: boolean; leave: boolean }

function FilterBar({ filters, onChange }: { filters: CalFilters; onChange: (f: CalFilters) => void }) {
  const options: { key: keyof CalFilters; icon: string; label: string }[] = [
    { key: 'appointments', icon: '📅', label: 'Appointments' },
    { key: 'deliveries',   icon: '🚚', label: 'Deliveries' },
    { key: 'leave',        icon: '🏖️',  label: 'Leave' },
  ]
  return (
    <div className="flex gap-2">
      {options.map(({ key, icon, label }) => (
        <button
          key={key}
          onClick={() => onChange({ ...filters, [key]: !filters[key] })}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium border transition-colors ${
            filters[key]
              ? 'bg-green-700 text-white border-green-700'
              : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
          }`}
        >
          <span>{icon}</span>
          {label}
        </button>
      ))}
    </div>
  )
}

// ─── Main screen ─────────────────────────────────────────────────────────────

type CalView = 'month' | 'week' | 'day'

export function OperationsCalendar() {
  const navigate = useNavigate()
  const now = new Date()

  const [view,      setView]      = useState<CalView>('month')
  const [year,      setYear]      = useState(now.getFullYear())
  const [month,     setMonth]     = useState(now.getMonth())
  const [weekStart, setWeekStart] = useState<Date>(() => {
    const d = new Date(now)
    d.setDate(d.getDate() - d.getDay())
    return d
  })
  const [dayDate, setDayDate]     = useState<Date>(now)

  const [rawEvents,     setRawEvents]     = useState<CalEvent[]>([])
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [selected,      setSelected]      = useState<CalEvent | null>(null)
  const [filters,       setFilters]       = useState<CalFilters>({ appointments: true, deliveries: true, leave: true })
  const [reloadKey,     setReloadKey]     = useState(0)
  const [scheduleModal, setScheduleModal] = useState<{ date: string } | null>(null)

  const getRange = useCallback(() => {
    if (view === 'month') return { start: toISO(new Date(year, month, 1)), end: toISO(new Date(year, month + 1, 0)) }
    if (view === 'week')  return { start: toISO(weekStart), end: toISO(addDays(weekStart, 6)) }
    return { start: toISO(dayDate), end: toISO(dayDate) }
  }, [view, year, month, weekStart, dayDate])

  useEffect(() => {
    let alive = true
    const { start, end } = getRange()

    function mapApt(d: unknown): CalEvent[] {
      const rows = (Array.isArray(d) ? d : []) as Record<string, unknown>[]
      return rows.map((e) => ({
        ...(e as Partial<CalEvent>),
        _type: 'appointment' as const,
        name: String(e.name ?? ''),
        _display: {
          icon: '📅',
          label: String(e.customer_name ?? e.name ?? ''),
          sub: [e.appointment_type, e.salesperson ? String(e.salesperson).split('@')[0] : null].filter(Boolean).join(' · ') || null,
          colorClass: appointmentColor(e as CalEvent),
        },
      }))
    }
    function mapDelivery(d: unknown): CalEvent[] {
      const rows = (Array.isArray(d) ? d : []) as Record<string, unknown>[]
      return rows.map((e) => ({
        ...(e as Partial<CalEvent>),
        _type: 'delivery' as const,
        name: String(e.name ?? ''),
        _display: {
          icon: '🚚',
          label: String(e.customer_name ?? e.name ?? ''),
          sub: String(e.cm_delivery_time_slot ?? '') || null,
          colorClass: deliveryColor(e as CalEvent),
        },
      }))
    }
    function mapLeave(d: unknown): CalEvent[] {
      const rows = (Array.isArray(d) ? d : []) as Record<string, unknown>[]
      return rows.map((e) => ({
        ...(e as Partial<CalEvent>),
        _type: 'leave' as const,
        name: String(e.name ?? ''),
        _display: {
          icon: '🏖️',
          label: String(e.employee_name ?? e.employee ?? ''),
          sub: String(e.leave_type ?? '') || null,
          colorClass: leaveColor(e as CalEvent),
        },
      }))
    }

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const aptP:   Promise<CalEvent[]> = filters.appointments ? getAppointmentEvents(start, end).then(mapApt) : Promise.resolve([])
        const delP:   Promise<CalEvent[]> = filters.deliveries   ? getDeliveryEvents(start, end).then(mapDelivery) : Promise.resolve([])
        const leaveP: Promise<CalEvent[]> = filters.leave        ? getLeaveEvents(start, end).then(mapLeave) : Promise.resolve([])

        const [apts, delivs, leaves] = await Promise.all([aptP, delP, leaveP])
        if (!alive) return
        setRawEvents([...apts, ...delivs, ...leaves])
      } catch (err: unknown) {
        if (alive) setError((err as Error).message || 'Failed to load events')
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [view, year, month, weekStart, dayDate, filters, getRange, reloadKey])

  function prev() {
    if (view === 'month') { if (month === 0) { setYear((y) => y - 1); setMonth(11) } else setMonth((m) => m - 1) }
    else if (view === 'week') setWeekStart((d) => addDays(d, -7))
    else setDayDate((d) => addDays(d, -1))
  }
  function next() {
    if (view === 'month') { if (month === 11) { setYear((y) => y + 1); setMonth(0) } else setMonth((m) => m + 1) }
    else if (view === 'week') setWeekStart((d) => addDays(d, 7))
    else setDayDate((d) => addDays(d, 1))
  }
  function goToday() {
    const t = new Date()
    setYear(t.getFullYear())
    setMonth(t.getMonth())
    setWeekStart(() => { const d = new Date(t); d.setDate(d.getDate() - d.getDay()); return d })
    setDayDate(t)
  }

  function calTitle() {
    if (view === 'month') return `${MONTHS[month]} ${year}`
    if (view === 'week') {
      const end = addDays(weekStart, 6)
      return `${weekStart.getDate()} ${MONTHS[weekStart.getMonth()]} – ${end.getDate()} ${MONTHS[end.getMonth()]} ${end.getFullYear()}`
    }
    return dayDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-900">Operations Calendar</h1>
        <div className="flex gap-2">
          <button className="text-[12px] px-3 py-1.5 rounded border border-sky-400 text-sky-700 bg-sky-50 hover:bg-sky-100 transition-colors" onClick={() => setScheduleModal({ date: '' })}>
            🚚 Schedule Delivery
          </button>
          <button className="text-[12px] px-3 py-1.5 rounded bg-green-700 text-white hover:bg-green-800 transition-colors" onClick={() => navigate('/operations/appointments/new')}>
            + New Appointment
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-lg overflow-hidden border border-gray-200 text-[11px]">
          {(['month', 'week', 'day'] as CalView[]).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 capitalize font-medium transition-colors ${view === v ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{v}</button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={prev} className="px-2 py-1 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors text-sm">‹</button>
          <button onClick={goToday} className="px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-100 rounded transition-colors border border-gray-200">Today</button>
          <button onClick={next} className="px-2 py-1 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors text-sm">›</button>
        </div>
        <span className="font-semibold text-gray-800 text-sm">{calTitle()}</span>
        {loading && <span className="text-[11px] text-gray-400 animate-pulse ml-auto">Loading…</span>}
      </div>

      <FilterBar filters={filters} onChange={setFilters} />

      {error && <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{error}</div>}

      {view === 'month' && (
        <MonthGrid year={year} month={month} events={rawEvents}
          onDayClick={(d) => { setDayDate(d); setView('day') }}
          onEventClick={setSelected}
          onScheduleClick={(d) => setScheduleModal({ date: toISO(d) })}
        />
      )}
      {view === 'week' && (
        <WeekGrid weekStart={weekStart} events={rawEvents} onEventClick={setSelected} />
      )}
      {view === 'day' && (
        <DayList date={dayDate} events={rawEvents} onEventClick={setSelected}
          onScheduleClick={(d) => setScheduleModal({ date: toISO(d) })}
        />
      )}

      <Legend />

      {selected && (
        <EventModal evt={selected} onClose={() => setSelected(null)}
          onNavigate={(path) => { navigate(path); setSelected(null) }}
        />
      )}

      {scheduleModal !== null && (
        <ScheduleDeliveryModal
          initialDate={scheduleModal.date}
          onClose={() => setScheduleModal(null)}
          onSaved={() => { setScheduleModal(null); setReloadKey((k) => k + 1) }}
        />
      )}
    </div>
  )
}
