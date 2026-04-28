/**
 * JobCardDetail — read-only view of a CM Job Card.
 *
 * Route: /service/job-cards/:id
 */
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import {
  PageHeader, DetailSection, DetailGrid, DetailField, BackLink, Btn,
} from '../../components/shared/ui'
import { fmtDate } from '../../utils/fmt'
import { usePermissions } from '../../auth/PermissionsProvider'

interface JobCardDoc {
  name: string
  customer: string
  customer_name?: string
  job_type?: string
  assigned_to?: string
  scheduled_date?: string
  status: string
  description?: string
  modified?: string
  owner?: string
}

const STATUS_STYLES: Record<string, string> = {
  'Open':        'bg-blue-100 text-blue-800',
  'In Progress': 'bg-amber-100 text-amber-800',
  'Completed':   'bg-green-100 text-green-800',
  'Cancelled':   'bg-red-100 text-red-800',
}

export function JobCardDetail() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { can }  = usePermissions()

  const [doc, setDoc]         = useState<JobCardDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  useEffect(() => {
    setLoading(true)
    frappe.getDoc<JobCardDoc>('CM Job Card', id!)
      .then((d) => setDoc(d ?? null))
      .catch((e: Error) => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="p-8 text-sm text-gray-400 animate-pulse">Loading…</div>
  if (error)   return <div className="p-8 text-sm text-red-600">{error}</div>
  if (!doc)    return null

  const canEdit = can('canService') && ['Open', 'In Progress'].includes(doc.status)

  return (
    <div className="space-y-4">
      <PageHeader
        title={doc.name}
        subtitle={
          <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_STYLES[doc.status] ?? 'bg-gray-100 text-gray-700'}`}>
            {doc.status}
          </span>
        }
        actions={
          <div className="flex gap-2">
            {canEdit && (
              <Btn onClick={() => navigate(`/service/job-cards/${encodeURIComponent(id!)}/edit`, { state: { doc } })}>
                Edit
              </Btn>
            )}
            <BackLink label="Job Cards" onClick={() => navigate('/service/job-cards')} />
          </div>
        }
      />

      <DetailSection title="Header">
        <DetailGrid>
          <DetailField label="Customer" value={doc.customer_name || doc.customer || '—'} />
          <DetailField label="Job Type" value={doc.job_type || '—'} />
          <DetailField label="Assigned To" value={doc.assigned_to || '—'} />
          <DetailField label="Scheduled Date" value={doc.scheduled_date ? fmtDate(doc.scheduled_date) : '—'} />
          <DetailField label="Status" value={doc.status || '—'} />
        </DetailGrid>
      </DetailSection>

      {doc.description && (
        <DetailSection title="Description">
          <p className="whitespace-pre-wrap text-sm text-gray-700">{doc.description}</p>
        </DetailSection>
      )}
    </div>
  )
}
