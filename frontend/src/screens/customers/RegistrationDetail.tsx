/**
 * RegistrationDetail — displays a CM Customer Onboarding Request and allows
 * staff to review, approve, reject, edit, or convert it to a Customer.
 *
 * Route: /customers/registrations/:id
 */
import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import {
  PageHeader, DetailSection, BackLink, ErrorBox, Btn,
} from '../../components/shared/ui'
import { CM } from '../../components/ui/CMClassNames'

interface OnboardingDoc {
  name: string
  full_name: string
  company_name?: string
  customer_type: string
  id_card_no?: string
  vat_no?: string
  email: string
  mobile: string
  bill_line1?: string
  bill_line2?: string
  bill_locality?: string
  bill_postcode?: string
  same_as_billing?: number
  del_line1?: string
  del_line2?: string
  del_locality?: string
  del_postcode?: string
  consent_email_marketing?: number
  consent_sms_marketing?: number
  consent_date?: string
  consent_ip?: string
  reviewer_notes?: string
  status: string
  created_customer?: string
  creation?: string
}

const STATUS_BADGE: Record<string, string> = {
  New:       'bg-amber-100 text-amber-700',
  Reviewed:  'bg-blue-100 text-blue-700',
  Converted: 'bg-green-100 text-green-700',
  Rejected:  'bg-red-100 text-red-700',
}

function Field({ label, value, wide }: { label: string; value?: string | number | null; wide?: boolean }) {
  if (value == null || value === '') return null
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <dt className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-0.5">{label}</dt>
      <dd className="text-sm text-gray-900">{String(value)}</dd>
    </div>
  )
}

const EDITABLE_FIELDS = [
  'customer_type', 'full_name', 'company_name', 'id_card_no', 'vat_no',
  'email', 'mobile',
  'bill_line1', 'bill_line2', 'bill_locality', 'bill_postcode',
  'same_as_billing',
  'del_line1', 'del_line2', 'del_locality', 'del_postcode',
] as const

type EditKey = typeof EDITABLE_FIELDS[number]
type Edits = Partial<Record<EditKey, string | number>>

function EditableField({
  label, field, edits, onChange, wide, type = 'text',
}: {
  label: string; field: EditKey; edits: Edits; onChange: (f: EditKey, v: string) => void
  wide?: boolean; type?: string
}) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-0.5 block">{label}</label>
      <input
        type={type}
        className={CM.input}
        value={(edits[field] as string) ?? ''}
        onChange={(e) => onChange(field, e.target.value)}
      />
    </div>
  )
}

function EditableSelect({
  label, field, edits, onChange, options, wide,
}: {
  label: string; field: EditKey; edits: Edits; onChange: (f: EditKey, v: string) => void
  options: string[]; wide?: boolean
}) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-0.5 block">{label}</label>
      <select
        className={CM.select}
        value={(edits[field] as string) ?? ''}
        onChange={(e) => onChange(field, e.target.value)}
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

