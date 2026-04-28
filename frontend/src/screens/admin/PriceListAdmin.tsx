import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../../components/shared/ui'
import { CM } from '../../components/ui/CMClassNames'
import { usePermissions } from '../../auth/PermissionsProvider'
import { priceListsApi } from '../../api/priceLists'

const TYPE_BADGE_COLOUR: Record<string, string> = {
  'Night Collection':   'bg-indigo-100 text-indigo-800',
  'Lorella Collection': 'bg-purple-100 text-purple-800',
  'Topline Bedrooms':   'bg-blue-100   text-blue-800',
  'Sofa':               'bg-orange-100 text-orange-800',
  'Made-to-Order':      'bg-teal-100   text-teal-800',
  'Other':              'bg-gray-100   text-gray-700',
}

interface SupplierList {
  name: string
  cm_configurator_type: string
  currency: string
  enabled: number
  item_count: number
  kind: 'supplier' | 'matrix'
  pricing_docs: { name: string; configurator_type: string; valid_from: string; valid_to: string }[]
}

interface ItemPriceRow {
  name: string
  item_code: string
  item_name: string
  uom: string
  cm_weight_factor: number
  price_list_rate: number
}

function ConfiguratorTypeBadge({ type }: { type: string }) {
  const cls = TYPE_BADGE_COLOUR[type] ?? 'bg-gray-100 text-gray-700'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{type || '—'}</span>
  )
}

