import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'

interface MatrixRow {
  name: string
  mode: string
  finish_code: string
  seat_count: number
  base_price: number
  tier_name?: string
  option_code?: string
}

interface CfgDoc {
  name: string
  configurator_type: string
  price_list: string
  matrix_rows: MatrixRow[]
}

export function ConfiguratorPricingDetail() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const [doc, setDoc] = useState<CfgDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterMode, setFilterMode] = useState('')

  useEffect(() => {
    if (!name) return
    frappe
      .getDoc<CfgDoc>('CM Configurator Pricing', name)
      .then(setDoc)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [name])

  const modes = useMemo(
    () => [...new Set((doc?.matrix_rows ?? []).map((r) => r.mode))].sort(),
    [doc],
  )

  const rows = useMemo(
    () =>
      filterMode
        ? (doc?.matrix_rows ?? []).filter((r) => r.mode === filterMode)
        : (doc?.matrix_rows ?? []),
    [doc, filterMode],
  )

  if (loading) return <p className="text-sm text-gray-400 animate-pulse">Loading…</p>
  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!doc) return null

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-MT', { style: 'currency', currency: 'EUR' }).format(n)

  return (
    <div>
      <button
        onClick={() => navigate('/configurator')}
        className="text-sm text-gray-400 hover:text-gray-700 mb-4 inline-flex items-center gap-1"
      >
        ← Configurator Pricing
      </button>

      <h1 className="text-xl font-semibold text-gray-900 mb-1">{doc.name}</h1>
      <p className="text-sm text-gray-500 mb-1">
        <span className="font-medium">Type:</span> {doc.configurator_type}
        {' · '}
        <span className="font-medium">Price List:</span> {doc.price_list}
      </p>
      <p className="text-sm text-gray-400 mb-6">{doc.matrix_rows.length} matrix rows</p>

      {/* Mode filter */}
      {modes.length > 1 && (
        <div className="mb-4 flex items-center gap-2">
          <label className="text-xs text-gray-500">Filter mode:</label>
          <select
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value)}
            className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-cm-green"
          >
            <option value="">All ({doc.matrix_rows.length})</option>
            {modes.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2 text-left">Mode</th>
              <th className="px-4 py-2 text-left">Finish</th>
              <th className="px-4 py-2 text-center">Seats</th>
              <th className="px-4 py-2 text-right">Base Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.name}>
                <td className="px-4 py-2 text-gray-700 font-mono text-xs">{r.mode}</td>
                <td className="px-4 py-2 text-gray-700">{r.finish_code}</td>
                <td className="px-4 py-2 text-center text-gray-700">{r.seat_count}</td>
                <td className="px-4 py-2 text-right font-mono">
                  {r.base_price ? fmt(r.base_price) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
