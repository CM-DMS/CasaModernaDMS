/**
 * AppointmentEditor — create / edit a CM Customer Appointment.
 *
 * Routes:
 *   /operations/appointments/new       → create
 *   /operations/appointments/:id       → view / edit
 *   /operations/appointments/:id/edit  → edit
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import { appointmentsApi, smsApi, type AppointmentDoc, type UserRow, type AppointmentNotificationResult } from '../../api/operations'
import {
  PageHeader, DetailSection, Btn, inputCls, ErrorBox,
} from '../../components/shared/ui'
import { CM } from '../../components/ui/CMClassNames'

const today = () => new Date().toISOString().slice(0, 10)

const TYPE_OPTIONS = [
  'Kitchen Consultation',
  'Tiles Consultation',
  'Furniture Consultation',
  'Site Measurement',
  'After Sales Service',
]
const STATUS_OPTIONS  = ['Scheduled', 'Completed', 'Cancelled']
const LOCATION_OPTIONS = ['Showroom', 'Customer Site', 'Online']

const blank = (): AppointmentDoc => ({
  customer: '',
  customer_name: '',
  appointment_type: 'Kitchen Consultation',
  status: 'Scheduled',
  appointment_date: today(),
  start_time: '09:00:00',
  end_time: '10:00:00',
  location: 'Showroom',
  salesperson: '',
  notes: '',
})

interface CustomerResult { name: string; customer_name?: string }

export function AppointmentEditor() {
  const { id }    = useParams<{ id: string }>()
  const navigate  = useNavigate()
  const isNew     = !id || id === 'new'

  const [doc,          setDoc]          = useState<AppointmentDoc>(blank())
  const [loading,      setLoading]      = useState(!isNew)
  const [saving,       setSaving]       = useState(false)
  const [deleting,     setDeleting]     = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [users,        setUsers]        = useState<UserRow[]>([])
  const [showDelegate,  setShowDelegate]  = useState(false)
  const [delegateTo,    setDelegateTo]    = useState('')
  const [notifSending,  setNotifSending]  = useState(false)
  const [notifResult,   setNotifResult]   = useState<AppointmentNotificationResult | null>(null)

  // Customer typeahead
  const [custSearch,   setCustSearch]   = useState('')
  const [custResults,  setCustResults]  = useState<CustomerResult[]>([])
  const custSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isNew) {
      setLoading(true)
      appointmentsApi.get(id!)
        .then((d) => { if (d) setDoc(d as AppointmentDoc) })
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false))
    }
    appointmentsApi.getUsers()
      .then((u) => setUsers(Array.isArray(u) ? (u as UserRow[]) : []))
      .catch(() => {})
  }, [id, isNew])

  // Customer search debounce
  useEffect(() => {
    if (custSearch.length < 2) { setCustResults([]); return }
    if (custSearchRef.current) clearTimeout(custSearchRef.current)
    custSearchRef.current = setTimeout(async () => {
      try {
        const res = await frappe.call<CustomerResult[]>('frappe.client.get_list', {
          doctype: 'Customer',
          fields: ['name', 'customer_name'],
          or_filters: [['customer_name', 'like', `%${custSearch}%`], ['name', 'like', `%${custSearch}%`]],
          limit_page_length: 15,
        })
        setCustResults(Array.isArray(res) ? res : [])
      } catch { /* ignore */ }
    }, 300)
  }, [custSearch])

  const patch = useCallback((delta: Partial<AppointmentDoc>) => setDoc((d) => ({ ...d, ...delta })), [])

  async function handleSave() {
    if (!doc.customer)         { setError('Customer is required.'); return }
    if (!doc.appointment_date) { setError('Appointment date is required.'); return }
    setSaving(true)
    setError(null)
    try {
      const saved = await appointmentsApi.save(doc)
      if (isNew && saved?.name) {
        navigate(`/operations/appointments/${encodeURIComponent(saved.name)}/edit`, { replace: true })
      } else if (saved) {
        setDoc(saved as AppointmentDoc)
      }
    } catch (e: unknown) {
      setError((e as Error).message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this appointment?')) return
    setDeleting(true)
    try {
      await appointmentsApi.delete(doc.name!)
      navigate('/operations/appointments', { replace: true })
    } catch (e: unknown) {
      setError((e as Error).message || 'Delete failed')
      setDeleting(false)
    }
  }

  async function handleDelegate() {
    if (!delegateTo) return
    setSaving(true)
    try {
      const saved = await appointmentsApi.delegate(doc.name!, delegateTo)
      if (saved) setDoc(saved as AppointmentDoc)
      setShowDelegate(false)
      setDelegateTo('')
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSendNotification() {
    if (!doc.name) return
    setNotifSending(true)
    setNotifResult(null)
    try {
      const res = await smsApi.sendAppointmentNotification(doc.name)
      setNotifResult(res ?? null)
    } catch (e: unknown) {
      setNotifResult({ ok: false, sms_sent: false, sms_error: (e as Error).message, email_sent: false, email_error: '' })
    } finally {
      setNotifSending(false)
    }
  }

  if (loading) return <div className="p-8 text-sm text-gray-400 animate-pulse">Loading…</div>

  return (
    <div className="space-y-4">
      <PageHeader
        title={isNew ? 'New Appointment' : `Appointment — ${doc.customer_name || doc.name}`}
        subtitle={isNew ? undefined : doc.name}
        actions={
          <div className="flex gap-2">
            <Btn variant="ghost" onClick={() => navigate('/operations/appointments')}>← Back</Btn>
            {!isNew && (
              <>
                <Btn variant="ghost" onClick={() => setShowDelegate((v) => !v)}>Delegate</Btn>
                <button className={CM.btn.danger} onClick={handleDelete} disabled={deleting}>
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </>
            )}
            <Btn onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
            {!isNew && (
              <Btn variant="ghost" onClick={handleSendNotification} disabled={notifSending}>
                {notifSending ? 'Sending…' : '📨 Send Notification'}
              </Btn>
            )}
          </div>
        }
      />

      {error && <ErrorBox message={error} />}
      {notifResult && (
        <div className={`rounded border px-4 py-3 text-sm ${
          notifResult.ok ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-200 bg-amber-50 text-amber-800'
        }`}>
          <div className="font-medium mb-1">{notifResult.ok ? '✓ Notification sent' : '⚠ Notification partial or failed'}</div>
          <div className="space-y-0.5 text-xs">
            <div>{notifResult.email_sent ? '✓ Email delivered' : `✗ Email: ${notifResult.email_error || 'not sent'}`}</div>
            <div>{notifResult.sms_sent   ? '✓ SMS delivered'   : `✗ SMS: ${notifResult.sms_error   || 'not sent'}`}</div>
          </div>
        </div>
      )}

      {showDelegate && (
        <DetailSection title="Delegate Appointment">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className={CM.label}>Reassign to</label>
              <select className={CM.select} value={delegateTo} onChange={(e) => setDelegateTo(e.target.value)}>
                <option value="">— select user —</option>
                {users.map((u) => <option key={u.name} value={u.name}>{u.full_name || u.name}</option>)}
              </select>
            </div>
            <Btn onClick={handleDelegate} disabled={!delegateTo || saving}>Confirm Delegation</Btn>
            <Btn variant="ghost" onClick={() => setShowDelegate(false)}>Cancel</Btn>
          </div>
        </DetailSection>
      )}

      <DetailSection title="Appointment Details">
        <div className={CM.grid}>
          {/* Customer with typeahead */}
          <div className="relative">
            <label className={CM.label}>Customer <span className="text-red-500">*</span></label>
            {doc.customer ? (
              <div className="flex items-center gap-2 px-3 py-2 border border-green-400 rounded-lg bg-green-50">
                <span className="text-sm font-medium text-gray-900">{doc.customer_name || doc.customer}</span>
                <button
                  className="ml-auto text-gray-400 hover:text-gray-700 text-xs"
                  onClick={() => { patch({ customer: '', customer_name: '' }); setCustSearch('') }}
                >✕</button>
              </div>
            ) : (
              <>
                <input
                  className={inputCls}
                  value={custSearch}
                  onChange={(e) => setCustSearch(e.target.value)}
                  placeholder="Search customer…"
                  autoFocus
                />
                {custResults.length > 0 && (
                  <ul className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                    {custResults.map((c) => (
                      <li key={c.name}>
                        <button
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                          onClick={() => { patch({ customer: c.name, customer_name: c.customer_name || c.name }); setCustSearch(''); setCustResults([]) }}
                        >
                          <span className="font-medium">{c.customer_name || c.name}</span>
                          <span className="ml-2 text-[11px] text-gray-400 font-mono">{c.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
          <div>
            <label className={CM.label}>Appointment Type</label>
            <select className={CM.select} value={doc.appointment_type ?? ''} onChange={(e) => patch({ appointment_type: e.target.value })}>
              {TYPE_OPTIONS.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={CM.label}>Status</label>
            <select className={CM.select} value={doc.status ?? ''} onChange={(e) => patch({ status: e.target.value })}>
              {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={CM.label}>Assigned To (Salesperson)</label>
            <select className={CM.select} value={doc.salesperson ?? ''} onChange={(e) => patch({ salesperson: e.target.value })}>
              <option value="">— unassigned —</option>
              {users.map((u) => <option key={u.name} value={u.name}>{u.full_name || u.name}</option>)}
            </select>
          </div>
        </div>
      </DetailSection>

      <DetailSection title="Schedule">
        <div className={CM.grid}>
          <div>
            <label className={CM.label}>Appointment Date <span className="text-red-500">*</span></label>
            <input type="date" className={inputCls} value={doc.appointment_date ?? ''} onChange={(e) => patch({ appointment_date: e.target.value })} />
          </div>
          <div>
            <label className={CM.label}>Location</label>
            <select className={CM.select} value={doc.location ?? ''} onChange={(e) => patch({ location: e.target.value })}>
              <option value="">—</option>
              {LOCATION_OPTIONS.map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className={CM.label}>Start Time</label>
            <input type="time" className={inputCls} value={(doc.start_time ?? '').slice(0, 5)} onChange={(e) => patch({ start_time: e.target.value + ':00' })} />
          </div>
          <div>
            <label className={CM.label}>End Time</label>
            <input type="time" className={inputCls} value={(doc.end_time ?? '').slice(0, 5)} onChange={(e) => patch({ end_time: e.target.value + ':00' })} />
          </div>
        </div>
      </DetailSection>

      <DetailSection title="Notes">
        <textarea
          className={CM.textarea}
          rows={4}
          placeholder="Any details about this appointment…"
          value={doc.notes ?? ''}
          onChange={(e) => patch({ notes: e.target.value })}
        />
      </DetailSection>
    </div>
  )
}
