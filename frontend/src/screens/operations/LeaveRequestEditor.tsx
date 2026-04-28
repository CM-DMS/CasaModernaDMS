/**
 * LeaveRequestEditor — create / edit / review a CM Leave Request.
 *
 * Routes:
 *   /operations/leave/new        → create
 *   /operations/leave/:id        → view
 *   /operations/leave/:id/edit   → edit
 */
import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { leaveRequestsApi, type LeaveRequestDoc } from '../../api/operations'
import { useAuth } from '../../auth/AuthProvider'
import { usePermissions } from '../../auth/PermissionsProvider'
import {
  PageHeader, DetailSection, Btn, inputCls, ErrorBox,
} from '../../components/shared/ui'
import { CM } from '../../components/ui/CMClassNames'

const LEAVE_TYPES = ['Annual Leave', 'Sick Leave', 'Personal Leave', 'Unpaid Leave', 'Other']

const today = () => new Date().toISOString().slice(0, 10)

function calcDays(from?: string, to?: string) {
  if (!from || !to) return 0
  const diff = (new Date(to).getTime() - new Date(from).getTime()) / 86400000
  return diff >= 0 ? Math.round(diff) + 1 : 0
}

interface AuthUser { name?: string; full_name?: string }

const blank = (user?: AuthUser): LeaveRequestDoc => ({
  employee_user:  user?.name ?? '',
  employee_name:  user?.full_name ?? '',
  leave_type:     'Annual Leave',
  from_date:      today(),
  to_date:        today(),
  total_days:     1,
  status:         'Pending',
  reason:         '',
  reviewer_notes: '',
})

