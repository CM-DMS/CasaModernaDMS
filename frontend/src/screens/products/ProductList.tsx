/**
 * ProductList — full-featured product catalogue browser (V3).
 *
 * Features:
 *   - Grid / List view toggle
 *   - Infinite scroll via IntersectionObserver
 *   - URL-state sync (q, groups, brand, sort, inactive, hidden, instock, minp, maxp)
 *   - Recent searches dropdown (localStorage)
 *   - Compare up to 4 products (CompareBar + CompareModal)
 *   - Bulk hide / unhide / toggle inactive (BulkActionBar)
 *   - Keyboard shortcut `/` focuses search
 *   - CSV export of current filtered results
 *   - Import button → ProductCsvImportModal
 */
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type KeyboardEvent,
} from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import { productsApi } from '../../api/products'
import type { CMProductRow } from '../../api/products'
import { usePermissions } from '../../auth/PermissionsProvider'
import { CM } from '../../components/ui/CMClassNames'
import { CMButton } from '../../components/ui/CMComponents'
import { PageHeader } from '../../components/shared/ui'
import { fmtMoneySmart, fmtMoneyWhole, fmtDiscountUI } from '../../utils/pricing'
import { ProductCsvImportModal } from './ProductCsvImportModal'

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 48
const COMPARE_MAX = 4
const RECENT_SEARCHES_KEY = 'cm:product-recent-searches'
const MAX_RECENT = 8

const SORT_OPTIONS = [
  { value: 'cm_given_name:asc', label: 'Name A → Z' },
  { value: 'cm_given_name:desc', label: 'Name Z → A' },
  { value: 'name:asc', label: 'Product Code' },
  { value: 'creation:desc', label: 'Recently Added' },
  { value: 'cm_offer_tier1_inc_vat:asc', label: 'Price Low → High' },
  { value: 'cm_offer_tier1_inc_vat:desc', label: 'Price High → Low' },
  { value: 'free_stock:desc', label: 'Stock (High)' },
]

// ── Utility helpers ───────────────────────────────────────────────────────────

function getRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}
function pushRecent(q: string) {
  if (!q.trim()) return
  const prev = getRecent().filter((r) => r !== q)
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify([q, ...prev].slice(0, MAX_RECENT)))
}
function clearRecent() {
  localStorage.removeItem(RECENT_SEARCHES_KEY)
}

