/**
 * DeliveryNoteQtyModal — quantity chooser for creating a Delivery Note from a Sales Order.
 *
 * Shows ordered / already delivered / remaining quantities per line so the user
 * can choose how many units to include in this delivery run.
 *
 * Calls:
 *   casamoderna_dms.delivery_pickup_api.get_so_remaining_qtys   — loads line data
 *   casamoderna_dms.delivery_pickup_api.make_partial_delivery_note — creates DN draft
 *
 * Props:
 *   soName    — name of the submitted Sales Order
 *   onClose   — dismiss without creating
 *   onCreated — called with the saved DN doc dict
 */
import { useState, useEffect, useCallback } from 'react'
import { frappe } from '../../api/frappe'

interface SoLine {
  item_code: string
  item_name: string
  cm_given_name?: string
  ordered_qty: number
  delivered_qty: number
  remaining_qty: number
  uom: string
  so_detail: string
}

interface DnDoc {
  name: string
  [key: string]: unknown
}

interface Props {
  soName: string
  onClose: () => void
  onCreated: (doc: DnDoc) => void
}

export function DeliveryNoteQtyModal({ soName, onClose, onCreated }: Props) {
  const [lines, setLines] = useState<SoLine[]>([])
  const [qtys, setQtys] = useState<Record<string, number | string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    frappe
      .call<SoLine[]>('casamoderna_dms.delivery_pickup_api.get_so_remaining_qtys', {
        so_name: soName,
      })
      .then((data) => {
        const rows = Array.isArray(data) ? data : []
        setLines(rows)
        const init: Record<string, number> = {}
        rows.forEach((r) => {
          init[r.so_detail] = r.remaining_qty
        })
        setQtys(init)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load Sales Order lines'))
      .finally(() => setLoading(false))
  }, [soName])

  const setQty = useCallback((soDetail: string, val: string) => {
    setQtys((prev) => ({ ...prev, [soDetail]: val }))
  }, [])

  const hasRemaining = lines.some((l) => l.remaining_qty > 0)

  const handleCreate = useCallback(async () => {
    const lineSpecs = lines
      .map((l) => ({ so_detail: l.so_detail, qty: Number(qtys[l.so_detail] ?? 0) }))
      .filter((l) => l.qty > 0)
    if (!lineSpecs.length) {
      setError('Set at least one quantity greater than 0.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const doc = await frappe.call<DnDoc>(
        'casamoderna_dms.delivery_pickup_api.make_partial_delivery_note',
        { so_name: soName, lines: JSON.stringify(lineSpecs) },
      )
      onCreated(doc)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create Delivery Note')
    } finally {
      setSaving(false)
    }
  }, [lines, qtys, soName, onCreated])

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 shrink-0">
          <div>
            <div className="text-sm font-bold text-gray-800">
              Create Delivery Note — {soName}
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5">
              Pre-filled with remaining balance. Adjust quantities for this delivery run.
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none ml-4"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 mb-3">
              {error}
            </div>
          )}

          {loading && (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 rounded-full border-4 border-cm-green border-t-transparent animate-spin" />
            </div>
          )}

          {!loading && lines.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">
              No items found on this Sales Order.
            </p>
          )}

          {!loading && lines.length > 0 && (
            <>
              {!hasRemaining && (
                <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 mb-3">
                  All items on this Sales Order have already been fully delivered.
                </div>
              )}

              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-200">
                    <th className="text-left pb-2 pr-3">Product</th>
                    <th className="text-right pb-2 pr-2 w-16">Ordered</th>
                    <th className="text-right pb-2 pr-2 w-20">Delivered</th>
                    <th className="text-right pb-2 pr-2 w-20">Remaining</th>
                    <th className="text-right pb-2 w-28">This delivery</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const remaining = line.remaining_qty
                    const val = qtys[line.so_detail] ?? remaining
                    const allDone = remaining <= 0
                    return (
                      <tr
                        key={line.so_detail}
                        className={`border-b border-gray-100 ${allDone ? 'opacity-40' : ''}`}
                      >
                        {/* Product */}
                        <td className="py-2.5 pr-3">
                          <div className="font-semibold text-gray-900 leading-snug">
                            {line.item_name}
                          </div>
                          {line.cm_given_name && line.cm_given_name !== line.item_name && (
                            <div className="text-[10px] text-gray-400 italic">
                              {line.cm_given_name}
                            </div>
                          )}
                          <div className="text-[10px] text-gray-400 font-mono">
                            {line.item_code}
                          </div>
                        </td>
                        {/* Ordered */}
                        <td className="py-2.5 pr-2 text-right tabular-nums text-gray-500">
                          {line.ordered_qty}
                        </td>
                        {/* Delivered */}
                        <td className="py-2.5 pr-2 text-right tabular-nums">
                          {line.delivered_qty > 0 ? (
                            <span className="text-blue-600 font-medium">{line.delivered_qty}</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        {/* Remaining */}
                        <td className="py-2.5 pr-2 text-right tabular-nums">
                          {allDone ? (
                            <span className="text-green-600 font-semibold text-[10px] uppercase tracking-wide">
                              Done
                            </span>
                          ) : (
                            <span className="font-semibold text-gray-800">{remaining}</span>
                          )}
                        </td>
                        {/* This delivery input */}
                        <td className="py-2.5 text-right">
                          {allDone ? (
                            <span className="text-gray-300">—</span>
                          ) : (
                            <div className="flex items-center justify-end gap-1.5">
                              <input
                                type="number"
                                min="0"
                                max={remaining}
                                step="1"
                                className="w-20 rounded border border-gray-300 px-2 py-1 text-right text-[12px] focus:outline-none focus:ring-2 focus:ring-cm-green tabular-nums"
                                value={val}
                                onChange={(e) => setQty(line.so_detail, e.target.value)}
                              />
                              <span className="text-[10px] text-gray-400 w-6">{line.uom}</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 shrink-0">
          <button
            className="px-3 py-1.5 text-sm font-medium rounded text-gray-700 border border-gray-300 hover:bg-gray-100 disabled:opacity-50"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="px-3 py-1.5 text-sm font-medium rounded bg-cm-green text-white hover:bg-cm-green-dark disabled:opacity-50"
            onClick={() => void handleCreate()}
            disabled={saving || loading || !hasRemaining}
          >
            {saving ? 'Creating…' : 'Create Delivery Note'}
          </button>
        </div>
      </div>
    </div>
  )
}
