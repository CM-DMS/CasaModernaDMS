/**
 * ItemsToOrder (Purchase Planner) — cross-SO view of all lines awaiting ordering.
 * Two sections: FREETEXT lines (need catalogue entry) and orderable lines grouped by supplier.
 * Route: /purchasing/items-to-order
 */
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import { usePermissions } from '../../auth/PermissionsProvider'
import { PageHeader, ErrorBox } from '../../components/shared/ui'

interface PurchaseLine {
  so_detail: string; so_name: string; customer_name: string
  item_code: string; item_name: string; description: string
  qty: number; uom: string; delivery_date: string
  supplier: string; line_type: string; cfg_summary: string; cm_fulfill_notes: string
}

function fmtDelivery(isoDate: string) {
  if (!isoDate) return '—'
  const [y, m] = isoDate.split('-')
  const month = new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-GB', { month: 'long' })
  return `End of ${month} ${y}`
}
function urgencyCls(isoDate: string) {
  if (!isoDate) return ''
  const days = (new Date(isoDate).getTime() - Date.now()) / 86_400_000
  if (days < 30) return 'text-red-600 font-semibold'
  if (days < 60) return 'text-amber-700'
  return 'text-gray-600'
}
function groupBySupplier(rows: PurchaseLine[]) {
  const map = new Map<string, PurchaseLine[]>()
  for (const row of rows) {
    const key = row.supplier || '— No Supplier —'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(row)
  }
  return [...map.entries()].sort(([a], [b]) => {
    if (a.startsWith('—')) return 1
    if (b.startsWith('—')) return -1
    return a.localeCompare(b)
  })
}

