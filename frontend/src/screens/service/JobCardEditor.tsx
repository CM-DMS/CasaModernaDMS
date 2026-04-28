/**
 * JobCardEditor — create or edit a CM Job Card.
 *
 * Routes:
 *   /service/job-cards/new        → create
 *   /service/job-cards/:id/edit   → edit
 */
import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import {
  PageHeader, DetailSection, Btn, inputCls, ErrorBox,
} from '../../components/shared/ui'
import { CM } from '../../components/ui/CMClassNames'

interface JobCardDoc {
  name?: string
  doctype?: string
  customer: string
  customer_name?: string
  job_type: string
  description: string
  assigned_to: string
  scheduled_date: string
  status: string
}

interface CustomerOption {
  name: string
  customer_name?: string
}

const STATUS_OPTIONS = ['Open', 'In Progress', 'Completed', 'Cancelled']

const today = () => new Date().toISOString().slice(0, 10)

const blankDoc = (): JobCardDoc => ({
  doctype: 'CM Job Card',
  customer: '',
  customer_name: '',
  job_type: '',
  description: '',
  assigned_to: '',
  scheduled_date: today(),
  status: 'Open',
})

export function JobCardEditor() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()

  const isNew    = !id
  const stateDoc = (location.state as { doc?: JobCardDoc })?.doc ?? null

  const [doc, setDoc]         = useState<JobCardDoc>(() => stateDoc ? { ...stateDoc } : blankDoc())
  const [loading, setLoading] = useState(!isNew && !stateDoc)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [customerQ, setCustomerQ]     = useState('')
  const [customerOpts, setCustomerOpts] = useState<CustomerOption[]>([])
  const [searchingCust, setSearchingCust] = useState(false)

  useEffect(() => {
    if (!isNew && !stateDoc) {
      setLoading(true)
      frappe.getDoc<JobCardDoc>('CM Job Card', id!)
        .then((d) => { if (d) setDoc(d) })
        .catch((e: Error) => setError(e.message || 'Failed to load'))
        .finally(() => setLoading(false))
    }
  }, [id, isNew, stateDoc])

  const patch = useCallback((delta: Partial<JobCardDoc>) => setDoc((d) => ({ ...d, ...delta })), [])

  const searchCustomers = async (q: string) => {
    if (!q.trim()) { setCustomerOpts([]); return }
    setSearchingCust(true)
    try {
      const data = await frappe.call<CustomerOption[]>('frappe.client.get_list', {
        doctype: 'Customer',
        fields: ['name', 'customer_name'],
        or_filters: [
          ['customer_name', 'like', `%${q}%`],
          ['name', 'like', `%${q}%`],
        ],
        limit_page_length: 15,
      })
      setCustomerOpts(Array.isArray(data) ? data : [])
    } catch { /* silent */ }
    setSearchingCust(false)
  }

  const handleSave = async () => {
    if (!doc.customer) { setError('Customer is required.'); return }
    setSaving(true)
    setError('')
    try {
      const saved = await frappe.saveDoc<JobCardDoc>('CM Job Card', doc)
      if (isNew) {
        navigate(`/service/job-cards/${encodeURIComponent(saved.name!)}/edit`, {
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

  if (loading) return <div className="p-8 text-sm text-gray-400 animate-pulse">Loading…</div>

  return (
    <div className="space-y-4">
      <PageHeader
        title={isNew ? 'New Job Card' : (doc.name ?? id ?? '')}
        subtitle={doc.customer_name || doc.customer || ''}
        actions={
          <div className="flex gap-2">
            <Btn onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
            <Btn
              variant="ghost"
              onClick={() =>
                isNew
                  ? navigate('/service/job-cards')
                  : navigate(`/service/job-cards/${encodeURIComponent(id!)}`)
              }
            >
              Cancel
            </Btn>
          </div>
        }
      />

      {error && <ErrorBox message={error} />}

      <DetailSection title="Job Card Details">
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          {/* Customer search */}
          <div className="sm:col-span-2">
            <label className={CM.label}>Customer <span className="text-red-500">*</span></label>
            <div className="flex gap-2">
              <input
                type="text"
                className={inputCls}
                value={customerQ || doc.customer_name || doc.customer}
                onChange={(e) => {
                  setCustomerQ(e.target.value)
                  if (e.target.value.length >= 2) searchCustomers(e.target.value)
                  else setCustomerOpts([])
                }}
                placeholder="Search customer…"
              />
              {searchingCust && <span className="text-xs text-gray-400 self-center">searching…</span>}
            </div>
            {customerOpts.length > 0 && (
              <ul className="mt-1 border border-gray-200 rounded-md bg-white shadow-md max-h-48 overflow-y-auto text-sm z-10">
                {customerOpts.map((c) => (
                  <li
                    key={c.name}
                    className="px-3 py-1.5 hover:bg-cm-green/10 cursor-pointer"
                    onClick={() => {
                      patch({ customer: c.name, customer_name: c.customer_name || c.name })
                      setCustomerQ(c.customer_name || c.name)
                      setCustomerOpts([])
                    }}
                  >
                    {c.customer_name} <span className="text-gray-400 text-xs">({c.name})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label className={CM.label}>Job Type</label>
            <input
              type="text"
              className={inputCls}
              value={doc.job_type}
              onChange={(e) => patch({ job_type: e.target.value })}
              placeholder="e.g. Installation, Repair…"
            />
          </div>

          <div>
            <label className={CM.label}>Assigned To</label>
            <input
              type="text"
              className={inputCls}
              value={doc.assigned_to}
              onChange={(e) => patch({ assigned_to: e.target.value })}
              placeholder="Technician name…"
            />
          </div>

          <div>
            <label className={CM.label}>Scheduled Date</label>
            <input
              type="date"
              className={inputCls}
              value={doc.scheduled_date}
              onChange={(e) => patch({ scheduled_date: e.target.value })}
            />
          </div>

          <div>
            <label className={CM.label}>Status</label>
            <select className={CM.select} value={doc.status} onChange={(e) => patch({ status: e.target.value })}>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-4">
          <label className={CM.label}>Description</label>
          <textarea
            className={CM.textarea + ' min-h-[100px]'}
            value={doc.description || ''}
            onChange={(e) => patch({ description: e.target.value })}
            placeholder="Details about the job…"
          />
        </div>
      </DetailSection>
    </div>
  )
}