function PriceCell({ row, onSave }: { row: ItemPriceRow; onSave: (name: string, rate: number) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue]     = useState('')
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [err, setErr]         = useState<string | null>(null)
  const inputRef              = useRef<HTMLInputElement>(null)

  function startEdit() {
    setValue(String(row.price_list_rate ?? ''))
    setEditing(true)
    setErr(null)
    setSaved(false)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  async function commit() {
    const v = parseFloat(value)
    if (Number.isNaN(v) || v < 0) { setErr('Invalid'); return }
    if (v === row.price_list_rate) { setEditing(false); return }
    setSaving(true)
    setErr(null)
    try {
      await onSave(row.name, v)
      row.price_list_rate = v
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
    } catch (e: unknown) {
      setErr((e as Error).message || 'Error')
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <input ref={inputRef} type="number" min="0" step="0.01" value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
        disabled={saving}
        className="w-24 border border-cm-green rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-cm-green"
      />
    )
  }

  return (
    <button type="button" onClick={startEdit} title="Click to edit"
      className={`text-xs tabular-nums rounded px-1 py-0.5 text-left transition-colors
        ${saved ? 'bg-green-50 text-green-700' : 'text-gray-800 hover:bg-gray-100'}
        ${err ? 'text-red-600' : ''}`}>
      {err ? <span className="text-[10px] text-red-500">{err}</span> : `€${Number(row.price_list_rate ?? 0).toFixed(2)}`}
    </button>
  )
}

function ItemPricePanel({ supplierListName }: { supplierListName: string }) {
  const [data, setData]       = useState<{ rows: ItemPriceRow[]; total: number } | null>(null)
  const [loadingP, setLoadingP] = useState(false)
  const [search, setSearch]   = useState('')
  const [page, setPage]       = useState(1)
  const PAGE_SIZE             = 50
  const searchTimer           = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async (q: string, p: number) => {
    setLoadingP(true)
    try {
      const result = await priceListsApi.getSupplierItemPrices({ price_list: supplierListName, search: q, page: p, page_size: PAGE_SIZE })
      setData(result as { rows: ItemPriceRow[]; total: number })
    } finally {
      setLoadingP(false)
    }
  }, [supplierListName])

  useEffect(() => { load('', 1) }, [load])

  function handleSearch(val: string) {
    setSearch(val)
    setPage(1)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => load(val, 1), 300)
  }

  function goPage(p: number) { setPage(p); load(search, p) }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1

  return (
    <div className="border-t border-gray-100 px-5 pb-4 pt-3">
      <div className="mb-3 flex items-center gap-3">
        <input type="search" placeholder="Search item code or name…" value={search}
          onChange={(e) => handleSearch(e.target.value)} className={`${CM.input} max-w-xs`} />
        {data && <span className="text-xs text-gray-400">{data.total} item{data.total !== 1 ? 's' : ''}{search ? ` matching "${search}"` : ''}</span>}
        {loadingP && <span className="text-xs text-gray-400 animate-pulse">Loading…</span>}
      </div>
      {data && data.rows.length > 0 && (
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-500 w-36">Item Code</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500">Item Name</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500 w-16">UOM</th>
                <th className="px-3 py-2 text-right font-medium text-gray-500 w-20">Weight</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500 w-36">
                  Cost Price <span className="ml-1 font-normal text-gray-400">(click to edit)</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {data.rows.map((row) => (
                <tr key={row.name} className="hover:bg-gray-50">
                  <td className="px-3 py-1.5 font-mono text-[11px] text-gray-600">{row.item_code}</td>
                  <td className="px-3 py-1.5 text-gray-800">{row.item_name}</td>
                  <td className="px-3 py-1.5 text-gray-500">{row.uom}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                    {row.cm_weight_factor != null && row.cm_weight_factor > 0 ? Number(row.cm_weight_factor).toFixed(2) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-2 py-1">
                    <PriceCell row={row} onSave={(name, rate) => priceListsApi.updateSupplierItemPrice(name, rate).then(() => {})} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.rows.length === 0 && !loadingP && (
        <p className="text-sm text-gray-400">{search ? 'No items match your search.' : 'No item prices in this list.'}</p>
      )}
      {totalPages > 1 && (
        <div className="mt-3 flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => goPage(page - 1)} className={CM.btn.secondary}>‹ Prev</button>
          <span className="text-xs text-gray-500">Page {page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => goPage(page + 1)} className={CM.btn.secondary}>Next ›</button>
        </div>
      )}
    </div>
  )
}

function MatrixPanel({ pricingDocs }: { pricingDocs: SupplierList['pricing_docs'] }) {
  const navigate = useNavigate()
  if (!pricingDocs || pricingDocs.length === 0) {
    return (
      <div className="border-t border-gray-100 px-5 py-4">
        <p className="text-sm text-gray-400">No pricing matrices attached.</p>
        <div className="mt-3">
          <button onClick={() => navigate('/admin/price-lists/new')} className={CM.btn.primary}>+ New Pricing Matrix</button>
        </div>
      </div>
    )
  }
  return (
    <div className="border-t border-gray-100 px-5 pb-4 pt-3">
      <div className="space-y-2">
        {pricingDocs.map((doc) => (
          <div key={doc.name} className="flex items-center justify-between rounded border border-gray-200 bg-gray-50 px-4 py-2.5">
            <div>
              <span className="text-sm font-medium text-gray-800">{doc.configurator_type}</span>
              <span className="ml-3 text-xs text-gray-400">{doc.name}</span>
              {(doc.valid_from || doc.valid_to) && (
                <span className="ml-3 text-xs text-gray-400">{doc.valid_from || '—'} → {doc.valid_to || 'ongoing'}</span>
              )}
            </div>
            <button onClick={() => navigate(`/admin/price-lists/${encodeURIComponent(doc.name)}`)} className={CM.btn.secondary}>
              Edit Matrix →
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export function PriceListAdmin() {
  const { can }  = usePermissions()
  const [allLists, setAllLists] = useState<SupplierList[]>([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [supplierLists, sellingLists] = await Promise.all([
        priceListsApi.listSupplierPriceLists(),
        priceListsApi.listPriceLists(),
      ])
      const buying = ((supplierLists ?? []) as SupplierList[]).map((sl) => ({ ...sl, kind: 'supplier' as const }))
      const selling = ((sellingLists ?? []) as SupplierList[])
        .filter((pl) => pl.pricing_docs && pl.pricing_docs.length > 0)
        .map((pl) => ({ ...pl, kind: 'matrix' as const, item_count: pl.pricing_docs.length }))
      const merged = [...buying, ...selling].sort((a, b) => a.name.localeCompare(b.name))
      setAllLists(merged)
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to load price lists.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (!can('canAdmin')) {
    return <div className="p-8 text-center text-gray-500">You do not have permission to manage price lists.</div>
  }

  return (
    <div>
      <PageHeader title="Price Lists" subtitle="Supplier cost prices used by the configurators. Click any price to edit it inline." />
      {error && <div className="mx-6 mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {loading && <div className="mx-6 mt-6 text-sm text-gray-500">Loading…</div>}
      {!loading && allLists.length === 0 && (
        <div className="mx-6 mt-12 text-center text-gray-400">
          <p className="text-base font-medium">No price lists found</p>
        </div>
      )}
      <div className="mx-6 mt-6 space-y-4">
        {allLists.map((sl) => (
          <div key={sl.name} className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <button type="button" onClick={() => setExpanded((ex) => ex === sl.name ? null : sl.name)}
              className="flex w-full items-center justify-between px-5 py-4 text-left">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-gray-900">{sl.name}</span>
                {sl.cm_configurator_type && <ConfiguratorTypeBadge type={sl.cm_configurator_type} />}
                {sl.kind === 'matrix' && (
                  <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700">RRP / matrix</span>
                )}
                {!sl.enabled && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">Disabled</span>
                )}
                <span className="text-xs text-gray-400">{sl.currency}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">
                  {sl.kind === 'matrix' ? `${sl.item_count} pricing matrix${sl.item_count !== 1 ? 'es' : ''}` : `${sl.item_count} items`}
                </span>
                <svg className={`h-4 w-4 text-gray-400 transition-transform ${expanded === sl.name ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>
            {expanded === sl.name && (
              sl.kind === 'matrix'
                ? <MatrixPanel pricingDocs={sl.pricing_docs} />
                : <ItemPricePanel supplierListName={sl.name} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
