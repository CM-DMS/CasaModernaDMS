import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'

interface Supplier {
  name: string
  supplier_name: string
  supplier_group: string
  disabled: 0 | 1
}

export function SupplierList() {
  const navigate = useNavigate()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    frappe
      .getList<Supplier>('Supplier', {
        fields: ['name', 'supplier_name', 'supplier_group', 'disabled'],
        order_by: 'supplier_name asc',
        limit: 200,
      })
      .then(setSuppliers)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900">Suppliers</h1>
        <span className="text-sm text-gray-400">{suppliers.length} suppliers</span>
      </div>

      {loading && <p className="text-sm text-gray-400 animate-pulse">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2 text-left">Code</th>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Group</th>
                <th className="px-4 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {suppliers.map((s) => (
                <tr
                  key={s.name}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/suppliers/${encodeURIComponent(s.name)}`)}
                >
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">{s.name}</td>
                  <td className="px-4 py-2 text-gray-900">{s.supplier_name}</td>
                  <td className="px-4 py-2 text-gray-500">{s.supplier_group}</td>
                  <td className="px-4 py-2">
                    {s.disabled ? (
                      <span className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded">
                        Disabled
                      </span>
                    ) : (
                      <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded">
                        Active
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
