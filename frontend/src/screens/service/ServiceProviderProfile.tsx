/**
 * ServiceProviderProfile — view and edit a CM Service Provider.
 *
 * Routes:
 *   /service/providers/new   → create
 *   /service/providers/:id   → view / edit in-place
 */
import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import {
  PageHeader, DetailSection, BackLink, Btn, inputCls, ErrorBox,
} from '../../components/shared/ui'
import { CM } from '../../components/ui/CMClassNames'
import { usePermissions } from '../../auth/PermissionsProvider'

interface ProviderDoc {
  name?: string
  doctype?: string
  provider_name: string
  service_type: string
  mobile: string
  email: string
  territory: string
  vat_number: string
  address: string
  notes: string
  active: number
}

const SERVICE_TYPES = ['Installation', 'Repair', 'Maintenance', 'Delivery', 'Other']

const blankDoc = (): ProviderDoc => ({
  doctype: 'CM Service Provider',
  provider_name: '',
  service_type: '',
  mobile: '',
  email: '',
  territory: '',
  vat_number: '',
  address: '',
  notes: '',
  active: 1,
})

function ActiveBadge({ active }: { active?: number | boolean }) {
  return active ? (
    <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-800">Active</span>
  ) : (
    <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-600">Inactive</span>
  )
}

function ReadField({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-0.5">{label}</dt>
      <dd className="text-sm text-gray-800">{value || '—'}</dd>
    </div>
  )
}

export function ServiceProviderProfile() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { can }  = usePermissions()

  const isNew = !id

  const [doc, setDoc]         = useState<ProviderDoc | null>(() => isNew ? blankDoc() : null)
  const [loading, setLoading] = useState(!isNew)
  const [isEditing, setEditing] = useState(isNew)
  const [draft, setDraft]     = useState<ProviderDoc | null>(null)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    if (!isNew) {
      setLoading(true)
      frappe.getDoc<ProviderDoc>('CM Service Provider', id!)
        .then((d) => setDoc(d ?? null))
        .catch((e: Error) => setError(e.message || 'Failed to load'))
        .finally(() => setLoading(false))
    }
  }, [id, isNew])

  const startEdit = () => {
    setDraft({ ...doc! })
    setEditing(true)
    setError('')
  }

  const cancelEdit = () => {
    if (isNew) {
      navigate('/service/providers')
    } else {
      setDraft(null)
      setEditing(false)
      setError('')
    }
  }

  const patch = useCallback((delta: Partial<ProviderDoc>) => setDraft((d) => ({ ...d!, ...delta })), [])

  const handleSave = async () => {
    const toSave = draft!
    if (!toSave.provider_name) { setError('Provider Name is required.'); return }
    setSaving(true)
    setError('')
    try {
      const saved = await frappe.saveDoc<ProviderDoc>('CM Service Provider', toSave)
      setDoc(saved)
      setDraft(null)
      setEditing(false)
      if (isNew) navigate(`/service/providers/${encodeURIComponent(saved.name!)}`, { replace: true })
    } catch (e: unknown) {
      setError((e as Error).message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-8 text-sm text-gray-400 animate-pulse">Loading…</div>
  if (!isNew && !doc && !loading) return <div className="p-8 text-sm text-red-600">{error || 'Not found'}</div>

  const current = isEditing ? (draft ?? blankDoc()) : doc!

  return (
    <div className="space-y-4">
      <PageHeader
        title={isNew ? 'New Service Provider' : (doc?.provider_name || id!)}
        subtitle={!isNew && doc ? doc.service_type || '' : ''}
        actions={
          <div className="flex gap-2">
            {isEditing ? (
              <>
                <Btn onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
                <Btn variant="ghost" onClick={cancelEdit}>Cancel</Btn>
              </>
            ) : (
              <>
                {can('canService') && <Btn onClick={startEdit}>Edit</Btn>}
                <BackLink label="Providers" onClick={() => navigate('/service/providers')} />
              </>
            )}
          </div>
        }
      />

      {error && <ErrorBox message={error} />}

      <DetailSection title="Provider Details">
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          <div>
            <label className={CM.label}>Provider Name {isEditing && <span className="text-red-500">*</span>}</label>
            {isEditing ? (
              <input className={inputCls} value={current.provider_name} onChange={(e) => patch({ provider_name: e.target.value })} placeholder="Full name or company…" />
            ) : (
              <ReadField label="" value={doc?.provider_name} />
            )}
          </div>

          <div>
            <label className={CM.label}>Service Type</label>
            {isEditing ? (
              <select className={CM.select} value={current.service_type} onChange={(e) => patch({ service_type: e.target.value })}>
                <option value="">— Select —</option>
                {SERVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            ) : (
              <ReadField label="" value={doc?.service_type} />
            )}
          </div>

          <div>
            <label className={CM.label}>Mobile</label>
            {isEditing ? (
              <input className={inputCls} value={current.mobile} onChange={(e) => patch({ mobile: e.target.value })} placeholder="+356 …" />
            ) : (
              <ReadField label="" value={doc?.mobile} />
            )}
          </div>

          <div>
            <label className={CM.label}>Email</label>
            {isEditing ? (
              <input type="email" className={inputCls} value={current.email} onChange={(e) => patch({ email: e.target.value })} placeholder="email@example.com" />
            ) : (
              <ReadField label="" value={doc?.email} />
            )}
          </div>

          <div>
            <label className={CM.label}>Territory</label>
            {isEditing ? (
              <input className={inputCls} value={current.territory} onChange={(e) => patch({ territory: e.target.value })} placeholder="Malta, Gozo…" />
            ) : (
              <ReadField label="" value={doc?.territory} />
            )}
          </div>

          <div>
            <label className={CM.label}>VAT Number</label>
            {isEditing ? (
              <input className={inputCls} value={current.vat_number} onChange={(e) => patch({ vat_number: e.target.value })} placeholder="MT…" />
            ) : (
              <ReadField label="" value={doc?.vat_number} />
            )}
          </div>

          <div>
            <label className={CM.label}>Status</label>
            {isEditing ? (
              <label className="flex items-center gap-2 text-sm mt-1">
                <input type="checkbox" checked={!!current.active} onChange={(e) => patch({ active: e.target.checked ? 1 : 0 })} />
                Active
              </label>
            ) : (
              <ActiveBadge active={doc?.active} />
            )}
          </div>
        </div>

        {(isEditing || doc?.address) && (
          <div className="mt-4">
            <label className={CM.label}>Address</label>
            {isEditing ? (
              <textarea className={CM.textarea + ' min-h-[60px]'} value={current.address} onChange={(e) => patch({ address: e.target.value })} placeholder="Street, city…" />
            ) : (
              <p className="whitespace-pre-wrap text-sm text-gray-700 mt-0.5">{doc?.address}</p>
            )}
          </div>
        )}

        {(isEditing || doc?.notes) && (
          <div className="mt-4">
            <label className={CM.label}>Notes</label>
            {isEditing ? (
              <textarea className={CM.textarea + ' min-h-[80px]'} value={current.notes} onChange={(e) => patch({ notes: e.target.value })} placeholder="Internal notes…" />
            ) : (
              <p className="whitespace-pre-wrap text-sm text-gray-700 mt-0.5">{doc?.notes}</p>
            )}
          </div>
        )}
      </DetailSection>
    </div>
  )
}
