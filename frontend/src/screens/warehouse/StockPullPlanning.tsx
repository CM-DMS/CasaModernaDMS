/**
 * StockPullPlanning — /warehouse/picking
 *
 * Warehouse staff see draft DNs, inspect stock by location,
 * assign pull warehouse per item, save then submit.
 */
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader, ErrorBox, Btn, selectCls } from '../../components/shared/ui'
import { frappe } from '../../api/frappe'

interface BinRow { warehouse: string; actual_qty: number }
interface StockMap { [itemCode: string]: BinRow[] }

interface DnItem {
  name?: string
  idx?: number
  item_code?: string
  item_name?: string
  qty?: number
  warehouse?: string
}

interface DeliveryNoteDoc {
  name: string
  customer?: string
  customer_name?: string
  posting_date?: string
  modified?: string
  items?: DnItem[]
}

/** Short warehouse display name */
function shortWh(wh: string | undefined) {
  if (!wh) return ''
  const m = wh.match(/STV (L-\d+)/i)
  if (m) return m[1]
  const m2 = wh.match(/^([^-]+)/)
  return m2 ? m2[1].trim() : wh
}

function stockColour(actual: number, needed: number) {
  if (actual <= 0)     return 'text-red-600 font-semibold'
  if (actual < needed) return 'text-amber-600 font-semibold'
  return 'text-green-700 font-semibold'
}

function StockBar({ itemCode, qty, stock, warehouses }: {
  itemCode?: string; qty?: number; stock: StockMap | null; warehouses: string[]
}) {
  if (!stock || !itemCode) return <span className="text-gray-300 text-[10px]">loading…</span>
  const itemStock = stock[itemCode] || []
  if (itemStock.length === 0) return <span className="text-red-500 text-[10px]">No stock anywhere</span>
  return (
    <div className="flex gap-3 flex-wrap">
      {warehouses.map((wh) => {
        const row    = itemStock.find((r) => r.warehouse === wh)
        const actual = row ? Number(row.actual_qty) : 0
        return (
          <span key={wh} className="text-[10px] whitespace-nowrap">
            <span className="text-gray-400">{shortWh(wh)}: </span>
            <span className={stockColour(actual, qty ?? 0)}>{actual}</span>
          </span>
        )
      })}
    </div>
  )
}

function WarehouseSelect({ itemCode, qty, stock, warehouses, value, onChange, disabled }: {
  itemCode?: string; qty?: number; stock: StockMap | null; warehouses: string[]
  value: string; onChange: (v: string) => void; disabled?: boolean
}) {
  const itemStock = (stock && itemCode && stock[itemCode]) || []
  return (
    <select
      className={`${selectCls} text-[11px] min-w-[110px]`}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    >
      <option value="">— pick location —</option>
      {warehouses.map((wh) => {
        const row    = itemStock.find((r) => r.warehouse === wh)
        const actual = row ? Number(row.actual_qty) : 0
        const suffix =
          actual <= 0       ? ' (0)' :
          actual < (qty ?? 0) ? ` (${actual} — short)` :
          ` (${actual} avail)`
        return (
          <option key={wh} value={wh}>{shortWh(wh)}{suffix}</option>
        )
      })}
    </select>
  )
}

