import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'

interface CfgPricing {
  name: string
  configurator_type: string
  price_list: string
}

export function ConfiguratorPricingList() {
  const navigate = useNavigate()
  const [docs, setDocs] = useState<CfgPricing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    frappe
      .getList<CfgPricing>('CM Configurator Pricing', {
        fields: ['name', 'configurator_type', 'price_list'],
        order_by: 'name asc',
        limit: 100,
      })
      .then(setDocs)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900 mb-4">Configurator Pricing</h1>

      {loading && <p className="text-sm text-gray-400 animate-pulse">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2 text-left">ID</th>
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-left">Price List</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {docs.map((d) => (
                <tr
                  key={d.name}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/configurator/${encodeURIComponent(d.name)}`)}
                >
                  <td className="px-4 py-2 font-mono text-xs text-gray-700">{d.name}</td>
                  <td className="px-4 py-2 text-gray-700">{d.configurator_type}</td>
                  <td className="px-4 py-2 text-gray-500">{d.price_list}</td>
                </tr>
              ))}
              {docs.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-gray-400">
                    No configurator pricing docs found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
