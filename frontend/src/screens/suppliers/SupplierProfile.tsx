import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import { usePermissions } from '../../auth/PermissionsProvider'

interface SupplierDoc {
  name: string
  supplier_name: string
  supplier_group: string
  supplier_type?: string
  disabled: 0 | 1
  country?: string
  website?: string
  tax_id?: string
  mobile_no?: string
  email_id?: string
  cm_bank_name?: string
  cm_bank_bic?: string
  cm_bank_iban?: string
  cm_internal_notes?: string
}

export function SupplierProfile() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const { can } = usePermissions()
  const [supplier, setSupplier] = useState<SupplierDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!name) return
    frappe
      .getDoc<SupplierDoc>('Supplier', name)
      .then(setSupplier)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [name])

  if (loading) return <p className="text-sm text-gray-400 animate-pulse">Loading…</p>
  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!supplier) return null

  const canEdit = can('canPurchasing') || can('canAdmin')

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <button
            onClick={() => navigate('/suppliers')}
            className="text-sm text-gray-400 hover:text-gray-700 mb-2 inline-flex items-center gap-1"
          >
            ← Suppliers
          </button>
          <h1 className="text-xl font-semibold text-gray-900">{supplier.supplier_name}</h1>
          <p className="text-xs text-gray-400 font-mono mt-0.5">{supplier.name}</p>
        </div>
        {canEdit && (
          <button
            onClick={() => navigate(`/suppliers/${encodeURIComponent(supplier.name)}/edit`)}
            className="px-4 py-1.5 rounded text-sm font-semibold bg-cm-green text-white hover:bg-cm-green/90 transition-colors shrink-0"
          >
            Edit
          </button>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Identity</h2>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <Field label="Group" value={supplier.supplier_group} />
          <Field label="Type" value={supplier.supplier_type} />
          <Field label="Country" value={supplier.country} />
          <Field label="Tax ID" value={supplier.tax_id} />
          <Field label="Website" value={supplier.website} />
          <Field label="Status" value={supplier.disabled ? 'Disabled' : 'Active'} />
        </dl>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Contact</h2>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <Field label="Mobile" value={supplier.mobile_no} />
          <Field label="Email" value={supplier.email_id} />
        </dl>
      </div>

      {(supplier.cm_bank_name || supplier.cm_bank_iban) && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Banking</h2>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <Field label="Bank" value={supplier.cm_bank_name} />
            <Field label="BIC / SWIFT" value={supplier.cm_bank_bic} />
            <Field label="IBAN" value={supplier.cm_bank_iban} />
          </dl>
        </div>
      )}

      {supplier.cm_internal_notes && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Internal Notes</h2>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{supplier.cm_internal_notes}</p>
        </div>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs text-gray-400 uppercase tracking-wide">{label}</dt>
      <dd className="text-gray-800 mt-0.5">{value ?? '—'}</dd>
    </div>
  )
}
