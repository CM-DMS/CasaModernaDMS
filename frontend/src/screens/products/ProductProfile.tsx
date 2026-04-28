import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'

interface ItemDoc {
  name: string
  item_name: string
  item_group: string
  stock_uom: string
  disabled: 0 | 1
  cm_product_code?: string
  cm_supplier_code?: string
  cm_family_code?: string
  cm_tiles_per_box?: number
  description?: string
}

interface ItemPrice {
  name: string
  price_list: string
  price_list_rate: number
  currency: string
  valid_from?: string
  valid_upto?: string
}

export function ProductProfile() {
  const { itemCode } = useParams<{ itemCode: string }>()
  const navigate = useNavigate()
  const [item, setItem] = useState<ItemDoc | null>(null)
  const [prices, setPrices] = useState<ItemPrice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!itemCode) return
    setLoading(true)
    Promise.all([
      frappe.getDoc<ItemDoc>('Item', itemCode),
      frappe.getList<ItemPrice>('Item Price', {
        fields: ['name', 'price_list', 'price_list_rate', 'currency', 'valid_from', 'valid_upto'],
        filters: [['item_code', '=', itemCode, '']],
        order_by: 'price_list asc',
        limit: 50,
      }),
    ])
      .then(([doc, p]) => {
        setItem(doc)
        setPrices(p)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [itemCode])

  if (loading) return <p className="text-sm text-gray-400 animate-pulse">Loading…</p>
  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!item) return null

  const fmt = (n: number, currency = 'EUR') =>
    new Intl.NumberFormat('en-MT', { style: 'currency', currency }).format(n)

  return (
    <div className="max-w-3xl">
      <button
        onClick={() => navigate('/products')}
        className="text-sm text-gray-400 hover:text-gray-700 mb-4 inline-flex items-center gap-1"
      >
        ← Products
      </button>

      <h1 className="text-xl font-semibold text-gray-900 mb-1">{item.item_name}</h1>
      <p className="text-xs text-gray-400 font-mono mb-6">{item.name}</p>

      <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
        <Field label="Group" value={item.item_group} />
        <Field label="UOM" value={item.stock_uom} />
        <Field label="Product Code" value={item.cm_product_code} />
        <Field label="Supplier Code" value={item.cm_supplier_code} />
        <Field label="Family Code" value={item.cm_family_code} />
        {item.cm_tiles_per_box ? (
          <Field label="Tiles per Box" value={String(item.cm_tiles_per_box)} />
        ) : null}
      </div>

      {prices.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Prices</h2>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2 text-left">Price List</th>
                  <th className="px-4 py-2 text-right">Rate</th>
                  <th className="px-4 py-2 text-left">Valid From</th>
                  <th className="px-4 py-2 text-left">Valid Until</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {prices.map((p) => (
                  <tr key={p.name}>
                    <td className="px-4 py-2 text-gray-700">{p.price_list}</td>
                    <td className="px-4 py-2 text-right font-mono">
                      {fmt(p.price_list_rate, p.currency)}
                    </td>
                    <td className="px-4 py-2 text-gray-400">{p.valid_from ?? '—'}</td>
                    <td className="px-4 py-2 text-gray-400">{p.valid_upto ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
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
