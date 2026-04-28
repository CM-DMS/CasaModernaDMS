import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import { CM } from '../../components/ui/CMClassNames'
import { CMSection, CMField, CMButton } from '../../components/ui/CMComponents'
import {
  PageHeader, BackLink, ErrorBox,
} from '../../components/shared/ui'
import { Typeahead } from '../../components/sales/Typeahead'
import { usePermissions } from '../../auth/PermissionsProvider'

// ── Doc shape ─────────────────────────────────────────────────────────────────

interface CustomerDoc {
  doctype: 'Customer'
  name?: string
  customer_name: string
  customer_type: string
  customer_group: string
  territory: string
  disabled?: number
  cm_vat_no: string
  cm_id_card_no: string
  cm_mobile: string
  cm_email: string
  cm_prices_inc_vat: number
  cm_bill_line1: string
  cm_bill_line2: string
  cm_bill_locality: string
  cm_bill_postcode: string
  cm_bill_country: string
  cm_del_line1: string
  cm_del_line2: string
  cm_del_locality: string
  cm_del_postcode: string
  cm_del_country: string
  cm_is_parent: number
  cm_parent_customer: string
  cm_internal_notes: string
}

function blankDoc(): CustomerDoc {
  return {
    doctype: 'Customer',
    customer_name: '',
    customer_type: 'Individual',
    customer_group: 'Individual',
    territory: 'Malta',
    cm_vat_no: '',
    cm_id_card_no: '',
    cm_mobile: '',
    cm_email: '',
    cm_prices_inc_vat: 1,
    cm_bill_line1: '',
    cm_bill_line2: '',
    cm_bill_locality: '',
    cm_bill_postcode: '',
    cm_bill_country: 'Malta',
    cm_del_line1: '',
    cm_del_line2: '',
    cm_del_locality: '',
    cm_del_postcode: '',
    cm_del_country: 'Malta',
    cm_is_parent: 0,
    cm_parent_customer: '',
    cm_internal_notes: '',
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CustomerEditor() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const { can } = usePermissions()
  const isNew = !name

  const [doc, setDoc] = useState<CustomerDoc>(blankDoc())
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [customerGroups, setCustomerGroups] = useState(['Individual', 'Commercial', 'Government', 'Non Profit'])
  const [territories, setTerritories] = useState(['Malta', 'Rest Of The World'])
  const [localities, setLocalities] = useState<string[]>([])

  // Load lookup data
  useEffect(() => {
    frappe.getList<{ name: string }>('Customer Group', {
      fields: ['name'],
      filters: [['name', '!=', 'All Customer Groups', '']],
      limit: 50,
      order_by: 'name asc',
    }).then((rows) => { if (rows.length) setCustomerGroups(rows.map((r) => r.name)) }).catch(() => {})

    frappe.getList<{ name: string }>('Territory', {
      fields: ['name'],
      filters: [['name', '!=', 'All Territories', '']],
      limit: 50,
      order_by: 'name asc',
    }).then((rows) => { if (rows.length) setTerritories(rows.map((r) => r.name)) }).catch(() => {})

    frappe.getList<{ name: string }>('CM Locality', {
      fields: ['name'],
      limit: 200,
      order_by: 'name asc',
    }).then((rows) => { if (rows.length) setLocalities(rows.map((r) => r.name)) }).catch(() => {})
  }, [])

  // Load existing doc when editing
  const loadDoc = useCallback(() => {
    if (!name) return
    setLoading(true)
    frappe.getDoc<CustomerDoc>('Customer', name)
      .then((d) => setDoc({ ...blankDoc(), ...d }))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load customer'))
      .finally(() => setLoading(false))
  }, [name])

  useEffect(() => { loadDoc() }, [loadDoc])

  const patch = (field: keyof CustomerDoc, value: unknown) =>
    setDoc((prev) => ({ ...prev, [field]: value }))

  const copyBillingToDelivery = () =>
    setDoc((prev) => ({
      ...prev,
      cm_del_line1: prev.cm_bill_line1,
      cm_del_line2: prev.cm_bill_line2,
      cm_del_locality: prev.cm_bill_locality,
      cm_del_postcode: prev.cm_bill_postcode,
      cm_del_country: prev.cm_bill_country,
    }))

  const searchParentCustomers = async (q: string) => {
    const rows = await frappe.getList<{ name: string; customer_name: string }>('Customer', {
      fields: ['name', 'customer_name'],
      filters: [['customer_name', 'like', `%${q}%`, '']],
      limit: 15,
    })
    return rows
  }

  const handleSave = async () => {
    setError('')
    if (!doc.customer_name.trim()) { setError('Customer name is required.'); return }
    if (!doc.customer_group) { setError('Customer group is required.'); return }
    if (!doc.territory) { setError('Territory is required.'); return }
    if (!doc.cm_mobile.trim()) { setError('Mobile number is required.'); return }

    setSaving(true)
    try {
      const saved = await frappe.saveDoc<CustomerDoc>('Customer', doc as unknown as Record<string, unknown>)
      navigate(`/customers/${encodeURIComponent(saved.name ?? '')}`, { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    if (name) navigate(`/customers/${encodeURIComponent(name)}`)
    else navigate('/customers')
  }

  if (!can('canSales') && !can('canAdmin')) {
    return <ErrorBox message="You do not have permission to edit customers." />
  }

  if (loading) return <div className="py-12 text-center text-gray-400">Loading…</div>

  return (
    <div className="space-y-5">
      <BackLink
        label={isNew ? 'Customers' : 'Customer'}
        onClick={handleCancel}
      />

      <PageHeader
        title={isNew ? 'New Customer' : `Edit ${doc.customer_name || name}`}
        actions={
          <div className="flex items-center gap-2">
            <CMButton variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </CMButton>
            <CMButton variant="ghost" onClick={handleCancel} disabled={saving}>
              Cancel
            </CMButton>
          </div>
        }
      />

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Identity */}
      <CMSection title="Identity">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <CMField label="Customer Name *">
              <input
                className={CM.input}
                value={doc.customer_name}
                onChange={(e) => patch('customer_name', e.target.value)}
                placeholder="Full name…"
              />
            </CMField>
          </div>

          {!isNew && (
            <div className="col-span-2">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <button
                  type="button"
                  role="switch"
                  aria-checked={!doc.disabled}
                  onClick={() => patch('disabled', doc.disabled ? 0 : 1)}
                  className={`relative inline-flex h-5 w-10 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                    !doc.disabled ? 'bg-cm-green' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${
                      !doc.disabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className="text-sm text-gray-700">
                  Customer is{' '}
                  <strong className={!doc.disabled ? 'text-green-700' : 'text-red-600'}>
                    {doc.disabled ? 'Inactive' : 'Active'}
                  </strong>
                </span>
              </label>
            </div>
          )}

          <CMField label="Type">
            <select
              className={CM.select}
              value={doc.customer_type}
              onChange={(e) => patch('customer_type', e.target.value)}
            >
              <option value="Individual">Individual</option>
              <option value="Company">Company</option>
            </select>
          </CMField>

          <CMField label="Customer Group">
            <select
              className={CM.select}
              value={doc.customer_group}
              onChange={(e) => patch('customer_group', e.target.value)}
            >
              <option value="">— select —</option>
              {customerGroups.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </CMField>

          <CMField label="Territory">
            <select
              className={CM.select}
              value={doc.territory}
              onChange={(e) => patch('territory', e.target.value)}
            >
              <option value="">— select —</option>
              {territories.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </CMField>

          <CMField label="VAT Number">
            <input
              className={CM.input}
              value={doc.cm_vat_no}
              onChange={(e) => patch('cm_vat_no', e.target.value)}
            />
          </CMField>

          <CMField label="ID Card No.">
            <input
              className={CM.input}
              value={doc.cm_id_card_no}
              onChange={(e) => patch('cm_id_card_no', e.target.value)}
            />
          </CMField>

          <div className="col-span-2">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <button
                type="button"
                role="switch"
                aria-checked={!!doc.cm_prices_inc_vat}
                onClick={() => patch('cm_prices_inc_vat', doc.cm_prices_inc_vat ? 0 : 1)}
                className={`relative inline-flex h-5 w-10 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                  doc.cm_prices_inc_vat ? 'bg-cm-green' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${
                    doc.cm_prices_inc_vat ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
              <span className="text-sm text-gray-700">
                Show prices <strong>{doc.cm_prices_inc_vat ? 'including' : 'excluding'}</strong> VAT on sales documents
              </span>
            </label>
          </div>
        </div>
      </CMSection>

      {/* Contact */}
      <CMSection title="Contact">
        <div className="grid grid-cols-2 gap-4">
          <CMField label="Mobile *">
            <input
              type="tel"
              className={CM.input}
              value={doc.cm_mobile}
              onChange={(e) => patch('cm_mobile', e.target.value)}
            />
          </CMField>
          <CMField label="Email">
            <input
              type="email"
              className={CM.input}
              value={doc.cm_email}
              onChange={(e) => patch('cm_email', e.target.value)}
            />
          </CMField>
        </div>
      </CMSection>

      {/* Billing Address */}
      <CMSection title="Billing Address">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <CMField label="Door No. / Building & Apt.">
              <input
                className={CM.input}
                value={doc.cm_bill_line1}
                onChange={(e) => patch('cm_bill_line1', e.target.value)}
                placeholder="e.g. 14, Bonavia Court, Apt 3"
              />
            </CMField>
          </div>
          <div className="col-span-2">
            <CMField label="Street Name">
              <input
                className={CM.input}
                value={doc.cm_bill_line2}
                onChange={(e) => patch('cm_bill_line2', e.target.value)}
                placeholder="e.g. Triq il-Balluta"
              />
            </CMField>
          </div>
          <CMField label="Locality">
            <select
              className={CM.select}
              value={doc.cm_bill_locality}
              onChange={(e) => patch('cm_bill_locality', e.target.value)}
            >
              <option value="">— select —</option>
              {localities.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </CMField>
          <CMField label="Postcode">
            <input
              className={CM.input}
              value={doc.cm_bill_postcode}
              onChange={(e) => patch('cm_bill_postcode', e.target.value)}
            />
          </CMField>
        </div>
      </CMSection>

      {/* Delivery Address */}
      <CMSection title="Delivery Address">
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            className="text-xs text-cm-green hover:underline"
            onClick={copyBillingToDelivery}
          >
            Copy from billing ↓
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <CMField label="Door No. / Building & Apt.">
              <input
                className={CM.input}
                value={doc.cm_del_line1}
                onChange={(e) => patch('cm_del_line1', e.target.value)}
                placeholder="e.g. 14, Bonavia Court, Apt 3"
              />
            </CMField>
          </div>
          <div className="col-span-2">
            <CMField label="Street Name">
              <input
                className={CM.input}
                value={doc.cm_del_line2}
                onChange={(e) => patch('cm_del_line2', e.target.value)}
                placeholder="e.g. Triq il-Balluta"
              />
            </CMField>
          </div>
          <CMField label="Locality">
            <select
              className={CM.select}
              value={doc.cm_del_locality}
              onChange={(e) => patch('cm_del_locality', e.target.value)}
            >
              <option value="">— select —</option>
              {localities.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </CMField>
          <CMField label="Postcode">
            <input
              className={CM.input}
              value={doc.cm_del_postcode}
              onChange={(e) => patch('cm_del_postcode', e.target.value)}
            />
          </CMField>
        </div>
      </CMSection>

      {/* Hierarchy */}
      <CMSection title="Customer Hierarchy">
        <div className="grid grid-cols-2 gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-700 col-span-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="accent-cm-green"
              checked={!!doc.cm_is_parent}
              onChange={(e) => patch('cm_is_parent', e.target.checked ? 1 : 0)}
            />
            This is a parent account
          </label>
          <div className="col-span-2">
            <Typeahead
              label="Parent Customer"
              value={doc.cm_parent_customer}
              displayValue={doc.cm_parent_customer}
              onSearch={searchParentCustomers}
              getLabel={(r: { name: string; customer_name: string }) => `${r.customer_name} (${r.name})`}
              getValue={(r: { name: string }) => r.name}
              onChange={(val: string) => patch('cm_parent_customer', val)}
            />
          </div>
        </div>
      </CMSection>

      {/* Internal Notes */}
      <CMSection title="Internal Notes">
        <textarea
          className={CM.textarea}
          rows={3}
          value={doc.cm_internal_notes}
          onChange={(e) => patch('cm_internal_notes', e.target.value)}
          placeholder="Staff-only notes…"
        />
      </CMSection>

      {/* Bottom action bar */}
      <div className="flex gap-2 justify-end pt-2 pb-8">
        <CMButton variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Customer'}
        </CMButton>
        <CMButton variant="ghost" onClick={handleCancel} disabled={saving}>
          Cancel
        </CMButton>
      </div>
    </div>
  )
}
