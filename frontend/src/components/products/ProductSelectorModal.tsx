/**
 * ProductSelectorModal — search and pick a product (Item) to add as a document line.
 * TypeScript port of V2 ProductSelectorModal.jsx.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { frappe } from '../../api/frappe'
import { CM } from '../ui/CMClassNames'
import type { ItemRow } from '../sales/ItemsTable'

const ITEM_FIELDS = [
  'name',
  'item_code',
  'item_name',
  'item_group',
  'stock_uom',
  'description',
  'standard_rate',
  'cm_rrp_inc_vat',
  'cm_rrp_ex_vat',
  'cm_final_offer_inc_vat',
  'cm_final_offer_ex_vat',
  'cm_cost_ex_vat',
  'cm_vat_rate_percent',
  'cm_sqm_per_box',
  'cm_tiles_per_box',
  'cm_given_name',
  'disabled',
  'cm_product_type',
  'image',
]

interface FrappeItemRow {
  name: string
  item_code: string
  item_name: string
  item_group?: string
  stock_uom?: string
  description?: string
  standard_rate?: number
  cm_rrp_inc_vat?: number
  cm_rrp_ex_vat?: number
  cm_final_offer_inc_vat?: number
  cm_final_offer_ex_vat?: number
  cm_cost_ex_vat?: number
  cm_vat_rate_percent?: number
  cm_sqm_per_box?: number
  cm_tiles_per_box?: number
  cm_given_name?: string
  disabled?: boolean
  cm_product_type?: string
  image?: string
}

function mapToLine(item: FrappeItemRow): Partial<ItemRow> {
  const vatFactor = 1 + (item.cm_vat_rate_percent || 18) / 100
  const rrpInc = item.cm_rrp_inc_vat || 0
  const offerInc = item.cm_final_offer_inc_vat || item.standard_rate || 0
  const rrpEx = item.cm_rrp_ex_vat || (rrpInc > 0 ? Math.round((rrpInc / vatFactor) * 100) / 100 : 0)
  const offerEx =
    item.cm_final_offer_ex_vat || (offerInc > 0 ? Math.round((offerInc / vatFactor) * 100) / 100 : 0)
  return {
    item_code: item.item_code || item.name,
    item_name: item.cm_given_name || item.item_name || '',
    description: item.description || '',
    uom: item.stock_uom || 'Unit',
    rate: offerInc,
    cm_rrp_inc_vat: rrpInc,
    cm_rrp_ex_vat: rrpEx,
    cm_final_offer_inc_vat: offerInc,
    cm_final_offer_ex_vat: offerEx,
    cm_vat_rate_percent: item.cm_vat_rate_percent || 18,
    cm_effective_discount_percent: 0,
  }
}

function StockBadge({ qty }: { qty?: number }) {
  if (qty == null) return null
  if (qty <= 0) return <span className="text-[10px] text-gray-400">Out of stock</span>
  if (qty < 5) return <span className="text-[10px] text-amber-600 font-medium">Low stock · {qty}</span>
  return <span className="text-[10px] text-emerald-600 font-medium">In stock · {qty}</span>
}

function ProductCard({
  item,
  stockQty,
  onSelect,
}: {
  item: FrappeItemRow
  stockQty?: number
  onSelect: (line: Partial<ItemRow>) => void
}) {
  const displayName = item.cm_given_name || item.item_name || item.name
  const offerVal = item.cm_final_offer_inc_vat || item.standard_rate
  const offer = offerVal ? `€${Number(offerVal).toFixed(2)}` : null
  const rrp = item.cm_rrp_inc_vat ? `€${Number(item.cm_rrp_inc_vat).toFixed(2)}` : null

  return (
    <button
      type="button"
      className="w-full text-left p-3 rounded border border-gray-200 hover:border-cm-green hover:bg-green-50 transition-colors"
      onClick={() => onSelect(mapToLine(item))}
    >
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0 w-12 h-12 rounded bg-gray-100 overflow-hidden">
          {item.image ? (
            <img src={item.image} alt="" className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300 text-xl">
              🏷️
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900 truncate">{displayName}</div>
            <div className="text-[11px] text-gray-500 truncate">{item.item_code}</div>
            {item.item_group && (
              <div className="text-[10px] text-gray-400 mt-0.5">{item.item_group}</div>
            )}
          </div>
          <div className="flex-shrink-0 text-right">
            {offer && <div className="text-sm font-bold text-cm-green">{offer}</div>}
            {rrp && offer !== rrp && (
              <div className="text-[11px] text-gray-400 line-through">{rrp}</div>
            )}
            <div className="mt-0.5">
              <StockBadge qty={stockQty} />
            </div>
          </div>
        </div>
      </div>
    </button>
  )
}

interface ProductSelectorModalProps {
  isOpen: boolean
  onSelect: (line: Partial<ItemRow>) => void
  onClose: () => void
}

export function ProductSelectorModal({ isOpen, onSelect, onClose }: ProductSelectorModalProps) {
  const [q, setQ] = useState('')
  const [itemGroup, setItemGroup] = useState('')
  const [groups, setGroups] = useState<string[]>([])
  const [rows, setRows] = useState<FrappeItemRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAllTypes, setShowAllTypes] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadGroups = useCallback(async (allTypes: boolean) => {
    try {
      const filters: any[][] = [
        ['disabled', '=', 0],
        ['cm_hidden_from_catalogue', '=', 0],
      ]
      if (!allTypes) filters.push(['cm_product_type', '=', 'Primary'])
      const data = await frappe.call('frappe.client.get_list', {
        doctype: 'Item',
        fields: ['item_group'],
        filters,
        distinct: 1,
        limit_page_length: 500,
        order_by: 'item_group asc',
      })
      const names = Array.isArray(data)
        ? [...new Set(data.map((r: any) => r.item_group).filter(Boolean))].sort()
        : []
      setGroups(names as string[])
    } catch {
      /* ignore */
    }
  }, [])

  const doSearch = useCallback(async (searchQ: string, group: string, allTypes: boolean) => {
    setLoading(true)
    setError(null)
    try {
      const filters: any[][] = [['disabled', '=', 0]]
      if (group) filters.push(['item_group', '=', group])
      if (!allTypes) filters.push(['cm_product_type', '=', 'Primary'])

      let data: FrappeItemRow[]
      if (searchQ.trim()) {
        data = await frappe.call('frappe.client.get_list', {
          doctype: 'Item',
          fields: ITEM_FIELDS,
          or_filters: [
            ['item_code', 'like', `%${searchQ}%`],
            ['item_name', 'like', `%${searchQ}%`],
            ['cm_given_name', 'like', `%${searchQ}%`],
          ],
          filters,
          limit_page_length: 40,
          order_by: 'item_name asc',
        })
      } else {
        data = await frappe.getList('Item', {
          fields: ITEM_FIELDS,
          filters,
          limit: 40,
          order_by: 'item_name asc',
        })
      }
      setRows(Array.isArray(data) ? data : [])
    } catch (err: any) {
      setError(err.message || 'Search failed')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) {
      setQ('')
      setRows([])
      setError(null)
      setShowAllTypes(false)
      return
    }
    setTimeout(() => inputRef.current?.focus(), 50)
    doSearch('', '', false)
    loadGroups(false)
  }, [isOpen, doSearch, loadGroups])

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQ(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(val, itemGroup, showAllTypes), 300)
  }

  const handleGroupChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const g = e.target.value
    setItemGroup(g)
    doSearch(q, g, showAllTypes)
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
      return
    }
    if (e.key === 'Enter' && rows.length > 0) {
      onSelect(mapToLine(rows[0]))
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-gray-700 flex-shrink-0">Add Product</span>
            <input
              ref={inputRef}
              className={CM.input}
              value={q}
              onChange={handleInput}
              onKeyDown={handleKey}
              placeholder="Search by code, name, or description…"
              autoComplete="off"
            />
            <button className={CM.btn.ghost + ' flex-shrink-0'} onClick={onClose}>
              ✕
            </button>
          </div>
          <div className="flex gap-2 items-center">
            <select className={CM.select + ' flex-1'} value={itemGroup} onChange={handleGroupChange}>
              <option value="">All categories</option>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <button
              className={[
                CM.btn.ghost,
                'text-xs px-2',
                showAllTypes ? 'bg-amber-50 text-amber-700 border-amber-300' : '',
              ].join(' ')}
              onClick={() => {
                const next = !showAllTypes
                setShowAllTypes(next)
                doSearch(q, itemGroup, next)
                loadGroups(next)
              }}
              title={showAllTypes ? 'Showing all product types' : 'Showing Primary products'}
            >
              {showAllTypes ? 'All Types' : 'Primary'}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 rounded-full border-2 border-cm-green border-t-transparent animate-spin" />
            </div>
          )}
          {error && <div className="text-sm text-red-600 px-1">{error}</div>}
          {!loading && rows.length === 0 && !error && (
            <div className="text-sm text-gray-400 text-center py-6">No products found.</div>
          )}
          {rows.map((item) => (
            <ProductCard key={item.name} item={item} onSelect={onSelect} />
          ))}
        </div>
      </div>
    </div>
  )
}
