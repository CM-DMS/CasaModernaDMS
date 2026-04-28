/**
 * SalesSearchScreen — cross-doctype sales document search.
 * Route: /sales/search
 */
import { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import { CM } from '../../components/ui/CMClassNames'

const DOC_ROUTES: Record<string, string> = {
  'Quotation':      '/sales/quotations',
  'Sales Order':    '/sales/orders',
  'Delivery Note':  '/sales/delivery-notes',
  'Sales Invoice':  '/sales/invoices',
}

const DOC_ICONS: Record<string, string> = {
  'Quotation':      '📋',
  'Sales Order':    '🛒',
  'Delivery Note':  '📦',
  'Sales Invoice':  '🧾',
}

const STATUS_COLOUR: Record<number, string> = {
  0: 'bg-amber-100 text-amber-800',
  1: 'bg-blue-100 text-blue-800',
  2: 'bg-red-100 text-red-700',
}

const ALL_TYPES = ['Quotation', 'Sales Order', 'Delivery Note', 'Sales Invoice']

interface SalesRow {
  name: string
  customer_name: string
  docstatus: number
  modified: string
  grand_total: number
  status: string
  doctype: string
}

async function searchDoctype(doctype: string, q: string): Promise<SalesRow[]> {
  const filters: [string, string, string][] = q.trim() ? [['name', 'like', `%${q}%`]] : []
  const data = await frappe.getList<SalesRow>(doctype, {
    fields: ['name', 'customer_name', 'docstatus', 'modified', 'grand_total', 'status'],
    filters,
    limit: 20,
    order_by: 'modified desc',
  })
  return (Array.isArray(data) ? data : []).map((r) => ({ ...r, doctype }))
}

export function SalesSearchScreen() {
  const [q,          setQ]          = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [rows,       setRows]       = useState<SalesRow[]>([])
  const [searching,  setSearching]  = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const navigate    = useNavigate()

  const doSearch = useCallback(async (query: string, typeF: string) => {
    setSearching(true)
    setError(null)
    try {
      const types = typeF ? [typeF] : ALL_TYPES
      const results = await Promise.allSettled(types.map((dt) => searchDoctype(dt, query)))
      const merged = results.flatMap((r) => r.status === 'fulfilled' ? r.value : [])
      merged.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime())
      setRows(merged)
    } catch (err) {
      setError((err as Error).message || 'Search failed')
    } finally {
      setSearching(false)
    }
  }, [])

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQ(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(val, typeFilter), 350)
  }

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const t = e.target.value
    setTypeFilter(t)
    doSearch(q, t)
  }

  const handleOpen = (row: SalesRow) => {
    const base = DOC_ROUTES[row.doctype]
    if (base) navigate(`${base}/${encodeURIComponent(row.name)}`)
  }

  return (
    <div className="p-3 space-y-3 max-w-3xl mx-auto">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-gray-800 flex-shrink-0">Sales Search</h2>
        <input
          className={CM.input}
          value={q}
          onChange={handleInput}
          placeholder="Search document name, customer…"
          autoFocus
        />
        <select className={`${CM.select} w-44 flex-shrink-0`} value={typeFilter} onChange={handleTypeChange}>
          <option value="">All types</option>
          {ALL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      {searching && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <div className="h-4 w-4 rounded-full border-2 border-cm-green border-t-transparent animate-spin" />
          Searching…
        </div>
      )}

      {!searching && rows.length === 0 && q && (
        <div className="text-sm text-gray-400 text-center py-6">No results found for "{q}".</div>
      )}

      {!searching && rows.length === 0 && !q && (
        <div className="text-sm text-gray-400 text-center py-8">Type to search across all sales documents.</div>
      )}

      <div className="space-y-1.5">
        {rows.map((row) => (
          <button
            key={`${row.doctype}:${row.name}`}
            type="button"
            className="w-full text-left px-3 py-2.5 rounded-lg border border-gray-200 hover:border-cm-green hover:bg-green-50 transition-colors"
            onClick={() => handleOpen(row)}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base flex-shrink-0">{DOC_ICONS[row.doctype] || '📄'}</span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-800 truncate">{row.name}</div>
                  <div className="text-[11px] text-gray-500 truncate">{row.customer_name || '—'}</div>
                </div>
              </div>
              <div className="flex-shrink-0 flex flex-col items-end gap-1">
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_COLOUR[row.docstatus] ?? 'bg-gray-100 text-gray-600'}`}>
                  {row.status || (['Draft', 'Submitted', 'Cancelled'][row.docstatus] ?? 'Unknown')}
                </span>
                {row.grand_total > 0 && (
                  <span className="text-[11px] font-medium text-gray-700">
                    €{Number(row.grand_total).toLocaleString('en', { minimumFractionDigits: 2 })}
                  </span>
                )}
                <span className="text-[10px] text-gray-400">{row.doctype}</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