function DNCard({ dn, stock, warehouses, onSaved, onSubmitted }: {
  dn: DeliveryNoteDoc
  stock: StockMap | null
  warehouses: string[]
  onSaved: (doc: DeliveryNoteDoc) => void
  onSubmitted: (name: string) => void
}) {
  const navigate = useNavigate()

  const initAssignments = () => {
    const map: Record<string, string> = {}
    ;(dn.items || []).forEach((item, idx) => {
      map[item.name || String(idx)] = item.warehouse || ''
    })
    return map
  }

  const [assignments, setAssignments] = useState<Record<string, string>>(initAssignments)
  const [saving,      setSaving]      = useState(false)
  const [submitting,  setSubmitting]  = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [dirty,       setDirty]       = useState(false)

  const setItemWh = (key: string, wh: string) => {
    setAssignments((prev) => ({ ...prev, [key]: wh }))
    setDirty(true)
  }

  const allAssigned = (dn.items || []).every((item, idx) =>
    assignments[item.name || String(idx)]
  )

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const updatedItems = (dn.items || []).map((item, idx) => ({
        ...item,
        warehouse: assignments[item.name || String(idx)] || item.warehouse || '',
      }))
      const saved = await frappe.saveDoc<DeliveryNoteDoc>('Delivery Note', { ...dn, items: updatedItems })
      setDirty(false)
      onSaved(saved)
    } catch (err: unknown) {
      setError((err as Error).message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async () => {
    if (dirty) { setError('Save warehouse assignments first.'); return }
    if (!allAssigned) { setError('Assign a warehouse for every item first.'); return }
    if (!window.confirm(`Submit ${dn.name}? Stock will be deducted.`)) return
    setSubmitting(true)
    setError(null)
    try {
      await frappe.call('casamoderna_dms.delivery_pickup_api.submit_delivery_note', { name: dn.name })
      onSubmitted(dn.name)
    } catch (err: unknown) {
      setError((err as Error).message || 'Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-3">
          <button
            className="font-mono text-[13px] font-bold text-cm-green hover:underline"
            onClick={() => navigate(`/warehouse/delivery-notes/${encodeURIComponent(dn.name)}`)}
          >
            {dn.name}
          </button>
          <span className="text-[11px] text-gray-500">{dn.customer_name || dn.customer}</span>
          {dirty && <span className="text-[10px] text-amber-600 font-semibold">unsaved changes</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-400">{dn.posting_date}</span>
          <Btn onClick={handleSave} disabled={saving || submitting || !dirty}>
            {saving ? 'Saving…' : 'Save'}
          </Btn>
          <Btn
            onClick={handleSubmit}
            disabled={saving || submitting || dirty || !allAssigned}
            title={!allAssigned ? 'Assign a warehouse for every item' : dirty ? 'Save first' : ''}
          >
            {submitting ? 'Submitting…' : 'Submit'}
          </Btn>
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 text-[12px] text-red-600 bg-red-50 border-b border-red-100">{error}</div>
      )}

      <div className="px-4 py-3 overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-100">
              <th className="text-left pb-2 pr-3">Item</th>
              <th className="text-right pb-2 pr-3 w-12">Qty</th>
              <th className="text-left pb-2 pr-3">Stock by location</th>
              <th className="text-left pb-2 w-36">Pull from</th>
            </tr>
          </thead>
          <tbody>
            {(dn.items || []).map((item, idx) => {
              const key = item.name || String(idx)
              const wh  = assignments[key] || ''
              return (
                <tr key={key} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 pr-3 align-middle">
                    <div className="font-medium text-gray-900">{item.item_name || item.item_code}</div>
                    <div className="text-[10px] text-gray-400 font-mono">{item.item_code}</div>
                  </td>
                  <td className="py-2 pr-3 align-middle text-right tabular-nums font-semibold">{item.qty}</td>
                  <td className="py-2 pr-3 align-middle">
                    <StockBar itemCode={item.item_code} qty={item.qty} stock={stock} warehouses={warehouses} />
                  </td>
                  <td className="py-2 align-middle">
                    <WarehouseSelect
                      itemCode={item.item_code}
                      qty={item.qty}
                      stock={stock}
                      warehouses={warehouses}
                      value={wh}
                      onChange={(v) => setItemWh(key, v)}
                      disabled={saving || submitting}
                    />
                    {wh && (() => {
                      const itemStock = (stock && item.item_code && stock[item.item_code]) || []
                      const row = itemStock.find((r) => r.warehouse === wh)
                      const actual = row ? Number(row.actual_qty) : 0
                      if (actual < (item.qty ?? 0)) {
                        return (
                          <div className="text-[10px] text-amber-600 mt-0.5">
                            Only {actual} in {shortWh(wh)} — short by {(item.qty ?? 0) - actual}
                          </div>
                        )
                      }
                      return null
                    })()}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function StockPullPlanning() {
  const [dns,        setDns]        = useState<DeliveryNoteDoc[]>([])
  const [stock,      setStock]      = useState<StockMap | null>(null)
  const [warehouses, setWarehouses] = useState<string[]>([])
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await frappe.call<{ name: string; customer: string; customer_name: string; posting_date: string }[]>(
        'frappe.client.get_list',
        {
          doctype: 'Delivery Note',
          fields: ['name', 'customer', 'customer_name', 'posting_date', 'modified'],
          filters: [['docstatus', '=', 0]],
          order_by: 'posting_date asc',
          limit_page_length: 100,
        },
      )

      if (!list || list.length === 0) {
        setDns([])
        setStock({})
        setLoading(false)
        return
      }

      const BATCH = 5
      const fullDocs: DeliveryNoteDoc[] = []
      for (let i = 0; i < list.length; i += BATCH) {
        const batch = list.slice(i, i + BATCH)
        const batchDocs = await Promise.all(
          batch.map((r) => frappe.call<DeliveryNoteDoc>('frappe.client.get', {
            doctype: 'Delivery Note', name: r.name,
          }))
        )
        fullDocs.push(...batchDocs)
      }

      const itemCodes = [...new Set(
        fullDocs.flatMap((d) => (d.items || []).map((i) => i.item_code).filter(Boolean) as string[])
      )]

      const stockMap: StockMap = {}
      if (itemCodes.length > 0) {
        const bins = await frappe.call<{ item_code: string; warehouse: string; actual_qty: number }[]>(
          'frappe.client.get_list',
          {
            doctype: 'Bin',
            fields: ['item_code', 'warehouse', 'actual_qty'],
            filters: [['item_code', 'in', itemCodes]],
            limit_page_length: 2000,
          },
        )
        for (const row of bins || []) {
          if (!stockMap[row.item_code]) stockMap[row.item_code] = []
          stockMap[row.item_code].push({ warehouse: row.warehouse, actual_qty: row.actual_qty })
        }
      }

      const whList = await frappe.call<{ name: string }[]>('frappe.client.get_list', {
        doctype: 'Warehouse',
        fields: ['name'],
        filters: [['disabled', '=', 0], ['is_group', '=', 0]],
        limit_page_length: 100,
      })
      const allWarehouses = (whList || []).map((w) => w.name).sort()

      setDns(fullDocs)
      setStock(stockMap)
      setWarehouses(allWarehouses)
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to load draft delivery notes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaved = (savedDoc: DeliveryNoteDoc) => {
    setDns((prev) => prev.map((d) => d.name === savedDoc.name ? savedDoc : d))
  }

  const handleSubmitted = (dnName: string) => {
    setDns((prev) => prev.filter((d) => d.name !== dnName))
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Stock Pull Planning"
        subtitle="Assign warehouse locations before submitting delivery notes"
        actions={<Btn onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</Btn>}
      />

      {error && <ErrorBox message={error} />}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-7 w-7 rounded-full border-4 border-cm-green border-t-transparent animate-spin" />
        </div>
      )}

      {!loading && dns.length === 0 && (
        <div className="text-center py-16 text-sm text-gray-400">
          No draft delivery notes waiting for warehouse assignment.
        </div>
      )}

      {!loading && dns.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
            {dns.length} draft DN{dns.length !== 1 ? 's' : ''} pending
          </h3>
          <p className="text-[11px] text-gray-400 mb-4">
            For each item, review available stock by location, select where to pull from, save, then submit.
            Items highlighted in amber or red have insufficient stock at the selected location.
          </p>
          <div className="space-y-4">
            {dns.map((dn) => (
              <DNCard
                key={dn.name}
                dn={dn}
                stock={stock}
                warehouses={warehouses}
                onSaved={handleSaved}
                onSubmitted={handleSubmitted}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