function EditableLocality({
  label, field, edits, onChange, localities, wide,
}: {
  label: string; field: EditKey; edits: Edits; onChange: (f: EditKey, v: string) => void
  localities: string[]; wide?: boolean
}) {
  if (localities.length > 0) {
    return (
      <div className={wide ? 'col-span-2' : ''}>
        <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-0.5 block">{label}</label>
        <select
          className={CM.select}
          value={(edits[field] as string) ?? ''}
          onChange={(e) => onChange(field, e.target.value)}
        >
          <option value="">— Select —</option>
          {localities.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>
    )
  }
  return <EditableField label={label} field={field} edits={edits} onChange={onChange} wide={wide} />
}

export function RegistrationDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [doc, setDoc] = useState<OnboardingDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [notes, setNotes] = useState('')
  const [notesError, setNotesError] = useState('')

  const [editing, setEditing] = useState(false)
  const [edits, setEdits] = useState<Edits>({})
  const [saveError, setSaveError] = useState('')
  const [localities, setLocalities] = useState<string[]>([])
  const [conflict, setConflict] = useState<{ customer: string; customer_name: string } | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    frappe.getDoc('CM Customer Onboarding Request', decodeURIComponent(id ?? ''))
      .then((d: unknown) => {
        const doc = d as OnboardingDoc
        setDoc(doc)
        setNotes(doc.reviewer_notes ?? '')
      })
      .catch((e: Error) => setError(e.message || 'Failed to load registration'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => { load() }, [load])

  const startEdit = () => {
    if (!doc) return
    const snapshot: Edits = {}
    EDITABLE_FIELDS.forEach((f) => {
      snapshot[f] = (doc as Record<string, unknown>)[f] as string ?? ''
    })
    setEdits(snapshot)
    setSaveError('')
    if (localities.length === 0) {
      frappe.getList('CM Locality', {
        fields: ['name'],
        filters: [['name', 'not like', 'SMOKE%']],
        limit: 300,
        order_by: 'name asc',
      })
        .then((rows: unknown) => {
          const r = rows as Array<{ name: string }>
          if (r?.length) setLocalities(r.map((x) => x.name))
        })
        .catch(() => {})
    }
    setEditing(true)
  }

  const cancelEdit = () => { setEditing(false); setSaveError('') }
  const patchEdit = (field: EditKey, value: string | number) =>
    setEdits((prev) => ({ ...prev, [field]: value }))

  const saveEdits = async () => {
    setSaveError('')
    setBusy(true)
    try {
      await frappe.saveDoc('CM Customer Onboarding Request', { name: doc!.name, ...edits })
      await load()
      setEditing(false)
    } catch (e: unknown) {
      setSaveError((e as Error).message || 'Failed to save changes')
    } finally {
      setBusy(false)
    }
  }

  const saveNotes = async () => {
    setNotesError('')
    setBusy(true)
    try {
      await frappe.call('frappe.client.set_value', {
        doctype: 'CM Customer Onboarding Request',
        name: doc!.name,
        fieldname: 'reviewer_notes',
        value: notes,
      })
    } catch (e: unknown) {
      setNotesError((e as Error).message || 'Failed to save notes')
    } finally {
      setBusy(false)
    }
  }

  const setStatus = async (status: string) => {
    setBusy(true)
    setError('')
    try {
      await frappe.call('frappe.client.set_value', {
        doctype: 'CM Customer Onboarding Request',
        name: doc!.name,
        fieldname: 'status',
        value: status,
      })
      setDoc((prev) => prev ? { ...prev, status } : prev)
    } catch (e: unknown) {
      setError((e as Error).message || 'Failed to update status')
    } finally {
      setBusy(false)
    }
  }

  const createCustomer = async () => {
    setBusy(true)
    setError('')
    setConflict(null)
    try {
      const result = await frappe.call(
        'casamoderna_dms.onboarding_api.create_customer_from_request',
        { request_name: doc!.name },
      ) as { conflict?: { customer: string; customer_name: string }; created?: string }
      if (result?.conflict) {
        setConflict(result.conflict)
      } else {
        setDoc((prev) => prev ? { ...prev, status: 'Converted', created_customer: result?.created } : prev)
      }
    } catch (e: unknown) {
      setError((e as Error).message || 'Failed to create customer')
    } finally {
      setBusy(false)
    }
  }

  const mergeIntoExisting = async () => {
    if (!conflict) return
    setBusy(true)
    setError('')
    try {
      const customerName = await frappe.call(
        'casamoderna_dms.onboarding_api.merge_request_into_customer',
        { request_name: doc!.name, customer_name: conflict.customer },
      ) as string
      setConflict(null)
      setDoc((prev) => prev ? { ...prev, status: 'Converted', created_customer: customerName } : prev)
    } catch (e: unknown) {
      setError((e as Error).message || 'Failed to update customer')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <BackLink label="Registrations" onClick={() => navigate('/customers/registrations')} />
        <div className="text-sm text-gray-400 animate-pulse">Loading…</div>
      </div>
    )
  }

  if (error && !doc) {
    return (
      <div className="space-y-4">
        <BackLink label="Registrations" onClick={() => navigate('/customers/registrations')} />
        <ErrorBox message={error} />
      </div>
    )
  }

  if (!doc) return null

  const isConverted = doc.status === 'Converted'
  const isRejected  = doc.status === 'Rejected'
  const billParts   = [doc.bill_line2, doc.bill_line1, doc.bill_locality, doc.bill_postcode].filter(Boolean)
  const billAddress = billParts.join(', ') || '—'

  return (
    <div className="space-y-5">
      <PageHeader
        title={editing ? `Editing: ${doc.full_name}` : doc.full_name}
        subtitle={doc.name}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center px-2.5 py-1 rounded text-[12px] font-semibold ${STATUS_BADGE[doc.status] ?? 'bg-gray-100 text-gray-600'}`}>
              {doc.status}
            </span>

            {!editing && !isConverted && !isRejected && (
              <>
                <Btn variant="ghost" onClick={startEdit} disabled={busy}>Edit Details</Btn>
                {doc.status !== 'Reviewed' && (
                  <Btn variant="ghost" onClick={() => setStatus('Reviewed')} disabled={busy}>Mark Reviewed</Btn>
                )}
                <button className={CM.btn.danger} onClick={() => setStatus('Rejected')} disabled={busy}>Reject</button>
                <Btn onClick={createCustomer} disabled={busy}>{busy ? 'Creating…' : 'Create Customer'}</Btn>
              </>
            )}

            {editing && (
              <>
                <Btn variant="ghost" onClick={cancelEdit} disabled={busy}>Cancel</Btn>
                <Btn onClick={saveEdits} disabled={busy}>{busy ? 'Saving…' : 'Save Changes'}</Btn>
              </>
            )}

            {isConverted && doc.created_customer && (
              <Btn variant="ghost" onClick={() => navigate(`/customers/${encodeURIComponent(doc.created_customer ?? '')}`)}>
                Open Customer
              </Btn>
            )}

            <BackLink label="Registrations" onClick={() => navigate('/customers/registrations')} />
          </div>
        }
      />

      {error && <ErrorBox message={error} />}
      {saveError && <ErrorBox message={saveError} />}

      {conflict && (
        <div className="rounded border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
          <p className="font-semibold mb-1">Customer already exists</p>
          <p className="text-amber-800 mb-3">
            A customer named <strong>{conflict.customer_name}</strong> ({conflict.customer}) is already
            registered. You can update their details with the data from this registration, or cancel and handle manually.
          </p>
          <div className="flex gap-2">
            <Btn onClick={mergeIntoExisting} disabled={busy}>{busy ? 'Updating…' : 'Update Existing Customer'}</Btn>
            <Btn variant="ghost" onClick={() => setConflict(null)} disabled={busy}>Cancel</Btn>
          </div>
        </div>
      )}

      {/* Identity */}
      <DetailSection title="Identity">
        {editing ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <EditableField label="Full Name"    field="full_name"    edits={edits} onChange={patchEdit} />
            <EditableSelect label="Account Type" field="customer_type" edits={edits} onChange={patchEdit} options={['Individual', 'Company']} />
            <EditableField label="Company"      field="company_name" edits={edits} onChange={patchEdit} />
            <EditableField label="ID Card No"   field="id_card_no"   edits={edits} onChange={patchEdit} />
            <EditableField label="VAT Number"   field="vat_no"       edits={edits} onChange={patchEdit} />
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Field label="Full Name"    value={doc.full_name} />
            <Field label="Account Type" value={doc.customer_type} />
            {doc.company_name && <Field label="Company"    value={doc.company_name} />}
            {doc.id_card_no   && <Field label="ID Card No" value={doc.id_card_no} />}
            {doc.vat_no       && <Field label="VAT Number" value={doc.vat_no} />}
          </dl>
        )}
      </DetailSection>

      {/* Contact */}
      <DetailSection title="Contact">
        {editing ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <EditableField label="Email"  field="email"  edits={edits} onChange={patchEdit} type="email" />
            <EditableField label="Mobile" field="mobile" edits={edits} onChange={patchEdit} type="tel" />
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Field label="Email"  value={doc.email} />
            <Field label="Mobile" value={doc.mobile} />
          </dl>
        )}
      </DetailSection>

      {/* Billing Address */}
      <DetailSection title="Billing Address">
        {editing ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <EditableField label="Door No. / Building Name & Apt. No." field="bill_line1" edits={edits} onChange={patchEdit} wide />
            <EditableField label="Street Name" field="bill_line2" edits={edits} onChange={patchEdit} wide />
            <EditableLocality label="Locality" field="bill_locality" edits={edits} onChange={patchEdit} localities={localities} />
            <EditableField label="Postcode" field="bill_postcode" edits={edits} onChange={patchEdit} />
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            {doc.bill_line1    && <Field label="Door No. / Building Name & Apt. No." value={doc.bill_line1} wide />}
            {doc.bill_line2    && <Field label="Street Name" value={doc.bill_line2} wide />}
            {doc.bill_locality && <Field label="Locality"    value={doc.bill_locality} />}
            {doc.bill_postcode && <Field label="Postcode"    value={doc.bill_postcode} />}
          </dl>
        )}
      </DetailSection>

      {/* Delivery Address */}
      <DetailSection title="Delivery Address">
        {editing ? (
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={!!edits.same_as_billing}
                onChange={(e) => patchEdit('same_as_billing', e.target.checked ? 1 : 0)}
                className="h-4 w-4 rounded border-gray-300 text-cm-green focus:ring-cm-green"
              />
              Same as billing address
            </label>
            {!edits.same_as_billing && (
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 mt-2">
                <EditableField label="Door No. / Building Name & Apt. No." field="del_line1" edits={edits} onChange={patchEdit} wide />
                <EditableField label="Street Name" field="del_line2" edits={edits} onChange={patchEdit} wide />
                <EditableLocality label="Locality" field="del_locality" edits={edits} onChange={patchEdit} localities={localities} />
                <EditableField label="Postcode" field="del_postcode" edits={edits} onChange={patchEdit} />
              </div>
            )}
          </div>
        ) : doc.same_as_billing ? (
          <>
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1">Same as billing</p>
            <p className="text-sm text-gray-500">{billAddress}</p>
          </>
        ) : (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            {doc.del_line1    && <Field label="Door No. / Building Name & Apt. No." value={doc.del_line1} wide />}
            {doc.del_line2    && <Field label="Street Name" value={doc.del_line2} wide />}
            {doc.del_locality && <Field label="Locality"    value={doc.del_locality} />}
            {doc.del_postcode && <Field label="Postcode"    value={doc.del_postcode} />}
          </dl>
        )}
      </DetailSection>

      {/* Marketing Consent */}
      <DetailSection title="Marketing Consent">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
          <Field label="Email Marketing" value={doc.consent_email_marketing ? 'Yes' : 'No'} />
          <Field label="SMS Marketing"   value={doc.consent_sms_marketing   ? 'Yes' : 'No'} />
          {doc.consent_date && <Field label="Consent Date" value={new Date(doc.consent_date).toLocaleString('en-GB')} />}
          {doc.consent_ip   && <Field label="Submitted from IP" value={doc.consent_ip} />}
        </dl>
      </DetailSection>

      {/* Reviewer Notes */}
      <DetailSection title="Reviewer Notes">
        <textarea
          className={CM.textarea}
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Internal notes for this registration…"
          disabled={isConverted || isRejected}
        />
        {notesError && <p className="mt-1 text-xs text-red-600">{notesError}</p>}
        {!isConverted && !isRejected && (
          <div className="mt-2 flex justify-end">
            <Btn variant="ghost" onClick={saveNotes} disabled={busy}>Save Notes</Btn>
          </div>
        )}
      </DetailSection>

      {isConverted && doc.created_customer && (
        <div className="rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Converted to customer: <strong>{doc.created_customer}</strong>
        </div>
      )}
    </div>
  )
}
