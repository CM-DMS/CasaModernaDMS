/**
 * ProjectEditor — create or edit a CM Project.
 *
 * Routes:
 *   /projects/new       → create
 *   /projects/:id/edit  → edit
 */
import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import {
  PageHeader, DetailSection, Btn, inputCls, ErrorBox,
} from '../../components/shared/ui'
import { CM } from '../../components/ui/CMClassNames'

interface ProjectDoc {
  name?: string
  project_name: string
  customer: string
  customer_name?: string
  status: string
  project_type: string
  salesperson: string
  start_date: string
  expected_completion: string
  linked_sales_orders: string
  description: string
  notes: string
}

const EMPTY: ProjectDoc = {
  project_name: '',
  customer: '',
  customer_name: '',
  status: 'Planning',
  project_type: '',
  salesperson: '',
  start_date: '',
  expected_completion: '',
  linked_sales_orders: '',
  description: '',
  notes: '',
}

const PROJECT_TYPES = ['Apartment Fit-Out', 'Kitchen', 'Bedroom', 'Living Room', 'Office', 'Other']
const STATUS_OPTIONS = ['Planning', 'In Progress', 'On Hold', 'Completed', 'Cancelled']

export function ProjectEditor() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isNew    = !id || id === 'new'

  const [doc, setDoc]         = useState<ProjectDoc>(EMPTY)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    if (isNew) return
    ;(async () => {
      try {
        const res = await frappe.call<ProjectDoc>('casamoderna_dms.project_api.get_project', { name: id })
        if (res) setDoc(res)
      } catch (e: unknown) {
        setError((e as Error).message || 'Failed to load')
      }
      setLoading(false)
    })()
  }, [id, isNew])

  const set = <K extends keyof ProjectDoc>(field: K, value: ProjectDoc[K]) =>
    setDoc((prev) => ({ ...prev, [field]: value }))

  async function save() {
    if (!doc.project_name || !doc.customer) {
      setError('Project Name and Customer are required.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await frappe.call<ProjectDoc>('casamoderna_dms.project_api.save_project', { doc })
      if (res?.name) navigate(`/projects/${encodeURIComponent(res.name)}`)
    } catch (e: unknown) {
      setError((e as Error).message || 'Save failed')
    }
    setSaving(false)
  }

  if (loading) return <div className="p-8 text-sm text-gray-400 animate-pulse">Loading…</div>

  return (
    <div className="space-y-5">
      <PageHeader
        title={isNew ? 'New Project' : `Edit: ${doc.project_name}`}
        subtitle="Interior design &amp; fit-out project"
        actions={
          <div className="flex gap-2">
            <Btn variant="ghost" onClick={() => navigate(-1 as never)}>Cancel</Btn>
            <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
          </div>
        }
      />

      {error && <ErrorBox message={error} />}

      <DetailSection title="Project Details">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={CM.label}>Project Name <span className="text-red-500">*</span></label>
            <input className={inputCls} value={doc.project_name} onChange={(e) => set('project_name', e.target.value)} />
          </div>
          <div>
            <label className={CM.label}>Customer <span className="text-red-500">*</span></label>
            <input className={inputCls} value={doc.customer} onChange={(e) => set('customer', e.target.value)} placeholder="Customer ID" />
          </div>
          <div>
            <label className={CM.label}>Project Type</label>
            <select className={CM.select} value={doc.project_type} onChange={(e) => set('project_type', e.target.value)}>
              <option value="">— Select type —</option>
              {PROJECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={CM.label}>Status</label>
            <select className={CM.select} value={doc.status} onChange={(e) => set('status', e.target.value)}>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={CM.label}>Salesperson</label>
            <input className={inputCls} value={doc.salesperson} onChange={(e) => set('salesperson', e.target.value)} placeholder="Username" />
          </div>
        </div>
      </DetailSection>

      <DetailSection title="Timeline">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={CM.label}>Start Date</label>
            <input type="date" className={inputCls} value={doc.start_date} onChange={(e) => set('start_date', e.target.value)} />
          </div>
          <div>
            <label className={CM.label}>Expected Completion</label>
            <input type="date" className={inputCls} value={doc.expected_completion} onChange={(e) => set('expected_completion', e.target.value)} />
          </div>
        </div>
      </DetailSection>

      <DetailSection title="Linked Sales Orders">
        <label className={CM.label}>Sales Order IDs (one per line)</label>
        <textarea
          className={`${CM.textarea} h-32 font-mono text-sm`}
          value={doc.linked_sales_orders}
          onChange={(e) => set('linked_sales_orders', e.target.value)}
          placeholder={'SO-00001\nSO-00002\nSO-00003'}
        />
        <p className="text-xs text-gray-400 mt-1">Enter Sales Order names one per line. Total project value will be recalculated on save.</p>
      </DetailSection>

      <DetailSection title="Description">
        <label className={CM.label}>Short Description</label>
        <textarea className={`${CM.textarea} h-20`} value={doc.description} onChange={(e) => set('description', e.target.value)} placeholder="Brief project description…" />
      </DetailSection>

      <DetailSection title="Internal Notes">
        <textarea className={`${CM.textarea} h-24`} value={doc.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Internal notes…" />
      </DetailSection>
    </div>
  )
}
