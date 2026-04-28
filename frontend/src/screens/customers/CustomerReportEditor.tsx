/**
 * CustomerReportEditor — create or edit a CM Customer Report.
 *
 * Routes:
 *   /customers/reports/new  → create
 *   /customers/reports/:id  → view / edit
 */
import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import {
  PageHeader, DetailSection, BackLink, ErrorBox, Btn, inputCls,
} from '../../components/shared/ui'
import { CM } from '../../components/ui/CMClassNames'
import { fmtDate } from '../../utils/fmt'

// ── Constants ─────────────────────────────────────────────────────────────────

const INTERACTION_TYPES = ['Phone Call', 'Showroom Visit', 'Email', 'Other']
const CATEGORIES        = ['Complaint', 'Remark', 'Inquiry', 'Feedback', 'Other']
const PRIORITIES        = ['Low', 'Normal', 'High', 'Urgent']
const UPDATE_TYPES      = ['Update', 'Action Taken', 'Escalation']

const STATUS_STYLES: Record<string, string> = {
  'Open':        'bg-blue-100 text-blue-700',
  'In Progress': 'bg-amber-100 text-amber-700',
  'Resolved':    'bg-green-100 text-green-700',
  'Closed':      'bg-gray-100 text-gray-500',
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReportUpdate {
  user?: string
  user_full_name?: string
  update_type: string
  note: string
  timestamp?: string
}

interface CustomerReportDoc {
  name?: string
  customer?: string
  customer_name?: string
  contact_name?: string
  interaction_type?: string
  category?: string
  subject?: string
  description?: string
  status?: string
  priority?: string
  assigned_to?: string
  action_taken?: string
  updates?: ReportUpdate[]
  opened_by?: string
  opened_by_name?: string
  opening_datetime?: string
  closed_by?: string
  closing_datetime?: string
}

interface UserOpt   { name: string; full_name?: string }
interface CustomerOpt { name: string; customer_name?: string }

function blankDoc(user?: UserOpt | null): CustomerReportDoc {
  return {
    customer: '',
    contact_name: '',
    interaction_type: 'Phone Call',
    category: 'Remark',
    subject: '',
    description: '',
    status: 'Open',
    priority: 'Normal',
    assigned_to: user?.name ?? '',
    action_taken: '',
    updates: [],
  }
}

// ── Update Thread ─────────────────────────────────────────────────────────────

function UpdateThread({ updates }: { updates: ReportUpdate[] }) {
  if (!updates.length) {
    return <p className="text-sm text-gray-400 italic">No updates yet.</p>
  }
  return (
    <div className="space-y-3">
      {[...updates].reverse().map((u, i) => (
        <div key={i} className="flex gap-3">
          <div className="mt-1 h-7 w-7 rounded-full bg-cm-green/10 flex items-center justify-center text-xs font-bold text-cm-green shrink-0">
            {(u.user_full_name || u.user || '?').slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-gray-700">{u.user_full_name || u.user}</span>
              <span className={`inline-flex px-1.5 py-0 rounded text-[10px] font-medium ${
                u.update_type === 'Escalation'   ? 'bg-red-100 text-red-600' :
                u.update_type === 'Action Taken' ? 'bg-green-100 text-green-600' :
                'bg-gray-100 text-gray-500'
              }`}>
                {u.update_type}
              </span>
              <span className="text-xs text-gray-400 ml-auto">
                {u.timestamp ? fmtDate(u.timestamp.slice(0, 10)) : ''}
              </span>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{u.note}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Add Update Form ───────────────────────────────────────────────────────────

function AddUpdateForm({ reportName, onAdded }: { reportName: string; onAdded: (doc: CustomerReportDoc) => void }) {
  const [note, setNote] = useState('')
  const [updateType, setType] = useState('Update')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!note.trim()) { setError('Note cannot be empty.'); return }
    setSaving(true)
    setError('')
    try {
      const updated = await frappe.call<CustomerReportDoc>(
        'casamoderna_dms.customer_reports.add_report_update',
        { name: reportName, note: note.trim(), update_type: updateType },
      )
      setNote('')
      setType('Update')
      if (updated) onAdded(updated)
    } catch (e: unknown) {
      setError((e as Error).message || 'Failed to add update')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2 pt-2 border-t border-gray-100">
      <div className="flex gap-2">
        <select value={updateType} onChange={(e) => setType(e.target.value)} className={CM.select + ' w-40 shrink-0'}>
          {UPDATE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <textarea
          value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="Add an update, note or action taken…"
          rows={2} className={CM.textarea + ' flex-1'}
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end">
        <Btn onClick={handleSubmit} disabled={saving || !note.trim()}>{saving ? 'Posting…' : 'Post Update'}</Btn>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function CustomerReportEditor() {
  const { id }    = useParams<{ id: string }>()
  const navigate  = useNavigate()
  const location  = useLocation()

  const isNew    = !id || id === 'new'
  const stateDoc = (location.state as { doc?: CustomerReportDoc })?.doc ?? null

  const [doc, setDoc]       = useState<CustomerReportDoc>(() => stateDoc ? { ...stateDoc } : blankDoc())
  const [loading, setLoading] = useState(!isNew && !stateDoc)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [users, setUsers]   = useState<UserOpt[]>([])
  const [customers, setCustomers] = useState<CustomerOpt[]>([])

  // Load lookup data
  useEffect(() => {
    frappe.callGet<UserOpt[]>('casamoderna_dms.customer_reports.get_users_for_assignment')
      .then((d) => setUsers(Array.isArray(d) ? d : []))
      .catch(() => {})
    frappe.callGet<CustomerOpt[]>('casamoderna_dms.customer_reports.get_customers_for_report')
      .then((d) => setCustomers(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [])

  // Load existing doc
  useEffect(() => {
    if (!isNew && !stateDoc) {
      setLoading(true)
      frappe.callGet<CustomerReportDoc>('casamoderna_dms.customer_reports.get_customer_report', { name: id })
        .then((d) => { if (d) setDoc(d) })
        .catch((e: Error) => {
          setError(e.message || 'Failed to load')
        })
        .finally(() => setLoading(false))
    }
  }, [id, isNew, stateDoc])

  const patch = useCallback((delta: Partial<CustomerReportDoc>) => setDoc((d) => ({ ...d, ...delta })), [])

  const isClosed = doc.status === 'Closed'

  const handleSave = async () => {
    if (!doc.customer)         { setError('Customer is required.'); return }
    if (!doc.interaction_type) { setError('Interaction Type is required.'); return }
    if (!doc.category)         { setError('Category is required.'); return }
    if (!doc.subject)          { setError('Subject is required.'); return }
    if (!doc.assigned_to)      { setError('Assigned To is required.'); return }
    setSaving(true)
    setError('')
    try {
      const saved = await frappe.call<CustomerReportDoc>(
        'casamoderna_dms.customer_reports.save_customer_report',
        { doc: JSON.stringify(doc) },
      )
      if (!saved) return
      if (isNew) {
        navigate(`/customers/reports/${encodeURIComponent(saved.name ?? '')}`, {
          replace: true,
          state: { doc: saved },
        })
      } else {
        setDoc(saved)
      }
    } catch (e: unknown) {
      setError((e as Error).message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === 'Closed' && !doc.action_taken) {
      setError('Please fill in "Action Taken" before closing the report.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const args: Record<string, string> = { name: doc.name!, status: newStatus }
      if (doc.action_taken) args.action_taken = doc.action_taken
      const updated = await frappe.call<CustomerReportDoc>(
        'casamoderna_dms.customer_reports.change_report_status',
        args,
      )
      if (updated) setDoc(updated)
    } catch (e: unknown) {
      setError((e as Error).message || 'Status change failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-sm text-gray-400 animate-pulse">Loading…</div>
  }

  const statusCls = STATUS_STYLES[doc.status ?? ''] ?? 'bg-gray-100 text-gray-500'

  return (
    <div className="space-y-4">
      <PageHeader
        title={isNew ? 'New Customer Report' : `Report — ${doc.name ?? ''}`}
        subtitle={
          !isNew && doc.status ? (
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${statusCls}`}>
              {doc.status}
            </span>
          ) : undefined
        }
        actions={
          <div className="flex gap-2 flex-wrap items-center">
            <BackLink label="Reports" onClick={() => navigate('/customers/reports')} />

            {!isNew && doc.status === 'Open' && (
              <Btn variant="ghost" onClick={() => handleStatusChange('In Progress')} disabled={saving}>Mark In Progress</Btn>
            )}
            {!isNew && doc.status === 'In Progress' && (
              <Btn variant="ghost" onClick={() => handleStatusChange('Resolved')} disabled={saving}>Mark Resolved</Btn>
            )}
            {!isNew && doc.status === 'Resolved' && (
              <Btn onClick={() => handleStatusChange('Closed')} disabled={saving}>Close Report</Btn>
            )}
            {!isNew && doc.status === 'Closed' && (
              <Btn variant="ghost" onClick={() => handleStatusChange('Open')} disabled={saving}>Re-open</Btn>
            )}

            {!isClosed && (
              <Btn onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : isNew ? 'Create Report' : 'Save'}
              </Btn>
            )}
          </div>
        }
      />

      {error && <ErrorBox message={error} />}

      {/* Report Details */}
      <DetailSection title="Report Details">
        <div className={CM.grid}>
          <div>
            <label className={CM.label}>Customer <span className="text-red-500">*</span></label>
            {customers.length > 0 ? (
              <select
                className={CM.select}
                value={doc.customer ?? ''}
                onChange={(e) => patch({ customer: e.target.value })}
                disabled={isClosed}
              >
                <option value="">— Select customer —</option>
                {customers.map((c) => (
                  <option key={c.name} value={c.name}>{c.customer_name || c.name}</option>
                ))}
              </select>
            ) : (
              <input
                type="text" className={inputCls}
                value={doc.customer ?? ''}
                onChange={(e) => patch({ customer: e.target.value })}
                disabled={isClosed} placeholder="Customer name"
              />
            )}
          </div>

          <div>
            <label className={CM.label}>Contact Person</label>
            <input
              type="text" className={inputCls}
              value={doc.contact_name ?? ''}
              onChange={(e) => patch({ contact_name: e.target.value })}
              disabled={isClosed} placeholder="Name of person who called / visited"
            />
          </div>

          <div>
            <label className={CM.label}>Interaction Type <span className="text-red-500">*</span></label>
            <select
              className={CM.select}
              value={doc.interaction_type ?? 'Phone Call'}
              onChange={(e) => patch({ interaction_type: e.target.value })}
              disabled={isClosed}
            >
              {INTERACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <label className={CM.label}>Category <span className="text-red-500">*</span></label>
            <select
              className={CM.select}
              value={doc.category ?? 'Remark'}
              onChange={(e) => patch({ category: e.target.value })}
              disabled={isClosed}
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className={CM.label}>Priority</label>
            <select
              className={CM.select}
              value={doc.priority ?? 'Normal'}
              onChange={(e) => patch({ priority: e.target.value })}
              disabled={isClosed}
            >
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div>
            <label className={CM.label}>Assigned To <span className="text-red-500">*</span></label>
            {users.length > 0 ? (
              <select
                className={CM.select}
                value={doc.assigned_to ?? ''}
                onChange={(e) => patch({ assigned_to: e.target.value })}
                disabled={isClosed}
              >
                <option value="">— Select user —</option>
                {users.map((u) => <option key={u.name} value={u.name}>{u.full_name || u.name}</option>)}
              </select>
            ) : (
              <input
                type="text" className={inputCls}
                value={doc.assigned_to ?? ''}
                onChange={(e) => patch({ assigned_to: e.target.value })}
                disabled={isClosed}
              />
            )}
          </div>
        </div>

        <div className="mt-3">
          <label className={CM.label}>Subject <span className="text-red-500">*</span></label>
          <input
            type="text" className={inputCls}
            value={doc.subject ?? ''}
            onChange={(e) => patch({ subject: e.target.value })}
            disabled={isClosed}
            placeholder="Brief description of the interaction"
          />
        </div>

        <div className="mt-3">
          <label className={CM.label}>Description</label>
          <textarea
            className={CM.textarea} rows={3}
            value={doc.description ?? ''}
            onChange={(e) => patch({ description: e.target.value })}
            disabled={isClosed}
            placeholder="Full details of what was discussed or reported"
          />
        </div>
      </DetailSection>

      {/* Action Taken */}
      <DetailSection title="Action Taken">
        <label className={CM.label}>Action Taken <span className="font-normal text-gray-400">(required before closing)</span></label>
        <textarea
          className={CM.textarea} rows={2}
          value={doc.action_taken ?? ''}
          onChange={(e) => patch({ action_taken: e.target.value })}
          disabled={isClosed}
          placeholder="Describe what action was taken to resolve this"
        />
      </DetailSection>

      {/* Meta */}
      {!isNew && (
        <DetailSection title="Report Info">
          <div className={CM.grid}>
            <div>
              <dt className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-0.5">Opened By</dt>
              <dd className="text-sm">{doc.opened_by_name || doc.opened_by || '—'}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-0.5">Opened At</dt>
              <dd className="text-sm">{doc.opening_datetime ? fmtDate(doc.opening_datetime.slice(0, 10)) : '—'}</dd>
            </div>
            {doc.closed_by && (
              <>
                <div>
                  <dt className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-0.5">Closed By</dt>
                  <dd className="text-sm">{doc.closed_by}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-0.5">Closed At</dt>
                  <dd className="text-sm">{doc.closing_datetime ? fmtDate(doc.closing_datetime.slice(0, 10)) : '—'}</dd>
                </div>
              </>
            )}
          </div>
        </DetailSection>
      )}

      {/* Update thread */}
      {!isNew && (
        <DetailSection title="Updates">
          <UpdateThread updates={doc.updates ?? []} />
          {!isClosed && doc.name && (
            <AddUpdateForm
              reportName={doc.name}
              onAdded={(updated) => setDoc(updated)}
            />
          )}
        </DetailSection>
      )}
    </div>
  )
}