function csvEscape(v: unknown): string {
  const s = String(v ?? '')
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
  return s
}
function downloadCsv(rows: CMProductRow[], filename: string) {
  const headers = [
    'name', 'item_name', 'cm_given_name', 'item_group', 'cm_supplier_name',
    'cm_offer_tier1_inc_vat', 'cm_rrp_inc_vat', 'cm_offer_tier1_discount_pct', 'free_stock',
  ]
  const lines = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => csvEscape((r as Record<string, unknown>)[h])).join(',')),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Highlight({ text, query }: { text?: string; query: string }) {
  if (!text) return <span>—</span>
  if (!query.trim()) return <span>{text}</span>
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(${escaped})`, 'gi')
  const parts = text.split(re)
  return (
    <span>
      {parts.map((p, i) =>
        re.test(p) ? (
          <mark key={i} className="bg-yellow-100 text-yellow-900 rounded-sm px-0.5">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  )
}

function StockIndicator({ freeStock }: { freeStock?: number }) {
  const q = Number(freeStock ?? 0)
  if (q > 10) return <span className="h-2 w-2 rounded-full bg-green-500 inline-block" title="In stock" />
  if (q > 0) return <span className="h-2 w-2 rounded-full bg-amber-400 inline-block" title="Low stock" />
  return <span className="h-2 w-2 rounded-full bg-red-400 inline-block" title="Out of stock" />
}

interface ProductCardProps {
  item: CMProductRow
  query: string
  selected: boolean
  onCompareToggle: (code: string) => void
  canCompare: boolean
}

function ProductCard({ item, query, selected, onCompareToggle, canCompare }: ProductCardProps) {
  const navigate = useNavigate()
  const displayName = item.cm_given_name || item.item_name || item.name
  const offerIncVat = item.cm_offer_tier1_inc_vat
  const rrpIncVat = item.cm_rrp_inc_vat
  const freeStock = item.free_stock

  return (
    <div
      className={`group relative flex flex-col rounded-xl border bg-white hover:shadow-md transition-all cursor-pointer overflow-hidden ${selected ? 'ring-2 ring-cm-green border-cm-green' : 'border-gray-200 hover:border-gray-300'}`}
      onClick={() => navigate(`/products/${encodeURIComponent(item.name)}`)}
    >
      <div className="relative bg-gray-50 aspect-square overflow-hidden">
        <div className="w-full h-full flex items-center justify-center text-gray-200 text-4xl">🖼</div>
        {item.disabled ? (
          <span className="absolute top-2 left-2 bg-gray-800 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded">INACTIVE</span>
        ) : item.cm_hidden_from_catalogue ? (
          <span className="absolute top-2 left-2 bg-amber-600 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded">HIDDEN</span>
        ) : null}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onCompareToggle(item.name) }}
          disabled={!selected && !canCompare}
          className={[
            'absolute bottom-2 right-2 rounded-full text-[10px] font-semibold px-2 py-1 border transition-colors',
            selected ? 'bg-cm-green text-white border-cm-green'
              : canCompare ? 'bg-white text-gray-600 border-gray-300 hover:border-cm-green opacity-0 group-hover:opacity-100'
              : 'bg-gray-100 text-gray-300 border-gray-200 cursor-not-allowed opacity-0 group-hover:opacity-100',
          ].join(' ')}
        >
          {selected ? '✓ Compare' : 'Compare'}
        </button>
      </div>
      <div className="flex flex-col flex-1 p-3 gap-1">
        <div className="text-[11px] text-gray-400 font-mono truncate">{item.name}</div>
        <div className="text-sm font-medium text-gray-900 line-clamp-2 leading-snug">
          <Highlight text={displayName} query={query} />
        </div>
        {item.item_group && <div className="text-[11px] text-gray-400 mt-auto pt-1">{item.item_group}</div>}
        <div className="flex items-center justify-between mt-1">
          <div>
            {offerIncVat != null && offerIncVat > 0 ? (
              <div className="text-base font-bold text-cm-green">
                {fmtMoneyWhole(offerIncVat)}
                <span className="text-[10px] font-normal text-gray-400 ml-1">incl. VAT</span>
              </div>
            ) : null}
            {rrpIncVat != null && rrpIncVat > 0 && offerIncVat != null && offerIncVat < rrpIncVat ? (
              <div className="text-[11px] text-gray-400 line-through">{fmtMoneySmart(rrpIncVat)}</div>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5">
            <StockIndicator freeStock={freeStock} />
            {freeStock != null && <span className="text-[11px] text-gray-500 tabular-nums">{freeStock}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

interface ProductRowProps {
  item: CMProductRow
  query: string
  selected: boolean
  onCompareToggle: (code: string) => void
  canCompare: boolean
  canHide: boolean
  onHideToggle?: (code: string, hidden: boolean) => void
}

function ProductRow({ item, query, selected, onCompareToggle, canCompare, canHide, onHideToggle }: ProductRowProps) {
  const navigate = useNavigate()
  const displayName = item.cm_given_name || item.item_name || item.name

  return (
    <tr
      className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${selected ? 'bg-green-50' : ''}`}
      onClick={() => navigate(`/products/${encodeURIComponent(item.name)}`)}
    >
      <td className="py-2.5 pl-3 pr-2 w-8" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          disabled={!selected && !canCompare}
          onChange={() => onCompareToggle(item.name)}
          className="accent-cm-green cursor-pointer"
        />
      </td>
      <td className="py-2.5 pr-3">
        <div className="text-[11px] text-gray-400 font-mono">{item.name}</div>
        <div className="text-sm font-medium text-gray-900">
          <Highlight text={displayName} query={query} />
        </div>
      </td>
      <td className="py-2.5 pr-3 text-[12px] text-gray-500">{item.item_group}</td>
      <td className="py-2.5 pr-3 text-[12px] text-gray-500">{item.cm_supplier_name}</td>
      <td className="py-2.5 pr-3 text-right tabular-nums text-sm font-semibold text-cm-green">
        {item.cm_offer_tier1_inc_vat ? fmtMoneyWhole(item.cm_offer_tier1_inc_vat) : '—'}
      </td>
      <td className="py-2.5 pr-3 text-right tabular-nums text-[12px] text-gray-400">
        {item.cm_offer_tier1_discount_pct ? fmtDiscountUI(item.cm_offer_tier1_discount_pct) : '—'}
      </td>
      <td className="py-2.5 pr-3">
        <div className="flex items-center gap-1.5">
          <StockIndicator freeStock={item.free_stock} />
          <span className="text-[11px] text-gray-500 tabular-nums">{item.free_stock ?? '—'}</span>
        </div>
      </td>
      {canHide && (
        <td className="py-2.5 pr-3 text-center" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => onHideToggle?.(item.name, !item.cm_hidden_from_catalogue)}
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${
              item.cm_hidden_from_catalogue
                ? 'text-amber-700 border-amber-300 bg-amber-50 hover:bg-amber-100'
                : 'text-gray-500 border-gray-200 bg-white hover:bg-gray-50'
            }`}
          >
            {item.cm_hidden_from_catalogue ? 'Hidden' : 'Visible'}
          </button>
        </td>
      )}
    </tr>
  )
}

interface CompareModalProps {
  items: CMProductRow[]
  onClose: () => void
  onRemove: (code: string) => void
}

function CompareModal({ items, onClose, onRemove }: CompareModalProps) {
  const navigate = useNavigate()
  const FIELDS: { key: keyof CMProductRow; label: string; fmt?: (v: unknown) => string }[] = [
    { key: 'name', label: 'Product Code' },
    { key: 'item_group', label: 'Item Group' },
    { key: 'cm_supplier_name', label: 'Supplier' },
    { key: 'cm_rrp_inc_vat', label: 'RRP incl. VAT', fmt: (v) => (v ? fmtMoneySmart(Number(v)) : '—') },
    { key: 'cm_offer_tier1_inc_vat', label: 'Offer incl. VAT', fmt: (v) => (v ? fmtMoneyWhole(Number(v)) : '—') },
    { key: 'cm_offer_tier1_discount_pct', label: 'Discount', fmt: (v) => (v ? fmtDiscountUI(Number(v)) : '—') },
    { key: 'free_stock', label: 'Free Stock', fmt: (v) => String(v ?? '—') },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8 px-4" onClick={onClose}>
      <div className="w-full max-w-4xl bg-white rounded-xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Compare Products ({items.length})</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="w-32 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400 bg-gray-50" />
                {items.map((item) => (
                  <th key={item.name} className="px-4 py-3 text-left min-w-[160px]">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => navigate(`/products/${encodeURIComponent(item.name)}`)}
                        className="text-sm font-medium text-gray-900 hover:text-cm-green text-left leading-snug"
                      >
                        {item.cm_given_name || item.item_name}
                      </button>
                      <button type="button" onClick={() => onRemove(item.name)} className="text-gray-300 hover:text-red-500 shrink-0 mt-0.5">✕</button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FIELDS.map((f) => (
                <tr key={f.key} className="border-t border-gray-100">
                  <td className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 bg-gray-50">{f.label}</td>
                  {items.map((item) => {
                    const raw = item[f.key as keyof CMProductRow]
                    const display = f.fmt ? f.fmt(raw) : String(raw ?? '—')
                    return <td key={item.name} className="px-4 py-2.5 text-gray-800">{display}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end px-5 py-4 border-t border-gray-100">
          <CMButton variant="ghost" onClick={onClose}>Close</CMButton>
        </div>
      </div>
    </div>
  )
}

interface CompareBarProps {
  items: CMProductRow[]
  onRemove: (code: string) => void
  onCompare: () => void
  onClear: () => void
}

function CompareBar({ items, onRemove, onCompare, onClear }: CompareBarProps) {
  if (items.length === 0) return null
  return (
    <div className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center gap-3 flex-wrap">
        <span className="text-xs font-semibold text-gray-500 shrink-0">Compare ({items.length}/{COMPARE_MAX}):</span>
        <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
          {items.map((item) => (
            <span key={item.name} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-[12px] font-medium px-2 py-1 rounded-full max-w-xs truncate">
              <span className="truncate">{item.cm_given_name || item.name}</span>
              <button type="button" onClick={() => onRemove(item.name)} className="text-gray-400 hover:text-red-500 ml-0.5 shrink-0">✕</button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={onClear} className="text-xs text-gray-400 hover:text-gray-600 underline">Clear</button>
          <CMButton onClick={onCompare} disabled={items.length < 2}>Compare {items.length} products</CMButton>
        </div>
      </div>
    </div>
  )
}

interface BulkActionBarProps {
  selected: string[]
  onHide: () => void
  onUnhide: () => void
  onDeactivate: () => void
  onActivate: () => void
  busy: boolean
}

function BulkActionBar({ selected, onHide, onUnhide, onDeactivate, onActivate, busy }: BulkActionBarProps) {
  if (selected.length === 0) return null
  return (
    <div className="flex items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm flex-wrap">
      <span className="font-medium text-indigo-700">{selected.length} selected</span>
      <button type="button" onClick={onHide} disabled={busy} className={CM.btn.ghost + ' text-xs py-1 px-2'}>Hide from Catalogue</button>
      <button type="button" onClick={onUnhide} disabled={busy} className={CM.btn.ghost + ' text-xs py-1 px-2'}>Show in Catalogue</button>
      <button type="button" onClick={onDeactivate} disabled={busy} className={CM.btn.ghost + ' text-xs py-1 px-2'}>Deactivate</button>
      <button type="button" onClick={onActivate} disabled={busy} className={CM.btn.ghost + ' text-xs py-1 px-2'}>Activate</button>
      {busy && <div className="h-4 w-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin shrink-0" />}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function ProductList() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { can } = usePermissions()

  const canEditProduct = can('canEditProduct') || can('canAdmin')
  const canAdmin = can('canAdmin')
  const canHide = canEditProduct || canAdmin

  // URL-backed filter state
  const [q, setQ] = useState(searchParams.get('q') ?? '')
  const [selectedGroups, setSelectedGroups] = useState<string[]>(() => {
    try { return JSON.parse(searchParams.get('groups') ?? '[]') as string[] } catch { return [] }
  })
  const [supplierName, setSupplierName] = useState(searchParams.get('supplier') ?? '')
  const [sort, setSort] = useState(searchParams.get('sort') ?? 'cm_given_name:asc')
  const [showInactive, setShowInactive] = useState(searchParams.get('inactive') === '1')
  const [showHidden, setShowHidden] = useState(searchParams.get('hidden') === '1')
  const [inStockOnly, setInStockOnly] = useState(searchParams.get('instock') === '1')
  const [minPrice, setMinPrice] = useState(searchParams.get('minp') ?? '')
  const [maxPrice, setMaxPrice] = useState(searchParams.get('maxp') ?? '')
  // Sync URL on filter changes
  useEffect(() => {
    const p: Record<string, string> = {}
    if (q) p['q'] = q
    if (selectedGroups.length > 0) p['groups'] = JSON.stringify(selectedGroups)
    if (supplierName) p['supplier'] = supplierName
    if (sort !== 'cm_given_name:asc') p['sort'] = sort
    if (showInactive) p['inactive'] = '1'
    if (showHidden) p['hidden'] = '1'
    if (inStockOnly) p['instock'] = '1'
    if (minPrice) p['minp'] = minPrice
    if (maxPrice) p['maxp'] = maxPrice
    setSearchParams(p, { replace: true })
  }, [q, selectedGroups, supplierName, sort, showInactive, showHidden, inStockOnly, minPrice, maxPrice, setSearchParams])

  // UI state
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [items, setItems] = useState<CMProductRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [groups, setGroups] = useState<string[]>([])
  const [suppliers, setSuppliers] = useState<string[]>([])
  const [compareSet, setCompareSet] = useState<Set<string>>(new Set())
  const [compareItems, setCompareItems] = useState<CMProductRow[]>([])
  const [showCompare, setShowCompare] = useState(false)
  const [bulkSelected, setBulkSelected] = useState<string[]>([])
  const [bulkBusy, setBulkBusy] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showRecent, setShowRecent] = useState(false)
  const [recentSearches, setRecentSearches] = useState<string[]>(getRecent)
  const [showGroupsDropdown, setShowGroupsDropdown] = useState(false)

  const searchInputRef = useRef<HTMLInputElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadingRef = useRef(false)
  const offsetRef = useRef(0)

  // Load groups + brands
  useEffect(() => {
    productsApi.getGroups().then(setGroups).catch(() => {})
    productsApi.getSuppliers().then(setSuppliers).catch(() => {})
  }, [])

  // Fetch products
  const fetchProducts = useCallback(async (append: boolean, currentOffset: number) => {
    if (loadingRef.current && append) return
    loadingRef.current = true
    if (!append) setLoading(true)
    setError(null)

    const [sortBy, sortDir] = sort.split(':') as [string, string]
    try {
      const result = await productsApi.search({
        q,
        itemGroups: selectedGroups.length > 0 ? selectedGroups : undefined,
        supplierName: supplierName || undefined,
        disabled: showInactive ? undefined : 0,
        showHidden: showHidden ? true : undefined,
        sortBy,
        sortDir: (sortDir as 'asc' | 'desc') || 'asc',
        limit: PAGE_SIZE,
        offset: currentOffset,
        inStockOnly: inStockOnly ? true : undefined,
        minPrice: minPrice ? Number(minPrice) : undefined,
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
      })
      const list = result.rows ?? []
      setItems((prev) => (append ? [...prev, ...list] : list))
      setHasMore(list.length === PAGE_SIZE)
      offsetRef.current = currentOffset + list.length
      setOffset(currentOffset + list.length)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [q, selectedGroups, supplierName, sort, showInactive, showHidden, inStockOnly, minPrice, maxPrice])

  // Reset + fetch on filter change
  useEffect(() => {
    offsetRef.current = 0
    setOffset(0)
    setItems([])
    setHasMore(true)
    void fetchProducts(false, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, selectedGroups, supplierName, sort, showInactive, showHidden, inStockOnly, minPrice, maxPrice])

  // Infinite scroll
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !loadingRef.current) {
          void fetchProducts(true, offsetRef.current)
        }
      },
      { rootMargin: '200px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [hasMore, fetchProducts])

  // Keyboard shortcut `/`
  useEffect(() => {
    const handleKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as Element).tagName)) {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  // Compare helpers
  function toggleCompare(code: string) {
    const item = items.find((i) => i.name === code)
    setCompareSet((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else if (next.size < COMPARE_MAX) next.add(code)
      return next
    })
    setCompareItems((prev) => {
      if (prev.find((i) => i.name === code)) return prev.filter((i) => i.name !== code)
      if (!item || prev.length >= COMPARE_MAX) return prev
      return [...prev, item]
    })
  }

  // Bulk actions
  async function bulkSetField(field: string, value: unknown) {
    setBulkBusy(true)
    try {
      await Promise.all(
        bulkSelected.map((code) =>
          frappe.call('frappe.client.set_value', { doctype: 'CM Product', name: code, fieldname: field, value }),
        ),
      )
      setItems((prev) =>
        prev.map((i) => bulkSelected.includes(i.name) ? ({ ...i, [field]: value } as CMProductRow) : i),
      )
      setBulkSelected([])
    } catch { /* silent */ }
    finally { setBulkBusy(false) }
  }

  async function handleHideToggle(code: string, hidden: boolean) {
    await frappe.call('frappe.client.set_value', {
      doctype: 'CM Product', name: code, fieldname: 'cm_hidden_from_catalogue', value: hidden ? 1 : 0,
    })
    setItems((prev) =>
      prev.map((i) => i.name === code ? ({ ...i, cm_hidden_from_catalogue: hidden ? 1 : 0 } as CMProductRow) : i),
    )
  }

  const filteredSuppliers = useMemo(
    () => (supplierName ? suppliers.filter((s) => s.toLowerCase().includes(supplierName.toLowerCase())) : suppliers),
    [suppliers, supplierName],
  )

  function handleSearchEnter(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && q.trim()) {
      pushRecent(q.trim())
      setRecentSearches(getRecent())
      setShowRecent(false)
    }
  }

  return (
    <div className={`space-y-4 ${compareItems.length > 0 ? 'pb-20' : ''}`}>
      <PageHeader
        title="Products"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {canEditProduct && (
              <button type="button" onClick={() => setShowImport(true)} className={CM.btn.ghost}>Import</button>
            )}
            <button
              type="button"
              onClick={() => downloadCsv(items, `products_${new Date().toISOString().slice(0, 10)}.csv`)}
              className={CM.btn.ghost}
            >
              Export CSV
            </button>
            {canEditProduct && (
              <CMButton onClick={() => navigate('/products/new')}>New Product</CMButton>
            )}
          </div>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-start">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <input
            ref={searchInputRef}
            type="search"
            placeholder="Search products… (/)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => { if (recentSearches.length > 0) setShowRecent(true) }}
            onBlur={() => setTimeout(() => setShowRecent(false), 150)}
            onKeyDown={handleSearchEnter}
            className={CM.input + ' w-full'}
          />
          {showRecent && recentSearches.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Recent searches</span>
                <button type="button" onClick={() => { clearRecent(); setRecentSearches([]); setShowRecent(false) }} className="text-[10px] text-red-400 hover:text-red-600">Clear</button>
              </div>
              {recentSearches.map((r) => (
                <button key={r} type="button" className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => { setQ(r); setShowRecent(false) }}>
                  {r}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Groups multi-filter */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowGroupsDropdown((v) => !v)}
            className={`${CM.btn.ghost} text-sm flex items-center gap-1`}
          >
            {selectedGroups.length > 0 ? `Groups (${selectedGroups.length})` : 'All Groups'}
            <span className="text-gray-400 text-xs">▾</span>
          </button>
          {showGroupsDropdown && (
            <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-10 overflow-hidden max-h-56 overflow-y-auto">
              <div className="px-3 py-1.5 border-b border-gray-100 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Item Groups</span>
                {selectedGroups.length > 0 && (
                  <button type="button" onClick={() => setSelectedGroups([])} className="text-[10px] text-red-400 hover:text-red-600">Clear</button>
                )}
              </div>
              {groups.map((g) => (
                <label key={g} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedGroups.includes(g)}
                    onChange={() =>
                      setSelectedGroups((prev) => prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g])
                    }
                    className="accent-cm-green"
                  />
                  <span className="text-sm text-gray-700">{g}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Supplier */}
        <select value={supplierName} onChange={(e) => setSupplierName(e.target.value)} className={CM.select + ' max-w-[160px]'}>
          <option value="">All Suppliers</option>
          {filteredSuppliers.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        {/* Price range */}
        <div className="flex items-center gap-1">
          <input type="number" placeholder="Min €" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} min="0" step="1" className={CM.input + ' w-20'} />
          <span className="text-gray-400 text-sm">–</span>
          <input type="number" placeholder="Max €" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} min="0" step="1" className={CM.input + ' w-20'} />
        </div>

        {/* Sort */}
        <select value={sort} onChange={(e) => setSort(e.target.value)} className={CM.select + ' max-w-[180px]'}>
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {/* Toggles */}
        <div className="flex items-center gap-3 text-sm">
          <label className="flex items-center gap-1.5 cursor-pointer select-none text-gray-600">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="accent-cm-green" />
            Inactive
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer select-none text-gray-600">
            <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} className="accent-cm-green" />
            Hidden
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer select-none text-gray-600">
            <input type="checkbox" checked={inStockOnly} onChange={(e) => setInStockOnly(e.target.checked)} className="accent-cm-green" />
            In Stock
          </label>
        </div>

        {/* View toggle */}
        <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden ml-auto">
          {(['grid', 'list'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={['px-2.5 py-1.5 text-sm border-r last:border-r-0 transition-colors', view === v ? 'bg-gray-700 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'].join(' ')}
            >
              {v === 'grid' ? '⊞' : '☰'}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk action bar */}
      {canHide && (
        <BulkActionBar
          selected={bulkSelected}
          onHide={() => void bulkSetField('cm_hidden_from_catalogue', 1)}
          onUnhide={() => void bulkSetField('cm_hidden_from_catalogue', 0)}
          onDeactivate={() => void bulkSetField('disabled', 1)}
          onActivate={() => void bulkSetField('disabled', 0)}
          busy={bulkBusy}
        />
      )}

      {/* Results count */}
      {!loading && items.length > 0 && (
        <p className="text-[11px] text-gray-400">
          {items.length} product{items.length === 1 ? '' : 's'}
          {sort && ` · sorted by ${SORT_OPTIONS.find((o) => o.value === sort)?.label ?? sort}`}
        </p>
      )}

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Grid view */}
      {view === 'grid' && items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {items.map((item) => (
            <ProductCard
              key={item.name}
              item={item}
              query={q}
              selected={compareSet.has(item.name)}
              onCompareToggle={toggleCompare}
              canCompare={compareSet.size < COMPARE_MAX}
            />
          ))}
        </div>
      )}

      {/* List view */}
      {view === 'list' && items.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="w-8 pl-3 py-2.5" />
                {['Product', 'Group', 'Brand', 'Offer', 'Disc.', 'Stock'].map((h, i) => (
                  <th key={h} className={`py-2.5 pr-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400 ${i >= 3 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
                {canHide && <th className="py-2.5 pr-3 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-400">Visibility</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <ProductRow
                  key={item.name}
                  item={item}
                  query={q}
                  selected={compareSet.has(item.name)}
                  onCompareToggle={toggleCompare}
                  canCompare={compareSet.size < COMPARE_MAX}
                  canHide={canHide}
                  onHideToggle={(code, hidden) => void handleHideToggle(code, hidden)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {!loading && items.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <span className="text-4xl">🔍</span>
          <p className="text-gray-500 font-medium">No products found</p>
          <p className="text-sm text-gray-400">Try a different search, group filter, or price range.</p>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && items.length === 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-100 bg-gray-50 animate-pulse aspect-[3/4]" />
          ))}
        </div>
      )}

      {/* Loading more */}
      {loading && items.length > 0 && (
        <div className="flex justify-center py-4">
          <div className="h-5 w-5 rounded-full border-2 border-cm-green border-t-transparent animate-spin" />
        </div>
      )}

      {/* Sentinel */}
      <div ref={sentinelRef} className="h-1" />

      {/* End of results */}
      {!loading && !hasMore && items.length > 0 && (
        <p className="text-center text-[11px] text-gray-300 py-2">All {items.length} products loaded</p>
      )}

      {/* Compare bar */}
      <CompareBar
        items={compareItems}
        onRemove={(code) => toggleCompare(code)}
        onCompare={() => setShowCompare(true)}
        onClear={() => { setCompareSet(new Set()); setCompareItems([]) }}
      />

      {/* Compare modal */}
      {showCompare && compareItems.length >= 2 && (
        <CompareModal items={compareItems} onClose={() => setShowCompare(false)} onRemove={(code) => toggleCompare(code)} />
      )}

      {/* Import modal */}
      {showImport && <ProductCsvImportModal onClose={() => setShowImport(false)} />}
    </div>
  )
}

