/**
 * AutoPRScreen — Automated Purchase Requisition (reorder suggestions).
 * Shows items at or below reorder level; select + create draft Purchase Orders.
 * Route: /purchases/reorder-suggestions
 */
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import { usePermissions } from '../../auth/PermissionsProvider'
import { PageHeader, ErrorBox, Btn, inputCls } from '../../components/shared/ui'
import { fmtMoney } from '../../utils/fmt'

interface ReorderRow {
  item_code: string; item_name: string; item_group: string; warehouse: string
  actual_qty: number; reorder_level: number; deficit: number
  reorder_qty: number; last_purchase_rate: number; estimated_cost: number
  default_supplier: string; default_supplier_name: string
}

interface SelectedItem { qty: number; rate: number; warehouse: string }

export function AutoPRScreen() {
  const navigate  = useNavigate()
  const { can }   = usePermissions()
  const [rows, setRows]         = useState<ReorderRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [warehouse, setWh]      = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [selected, setSelected] = useState<Record<string, SelectedItem>>({})
  const [creating, setCreating] = useState(false)
  const [flash, setFlash]       = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setSelected({}); setError(null)
    try {
      const res = await frappe.call<ReorderRow[]>(
        'casamoderna_dms.auto_pr_api.get_reorder_suggestions',
        { warehouse },
      )
      setRows(res ?? [])
    } catch (e: unknown) { setError((e as Error).message ?? 'Failed') }
    finally { setLoading(false) }
  }, [warehouse])

  useEffect(() => { load() }, [load])

  if (!can('canPurchasing') && !can('canAdmin')) {
    return (
      <div className="p-6 text-sm text-gray-500">Only purchasing staff can access this screen.</div>
    )
  }

  function toggleSelect(item_code: string, reorder_qty: number, last_rate: number, wh: string) {
    setSelected(prev =>
      prev[item_code]
        ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== item_code))
        : { ...prev, [item_code]: { qty: reorder_qty, rate: last_rate, warehouse: wh } },
    )
  }

  function updateQty(item_code: string, qty: string) {
    setSelected(prev => ({ ...prev, [item_code]: { ...prev[item_code], qty: Number(qty) } }))
  }

  async function createPOs() {
    const bySupplier: Record<string, { wh: string; items: { item_code: string; qty: number; rate: number }[] }> = {}
    for (const [item_code, { qty, rate, warehouse: wh }] of Object.entries(selected)) {
      const row = rows.find(r => r.item_code === item_code)
      const sup = row?.default_supplier || '__none__'
      if (!bySupplier[sup]) bySupplier[sup] = { wh, items: [] }
      bySupplier[sup].items.push({ item_code, qty, rate })
    }
    setCreating(true); setFlash(null)
    const created: string[] = []
    try {
      for (const [sup, { wh, items }] of Object.entries(bySupplier)) {
        if (sup === '__none__') { setFlash('Some items have no default supplier — skipped.'); continue }
        const res = await frappe.call<{ name: string }>(
          'casamoderna_dms.auto_pr_api.create_purchase_order_from_suggestions',
          { items, supplier: sup, warehouse: wh },
        )
        created.push(res.name)
      }
      if (created.length) {
        setFlash(`Created ${created.length} draft Purchase Order(s): ${created.join(', ')}`)
        if (created.length === 1) navigate(`/purchases/orders/${encodeURIComponent(created[0])}`)
        else load()
      }
    } catch (e: unknown) { setFlash((e as Error).message ?? 'Failed to create PO') }
    finally { setCreating(false) }
  }

  const selectedCount  = Object.keys(selected).length
  const estimatedTotal = Object.entries(selected).reduce((s, [, { qty, rate }]) => s + qty * rate, 0)

  const supplierGroups: Record<string, { name: string; items: ReorderRow[] }> = {}
  for (const r of rows) {
    const sup = r.default_supplier || '— No Default Supplier —'
    if (!supplierGroups[sup]) supplierGroups[sup] = { name: r.default_supplier_name || sup, items: [] }
    supplierGroups[sup].items.push(r)
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Reorder Suggestions" subtitle="Items at or below reorder level — create Purchase Orders">
        <div className="flex gap-2">
          {selectedCount > 0 && (
            <Btn onClick={createPOs} disabled={creating}>
              {creating ? 'Creating…' : `Create PO (${selectedCount} items · ${fmtMoney(estimatedTotal)})`}
            </Btn>
          )}
          <Btn variant="ghost" onClick={load} disabled={loading}>↻ Refresh</Btn>
        </div>
      </PageHeader>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">Warehouse</label>
            <input className={inputCls} value={warehouse} onChange={e => setWh(e.target.value)} placeholder="All warehouses" />
          </div>
          <div className="flex items-end">
            <Btn onClick={load} disabled={loading}>Filter</Btn>
          </div>
        </div>
      </div>

      {error && <ErrorBox message={error} />}

      {flash && (
        <div className="rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 flex justify-between">
          <span>{flash}</span>
          <button onClick={() => setFlash(null)} className="text-green-600 hover:text-green-800">✕</button>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-7 w-7 rounded-full border-4 border-cm-green border-t-transparent animate-spin" />
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-6 text-center">
          <p className="text-green-700 font-semibold">✓ All items are above reorder level</p>
          <p className="text-green-600 text-sm mt-1">No purchase requisitions needed at this time.</p>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <>
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <strong>{rows.length}</strong> items need replenishment. Select items and click "Create PO".
          </div>
          {Object.entries(supplierGroups).map(([supId, { name, items }]) => (
            <div key={supId} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                <h3 className="text-sm font-semibold text-gray-800">{name} <span className="font-normal text-gray-400">({items.length} items)</span></h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-gray-200 text-[10px] uppercase tracking-wider text-gray-400">
                      <th className="w-8 px-2 py-2" />
                      <th className="text-left px-3 py-2">Item</th>
                      <th className="text-left px-3 py-2">Group</th>
                      <th className="text-left px-3 py-2">Warehouse</th>
                      <th className="text-right px-3 py-2">In Stock</th>
                      <th className="text-right px-3 py-2">Reorder Level</th>
                      <th className="text-right px-3 py-2">Deficit</th>
                      <th className="text-right px-3 py-2">Suggest Qty</th>
                      <th className="text-right px-3 py-2">Last Price</th>
                      <th className="text-right px-3 py-2">Est. Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {items.map(r => {
                      const isSel  = !!selected[r.item_code]
                      const selQty = selected[r.item_code]?.qty ?? r.reorder_qty
                      return (
                        <tr key={r.item_code} className={`hover:bg-gray-50 ${isSel ? 'bg-cm-green/5' : ''}`}>
                          <td className="px-2 py-2 text-center">
                            <input type="checkbox" checked={isSel}
                              onChange={() => toggleSelect(r.item_code, r.reorder_qty, r.last_purchase_rate, r.warehouse)} />
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-semibold text-gray-800">{r.item_name}</div>
                            <div className="text-[10px] font-mono text-gray-400">{r.item_code}</div>
                          </td>
                          <td className="px-3 py-2 text-gray-500">{r.item_group}</td>
                          <td className="px-3 py-2 text-gray-500 text-[11px]">{r.warehouse}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-red-600 font-semibold">{r.actual_qty}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-500">{r.reorder_level}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-amber-700 font-semibold">{r.deficit}</td>
                          <td className="px-3 py-2 text-right">
                            {isSel ? (
                              <input type="number" min={1}
                                className="w-20 text-right border border-gray-200 rounded px-2 py-0.5 text-[12px]"
                                value={selQty} onChange={e => updateQty(r.item_code, e.target.value)} />
                            ) : (
                              <span className="tabular-nums text-gray-600">{r.reorder_qty}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-600">{fmtMoney(r.last_purchase_rate)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtMoney(r.estimated_cost)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
