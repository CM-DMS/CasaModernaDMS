import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import { usePermissions } from '../../auth/PermissionsProvider'
import { CM } from '../../components/ui/CMClassNames'

interface Item {
  name: string
  item_name: string
  item_group: string
  stock_uom: string
  cm_product_code?: string
  cm_supplier_code?: string
}

const PAGE_SIZE = 48

export function ProductList() {
  const navigate = useNavigate()
  const { can } = usePermissions()
  const [searchParams, setSearchParams] = useSearchParams()

  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [total, setTotal] = useState(0)

  const search = searchParams.get('q') ?? ''
  const page = Number(searchParams.get('page') ?? '1')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const filters: Array<[string, string, string, string]> = search
        ? [['item_name', 'like', `%${search}%`, '']]
        : []

      const [rows, countRes] = await Promise.all([
        frappe.getList<Item>('Item', {
          fields: ['name', 'item_name', 'item_group', 'stock_uom', 'cm_product_code', 'cm_supplier_code'],
          filters: filters.length ? filters : undefined,
          limit: PAGE_SIZE,
          limit_start: (page - 1) * PAGE_SIZE,
          order_by: 'item_name asc',
        }),
        frappe.callGet<{ count: number }>('frappe.client.get_count', {
          doctype: 'Item',
          filters: filters.length ? JSON.stringify(filters) : '[]',
        }).catch(() => ({ count: 0 })),
      ])
      setItems(rows)
      setTotal(countRes.count ?? rows.length)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load products')
    } finally {
      setLoading(false)
    }
  }, [search, page])

  useEffect(() => {
    void load()
  }, [load])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900">Products</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">{total.toLocaleString()} items</span>
          {(can('canEditProduct') || can('canAdmin')) && (
            <button
              className={CM.btn.primary}
              onClick={() => navigate('/products/new')}
            >
              + New Product
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="search"
          value={search}
          onChange={(e) =>
            setSearchParams(e.target.value ? { q: e.target.value, page: '1' } : { page: '1' })
          }
          placeholder="Search by name…"
          className="w-full max-w-sm px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cm-green"
        />
      </div>

      {loading && <p className="text-sm text-gray-400 animate-pulse">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && (
        <>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2 text-left">Code</th>
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-left">Group</th>
                  <th className="px-4 py-2 text-left">UOM</th>
                  <th className="px-4 py-2 text-left">Supplier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item) => (
                  <tr
                    key={item.name}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => navigate(`/products/${encodeURIComponent(item.name)}`)}
                  >
                    <td className="px-4 py-2 font-mono text-xs text-gray-500">
                      {item.cm_product_code ?? item.name}
                    </td>
                    <td className="px-4 py-2 text-gray-900">{item.item_name}</td>
                    <td className="px-4 py-2 text-gray-500">{item.item_group}</td>
                    <td className="px-4 py-2 text-gray-500">{item.stock_uom}</td>
                    <td className="px-4 py-2 text-gray-500">{item.cm_supplier_code ?? '—'}</td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                      No products found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
              <span>
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setSearchParams({ q: search, page: String(page - 1) })}
                  className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50"
                >
                  ← Prev
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setSearchParams({ q: search, page: String(page + 1) })}
                  className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
