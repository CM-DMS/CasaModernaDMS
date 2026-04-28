import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'

interface SupplierDoc {
  name: string
  supplier_name: string
  supplier_group: string
  disabled: 0 | 1
  country?: string
  website?: string
  tax_id?: string
}

export function SupplierProfile() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
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

  return (
    <div className="max-w-2xl">
      <button
        onClick={() => navigate('/suppliers')}
        className="text-sm text-gray-400 hover:text-gray-700 mb-4 inline-flex items-center gap-1"
      >
        ← Suppliers
      </button>

      <h1 className="text-xl font-semibold text-gray-900 mb-1">{supplier.supplier_name}</h1>
      <p className="text-xs text-gray-400 font-mono mb-6">{supplier.name}</p>

      <dl className="grid grid-cols-2 gap-4 text-sm">
        <Field label="Group" value={supplier.supplier_group} />
        <Field label="Country" value={supplier.country} />
        <Field label="Website" value={supplier.website} />
        <Field label="Tax ID" value={supplier.tax_id} />
        <Field
          label="Status"
          value={supplier.disabled ? 'Disabled' : 'Active'}
        />
      </dl>
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