function FreetextTable({ rows, navigate }: { rows: PurchaseLine[]; navigate: (path: string) => void }) {
  if (!rows.length) return null
  return (
    <div className="border border-amber-200 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border-b border-amber-200">
        <span className="text-amber-600 text-sm">⚠</span>
        <span className="text-xs text-amber-800 font-medium">
          These lines have no product code. A catalogue entry must be created before a Purchase Order can be raised.
        </span>
      </div>
      <table className="min-w-full text-sm">
        <thead className="bg-white border-b border-amber-100">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Order / Customer</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Description</th>
            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Qty</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Delivery</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Notes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-amber-50">
          {rows.map(row => (
            <tr key={row.so_detail} className="hover:bg-amber-50/50">
              <td className="px-4 py-2.5">
                <button className="font-mono text-xs text-cm-green hover:underline block"
                  onClick={() => navigate(`/sales/orders/${encodeURIComponent(row.so_name)}/fulfillment`)}>
                  {row.so_name}
                </button>
                <span className="text-xs text-gray-500">{row.customer_name}</span>
              </td>
              <td className="px-4 py-2.5">
                <div className="font-medium text-gray-800 leading-snug">{row.item_name}</div>
                {row.description && row.description !== row.item_name && (
                  <div className="text-xs text-gray-400 truncate max-w-xs">{row.description}</div>
                )}
              </td>
              <td className="px-4 py-2.5 text-right text-gray-700 whitespace-nowrap">{row.qty} {row.uom}</td>
              <td className={`px-4 py-2.5 whitespace-nowrap text-sm ${urgencyCls(row.delivery_date)}`}>{fmtDelivery(row.delivery_date)}</td>
              <td className="px-4 py-2.5 text-xs text-amber-700 italic max-w-xs truncate">{row.cm_fulfill_notes || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SupplierGroup({
  supplierKey, supplierLabel, rows, selected, onToggleLine, onToggleAll, navigate, onCreatePo, creatingPo,
}: {
  supplierKey: string | null; supplierLabel: string; rows: PurchaseLine[]
  selected: Set<string>; onToggleLine: (id: string) => void; onToggleAll: (rows: PurchaseLine[], checked: boolean) => void
  navigate: (path: string) => void; onCreatePo: (key: string, rows: PurchaseLine[]) => void; creatingPo: string | null
}) {
  const [open, setOpen] = useState(true)
  const allSelected   = rows.every(r => selected.has(r.so_detail))
  const someSelected  = !allSelected && rows.some(r => selected.has(r.so_detail))
  const selectedCount = rows.filter(r => selected.has(r.so_detail)).length
  const hasSupplier   = !!supplierKey
  const isCreating    = creatingPo === supplierLabel

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 cursor-pointer select-none" onClick={() => setOpen(v => !v)}>
        <input type="checkbox" className="rounded" checked={allSelected}
          ref={(el) => { if (el) el.indeterminate = someSelected }}
          onChange={e => { e.stopPropagation(); onToggleAll(rows, e.target.checked) }}
          onClick={e => e.stopPropagation()} />
        <span className="flex-1 font-semibold text-sm text-gray-800">{supplierLabel}</span>
        <span className="text-xs text-gray-400">{rows.length} line{rows.length !== 1 ? 's' : ''}</span>
        {hasSupplier && selectedCount > 0 && !isCreating && (
          <button type="button"
            className="text-xs font-medium bg-cm-green hover:bg-green-700 text-white rounded px-3 py-1 transition-colors"
            onClick={e => { e.stopPropagation(); onCreatePo(supplierLabel, rows) }}>
            Create PO ({selectedCount})
          </button>
        )}
        {isCreating && <span className="text-xs text-gray-500 animate-pulse">Creating PO…</span>}
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <table className="min-w-full text-sm border-t border-gray-200">
          <thead className="bg-white">
            <tr className="border-b border-gray-100">
              <th className="w-8 px-4 py-2" />
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Order / Customer</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Item</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Qty</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Delivery</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map(row => (
              <tr key={row.so_detail}
                className={`hover:bg-gray-50 cursor-pointer ${selected.has(row.so_detail) ? 'bg-blue-50' : ''}`}
                onClick={() => onToggleLine(row.so_detail)}>
                <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                  <input type="checkbox" className="rounded" checked={selected.has(row.so_detail)} onChange={() => onToggleLine(row.so_detail)} />
                </td>
                <td className="px-3 py-2.5">
                  <button className="font-mono text-xs text-cm-green hover:underline block"
                    onClick={e => { e.stopPropagation(); navigate(`/sales/orders/${encodeURIComponent(row.so_name)}/fulfillment`) }}>
                    {row.so_name}
                  </button>
                  <span className="text-xs text-gray-500">{row.customer_name}</span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="font-medium text-gray-800 leading-snug">{row.item_name}</div>
                  {row.cfg_summary && <div className="text-xs text-blue-600">{row.cfg_summary}</div>}
                  {row.description && row.description !== row.item_name && (
                    <div className="text-xs text-gray-400 truncate max-w-xs">{row.description}</div>
                  )}
                  {row.cm_fulfill_notes && <div className="text-xs text-amber-700 italic mt-0.5">{row.cm_fulfill_notes}</div>}
                </td>
                <td className="px-3 py-2.5 text-right text-gray-700 whitespace-nowrap">{row.qty} {row.uom}</td>
                <td className={`px-3 py-2.5 whitespace-nowrap text-sm ${urgencyCls(row.delivery_date)}`}>{fmtDelivery(row.delivery_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export function ItemsToOrder() {
  const navigate = useNavigate()
  const { can }  = usePermissions()
  const [rows, setRows]         = useState<PurchaseLine[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [selected, setSelected] = useState(new Set<string>())
  const [marking, setMarking]   = useState(false)
  const [creatingPo, setCreating] = useState<string | null>(null)
  const [flash, setFlash]       = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [poResult, setPoResult] = useState<{ poName: string; poUrl: string } | null>(null)

  async function load() {
    setLoading(true); setError(null)
    try {
      const res = await frappe.call<PurchaseLine[]>('casamoderna_dms.so_fulfillment.get_items_to_order')
      setRows(res ?? []); setSelected(new Set())
    } catch (e: unknown) { setError((e as Error).message ?? 'Failed to load') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const freetextRows  = useMemo(() => rows.filter(r => r.line_type === 'FREETEXT'), [rows])
  const orderableRows = useMemo(() => rows.filter(r => r.line_type !== 'FREETEXT'), [rows])
  const groups        = useMemo(() => groupBySupplier(orderableRows), [orderableRows])

  function toggleLine(id: string) {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  function toggleAll(groupRows: PurchaseLine[], checked: boolean) {
    setSelected(prev => { const n = new Set(prev); for (const r of groupRows) checked ? n.add(r.so_detail) : n.delete(r.so_detail); return n })
  }

  async function handleMarkOrdered() {
    if (!selected.size) return
    setMarking(true); setFlash(null)
    try {
      const res = await frappe.call<{ updated: number }>(
        'casamoderna_dms.so_fulfillment.mark_to_order_placed',
        { so_details: JSON.stringify([...selected]) },
      )
      const count = res?.updated ?? selected.size
      setFlash({ type: 'ok', text: `${count} line${count !== 1 ? 's' : ''} marked as ordered.` })
      await load()
    } catch (e: unknown) { setFlash({ type: 'err', text: (e as Error).message ?? 'Failed' }) }
    finally { setMarking(false) }
  }

  async function handleCreatePo(supplierLabel: string, groupRows: PurchaseLine[]) {
    const selectedInGroup = groupRows.filter(r => selected.has(r.so_detail))
    if (!selectedInGroup.length) return
    const supplierKey = selectedInGroup[0].supplier
    setCreating(supplierLabel); setFlash(null)
    try {
      const res = await frappe.call<{ po_name: string; po_url: string }>(
        'casamoderna_dms.so_fulfillment.create_batch_po_from_so_items',
        { so_details: JSON.stringify(selectedInGroup.map(r => r.so_detail)), supplier: supplierKey },
      )
      setPoResult({ poName: res.po_name, poUrl: res.po_url })
      await load()
    } catch (e: unknown) { setFlash({ type: 'err', text: (e as Error).message ?? 'Failed to create PO' }) }
    finally { setCreating(null) }
  }

  if (!can('canAdmin') && !can('canPurchasing')) {
    return (
      <div className="p-6 text-sm text-gray-500">
        Only designated purchasing reviewers can access this screen.
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-0 space-y-4">
      <PageHeader title="Purchase Planner" />

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-1 py-2 flex-wrap border-b border-gray-200">
        <span className="text-sm text-gray-600">
          {orderableRows.length} line{orderableRows.length !== 1 ? 's' : ''} ready to order
          {freetextRows.length > 0 && <span className="ml-2 text-amber-600">· {freetextRows.length} needing catalogue entry</span>}
        </span>
        {selected.size > 0 ? (
          <>
            <span className="text-sm font-medium text-blue-700">{selected.size} selected</span>
            <button className="text-xs text-gray-500 hover:text-gray-800 underline" onClick={() => setSelected(new Set())}>Clear</button>
          </>
        ) : (
          <button className="text-xs text-gray-500 hover:text-gray-800 underline"
            disabled={orderableRows.length === 0}
            onClick={() => setSelected(new Set(orderableRows.map(r => r.so_detail)))}>
            Select all
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button className="text-xs border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-50" onClick={load} disabled={loading}>Refresh</button>
          <button
            disabled={selected.size === 0 || marking}
            className="text-sm font-medium bg-white border border-gray-300 rounded px-4 py-1.5 hover:bg-gray-50 disabled:opacity-40"
            onClick={handleMarkOrdered}>
            {marking ? 'Marking…' : `Mark as Ordered${selected.size > 0 ? ` (${selected.size})` : ''}`}
          </button>
        </div>
      </div>

      {/* Flash */}
      {flash && (
        <div className={`rounded border px-4 py-2 text-sm flex items-center gap-2 ${flash.type === 'ok' ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
          <span className="flex-1">{flash.text}</span>
          <button className="opacity-60 hover:opacity-100" onClick={() => setFlash(null)}>✕</button>
        </div>
      )}

      {error && <ErrorBox message={error} />}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-7 w-7 rounded-full border-4 border-cm-green border-t-transparent animate-spin" />
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="p-8 text-center text-sm text-gray-400">No items to order — all lines have been actioned. ✓</div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="space-y-6">
          {freetextRows.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                Needs Catalogue Entry <span className="text-gray-400 font-normal">({freetextRows.length})</span>
              </h2>
              <FreetextTable rows={freetextRows} navigate={navigate} />
            </div>
          )}
          {orderableRows.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                Ready to Order <span className="text-gray-400 font-normal">({orderableRows.length})</span>
              </h2>
              <div className="space-y-4">
                {groups.map(([supplierKey, groupRows]) => (
                  <SupplierGroup key={supplierKey}
                    supplierKey={supplierKey.startsWith('—') ? null : supplierKey}
                    supplierLabel={supplierKey} rows={groupRows} selected={selected}
                    onToggleLine={toggleLine} onToggleAll={toggleAll} navigate={navigate}
                    onCreatePo={handleCreatePo} creatingPo={creatingPo} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* PO success modal */}
      {poResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setPoResult(null)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-800">Purchase Order created</h3>
            <p className="text-sm text-gray-600">
              Draft PO <span className="font-mono font-medium">{poResult.poName}</span> has been created and all selected lines marked as ordered.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button className="text-sm text-gray-500 border border-gray-300 rounded px-3 py-1.5 hover:text-gray-700" onClick={() => setPoResult(null)}>Close</button>
              <button className="text-sm font-medium bg-cm-green hover:bg-green-700 text-white rounded px-4 py-1.5"
                onClick={() => { window.open(poResult.poUrl, '_blank', 'noopener,noreferrer'); setPoResult(null) }}>
                Open PO
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
