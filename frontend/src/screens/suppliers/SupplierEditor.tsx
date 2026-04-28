import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import {
  PageHeader, ErrorBox, FieldWrap, inputCls, selectCls,
} from '../../components/shared/ui'
import { usePermissions } from '../../auth/PermissionsProvider'

const BLANK_DOC = {
  doctype: 'Supplier',
  supplier_name: '',
  cm_supplier_ref_3: '',
  supplier_type: 'Company',
  supplier_group: 'Furniture Manufacturer',
  mobile_no: '',
  email_id: '',
  tax_id: '',
  website: '',
  cm_bank_name: '',
  cm_bank_address: '',
  cm_bank_bic: '',
  cm_bank_iban: '',
  cm_internal_notes: '',
}

const DEFAULT_SUPPLIER_GROUPS = [
  'Furniture Manufacturer', 'Kitchen Manufacturer', 'Tiles Supplier',
  'Fabric & Upholstery', 'Hardware & Fittings', 'Lighting', 'Services', 'Local',
]

function SectionBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
      <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
      {children}
    </div>
  )
}

export function SupplierEditor() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const { can } = usePermissions()
  const isNew = !name || name === 'new'

  const [doc, setDoc] = useState<Record<string, unknown>>({ ...BLANK_DOC })
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [supplierGroups, setSupplierGroups] = useState<string[]>(DEFAULT_SUPPLIER_GROUPS)

  useEffect(() => {
    frappe.getList('Supplier Group', {
      fields: ['name'],
      filters: [['name', '!=', 'All Supplier Groups']] as any,
      limit: 50,
      order_by: 'name asc',
    })
      .then((rows) => { if (rows?.length) setSupplierGroups(rows.map((r: any) => r.name)) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (isNew) return
    setLoading(true)
    frappe
      .getDoc('Supplier', name!)
      .then((d) => setDoc(d as Record<string, unknown>))
      .catch((e: any) => setError(e.message || 'Failed to load supplier'))
      .finally(() => setLoading(false))
  }, [name, isNew])

  if (!can('canPurchasing') && !can('canAdmin')) {
    return (
      <div className="rounded border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-800 text-center">
        You do not have permission to create or edit suppliers.
      </div>
    )
  }

  const set = (field: string, value: unknown) =>
    setDoc((prev) => ({ ...prev, [field]: value }))

  const handleSave = async () => {
    if (!(doc.supplier_name as string)?.trim()) {
      setError('Supplier Name is required.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const saved = await frappe.saveDoc('Supplier', doc)
      navigate(`/suppliers/${encodeURIComponent((saved as any).name)}`)
    } catch (err: any) {
      setError(err.message || 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 rounded-full border-4 border-cm-green border-t-transparent animate-spin" />
      </div>
    )
  }

  const title = isNew ? 'New Supplier' : `Edit: ${(doc.supplier_name as string) || (doc.name as string)}`

  return (
    <div className="space-y-5">
      <PageHeader
        title={title}
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              className="px-4 py-1.5 rounded text-sm font-semibold bg-cm-green text-white hover:bg-cm-green/90 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save Supplier'}
            </button>
            <button
              onClick={() =>
                navigate(doc.name ? `/suppliers/${encodeURIComponent(doc.name as string)}` : '/suppliers')
              }
              className="px-3 py-1.5 rounded text-sm border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        }
      />

      {error && <ErrorBox message={error} />}

      <SectionBox title="Identity">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldWrap label="Supplier Name *">
            <input
              className={inputCls}
              value={(doc.supplier_name as string) || ''}
              onChange={(e) => set('supplier_name', e.target.value)}
              placeholder="e.g. Acme Italia Srl"
            />
          </FieldWrap>

          <FieldWrap label="Code Abbreviation (3 letters)">
            <input
              className={inputCls + ' font-mono uppercase w-24'}
              maxLength={3}
              value={(doc.cm_supplier_ref_3 as string) ?? ''}
              onChange={(e) => set('cm_supplier_ref_3', e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
              placeholder="ACM"
            />
          </FieldWrap>

          <FieldWrap label="Supplier Type">
            <select
              className={selectCls}
              value={(doc.supplier_type as string) || 'Company'}
              onChange={(e) => set('supplier_type', e.target.value)}
            >
              <option value="Company">Company</option>
              <option value="Individual">Individual</option>
            </select>
          </FieldWrap>

          <FieldWrap label="Supplier Group">
            <select
              className={selectCls}
              value={(doc.supplier_group as string) || ''}
              onChange={(e) => set('supplier_group', e.target.value)}
            >
              <option value="">— select —</option>
              {supplierGroups.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </FieldWrap>
        </div>
      </SectionBox>

      <SectionBox title="Contact">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldWrap label="Mobile">
            <input
              className={inputCls}
              value={(doc.mobile_no as string) || ''}
              onChange={(e) => set('mobile_no', e.target.value)}
              placeholder="+39 …"
            />
          </FieldWrap>

          <FieldWrap label="Email">
            <input
              type="email"
              className={inputCls}
              value={(doc.email_id as string) || ''}
              onChange={(e) => set('email_id', e.target.value)}
              placeholder="supplier@example.com"
            />
          </FieldWrap>

          <FieldWrap label="VAT / Tax ID">
            <input
              className={inputCls}
              value={(doc.tax_id as string) || ''}
              onChange={(e) => set('tax_id', e.target.value)}
              placeholder="IT12345678901"
            />
          </FieldWrap>

          <FieldWrap label="Website">
            <input
              className={inputCls}
              value={(doc.website as string) || ''}
              onChange={(e) => set('website', e.target.value)}
              placeholder="https://…"
            />
          </FieldWrap>
        </div>
      </SectionBox>

      <SectionBox title="Banking Details">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldWrap label="Bank">
            <input
              className={inputCls}
              value={(doc.cm_bank_name as string) ?? ''}
              onChange={(e) => set('cm_bank_name', e.target.value)}
              placeholder="e.g. Banca Intesa Sanpaolo"
            />
          </FieldWrap>

          <FieldWrap label="BIC / SWIFT">
            <input
              className={inputCls + ' font-mono uppercase'}
              value={(doc.cm_bank_bic as string) ?? ''}
              onChange={(e) => set('cm_bank_bic', e.target.value.toUpperCase())}
              placeholder="e.g. BCITITMM"
            />
          </FieldWrap>

          <FieldWrap label="IBAN">
            <input
              className={inputCls + ' font-mono uppercase'}
              value={(doc.cm_bank_iban as string) ?? ''}
              onChange={(e) => set('cm_bank_iban', e.target.value.toUpperCase())}
              placeholder="e.g. IT60 X054 2811 1010 0000 0123 456"
            />
          </FieldWrap>

          <FieldWrap label="Bank Address">
            <input
              className={inputCls}
              value={(doc.cm_bank_address as string) ?? ''}
              onChange={(e) => set('cm_bank_address', e.target.value)}
              placeholder="Branch address"
            />
          </FieldWrap>
        </div>
      </SectionBox>

      <SectionBox title="Internal Notes">
        <textarea
          className={inputCls + ' min-h-[80px] resize-y'}
          value={(doc.cm_internal_notes as string) ?? ''}
          onChange={(e) => set('cm_internal_notes', e.target.value)}
          placeholder="Private notes visible to staff only…"
        />
      </SectionBox>
    </div>
  )
}