export function LeaveRequestEditor() {
  const { id }    = useParams<{ id: string }>()
  const navigate  = useNavigate()
  const { user }  = useAuth()
  const { can }   = usePermissions()

  const isNew      = !id || id === 'new'
  const isReviewer = can('canAdmin')

  const [doc,          setDoc]          = useState<LeaveRequestDoc>(() => blank(user as AuthUser))
  const [loading,      setLoading]      = useState(!isNew)
  const [saving,       setSaving]       = useState(false)
  const [deleting,     setDeleting]     = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [reviewStatus, setReviewStatus] = useState('')
  const [reviewNotes,  setReviewNotes]  = useState('')
  const [reviewing,    setReviewing]    = useState(false)

  useEffect(() => {
    if (!isNew) {
      setLoading(true)
      leaveRequestsApi.get(id!)
        .then((d) => { if (d) setDoc(d as LeaveRequestDoc) })
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false))
    }
  }, [id, isNew])

  const patch = useCallback((delta: Partial<LeaveRequestDoc>) => {
    setDoc((d) => {
      const next = { ...d, ...delta }
      if (delta.from_date !== undefined || delta.to_date !== undefined) {
        next.total_days = calcDays(delta.from_date ?? d.from_date, delta.to_date ?? d.to_date)
      }
      return next
    })
  }, [])

  const canEdit = isNew || doc.status === 'Pending'

  async function handleSave() {
    if (!doc.from_date || !doc.to_date) { setError('Dates are required.'); return }
    if (doc.from_date > doc.to_date)    { setError('To date must be on or after From date.'); return }
    setSaving(true)
    setError(null)
    try {
      const saved = await leaveRequestsApi.save(doc)
      if (isNew && saved?.name) {
        navigate(`/operations/leave/${encodeURIComponent(saved.name)}/edit`, { replace: true })
      } else if (saved) {
        setDoc(saved as LeaveRequestDoc)
      }
    } catch (e: unknown) {
      setError((e as Error).message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this leave request?')) return
    setDeleting(true)
    try {
      await leaveRequestsApi.delete(doc.name!)
      navigate('/operations/leave', { replace: true })
    } catch (e: unknown) {
      setError((e as Error).message)
      setDeleting(false)
    }
  }

  async function handleReview() {
    if (!reviewStatus) { setError('Select Approved or Rejected.'); return }
    setReviewing(true)
    setError(null)
    try {
      const saved = await leaveRequestsApi.review(doc.name!, reviewStatus, reviewNotes)
      if (saved) setDoc(saved as LeaveRequestDoc)
      setReviewStatus('')
      setReviewNotes('')
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setReviewing(false)
    }
  }

  if (loading) return <div className="p-8 text-sm text-gray-400 animate-pulse">Loading…</div>

  const statusColor: Record<string, string> = {
    Pending:   'text-yellow-700',
    Approved:  'text-green-700',
    Rejected:  'text-red-700',
    Cancelled: 'text-gray-500',
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={isNew ? 'New Leave Request' : `Leave — ${doc.employee_name || doc.employee_user}`}
        subtitle={
          !isNew && doc.status ? (
            <span className={`font-semibold ${statusColor[doc.status] ?? ''}`}>{doc.status}</span>
          ) : undefined
        }
        actions={
          <div className="flex gap-2">
            <Btn variant="ghost" onClick={() => navigate('/operations/leave')}>← Back</Btn>
            {canEdit && !isNew && (
              <button className={CM.btn.danger} onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            )}
            {canEdit && (
              <Btn onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Submit Request'}</Btn>
            )}
          </div>
        }
      />

      {error && <ErrorBox message={error} />}

      <DetailSection title="Leave Details">
        <div className={CM.grid}>
          <div>
            <label className={CM.label}>Requested By</label>
            <input className={`${inputCls} bg-gray-50`} value={doc.employee_name || doc.employee_user || ''} readOnly />
          </div>
          <div>
            <label className={CM.label}>Leave Type</label>
            <select className={CM.select} value={doc.leave_type ?? ''} onChange={(e) => patch({ leave_type: e.target.value })} disabled={!canEdit}>
              {LEAVE_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={CM.label}>From Date <span className="text-red-500">*</span></label>
            <input type="date" className={inputCls} value={doc.from_date ?? ''} onChange={(e) => patch({ from_date: e.target.value })} disabled={!canEdit} />
          </div>
          <div>
            <label className={CM.label}>To Date <span className="text-red-500">*</span></label>
            <input type="date" className={inputCls} value={doc.to_date ?? ''} onChange={(e) => patch({ to_date: e.target.value })} disabled={!canEdit} />
          </div>
          <div>
            <label className={CM.label}>Total Days</label>
            <input className={`${inputCls} bg-gray-50`} value={doc.total_days ?? calcDays(doc.from_date, doc.to_date)} readOnly />
          </div>
        </div>
        <div className="mt-3">
          <label className={CM.label}>Reason</label>
          <textarea className={CM.textarea} rows={3} placeholder="Reason for leave…" value={doc.reason ?? ''} onChange={(e) => patch({ reason: e.target.value })} disabled={!canEdit} />
        </div>
      </DetailSection>

      {/* Manager review section */}
      {!isNew && (isReviewer || doc.reviewed_by || doc.reviewer_notes) && (
        <DetailSection title="Manager Review">
          {doc.reviewer_notes && (
            <div className="mb-3 rounded bg-gray-50 px-3 py-2 text-sm text-gray-700 border border-gray-200">
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Reviewer notes</div>
              {doc.reviewer_notes}
            </div>
          )}
          {doc.reviewed_by && (
            <p className="text-xs text-gray-400 mb-3">Reviewed by {doc.reviewed_by}</p>
          )}
          {isReviewer && doc.status === 'Pending' && (
            <div className="space-y-3">
              <div className={CM.grid}>
                <div>
                  <label className={CM.label}>Decision</label>
                  <select className={CM.select} value={reviewStatus} onChange={(e) => setReviewStatus(e.target.value)}>
                    <option value="">— select —</option>
                    <option value="Approved">✅ Approve</option>
                    <option value="Rejected">❌ Reject</option>
                  </select>
                </div>
                <div>
                  <label className={CM.label}>Notes (optional)</label>
                  <input className={inputCls} placeholder="Optional notes for the employee…" value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} />
                </div>
              </div>
              <Btn onClick={handleReview} disabled={reviewing || !reviewStatus}>{reviewing ? 'Saving…' : 'Submit Review'}</Btn>
            </div>
          )}
          {doc.status === 'Pending' && !isReviewer && (
            <p className="text-sm text-gray-400">Pending manager review.</p>
          )}
        </DetailSection>
      )}
    </div>
  )
}
