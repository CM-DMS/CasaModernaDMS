/**
 * StockAdjustmentEditor — create / view / edit Stock Entry (Material Receipt or Material Issue).
 *
 * Routes:
 *   /warehouse/adjustments/new   create blank
 *   /warehouse/adjustments/:id   view/edit existing
 */
import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { PageHeader, ErrorBox, Btn, inputCls } from '../../components/shared/ui'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { Typeahead } from '../../components/sales/Typeahead'
import { usePermissions } from '../../auth/PermissionsProvider'
import { frappe } from '../../api/frappe'

const DOCTYPE = 'Stock Entry'
const today = () => new Date().toISOString().slice(0, 10)

interface StockEntryDetail {
  doctype: string
  name?: string
  idx?: number
  item_code: string
  item_name?: string
  qty: number
  uom?: string
  s_warehouse?: string
  t_warehouse?: string
  basic_rate?: number
  basic_amount?: number
  batch_no?: string
}

interface StockEntryDoc {
  doctype: string
  name?: string
  stock_entry_type: string
  posting_date: string
  remarks?: string
  items: StockEntryDetail[]
  total_amount?: number
  docstatus?: number
}

const blankItem = (): StockEntryDetail => ({
  doctype: 'Stock Entry Detail',
  item_code: '', item_name: '', qty: 1, uom: '',
  s_warehouse: '', t_warehouse: '', basic_rate: 0, basic_amount: 0,
  batch_no: '',
})

const blankDoc = (type = 'Material Receipt'): StockEntryDoc => ({
  doctype: DOCTYPE,
  stock_entry_type: type,
  posting_date: today(),
  items: [blankItem()],
  total_amount: 0,
})

interface ItemResult { name: string; item_name?: string; stock_uom?: string }
interface WhResult   { name: string }

export function StockAdjustmentEditor() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { can }  = usePermissions()

  const isNew = !id

  const initialType = (location.state as { entryType?: string } | null)?.entryType ?? 'Material Receipt'

  const [doc,        setDoc]        = useState<StockEntryDoc>(() => isNew ? blankDoc(initialType) : blankDoc())
  const [loading,    setLoading]    = useState(!isNew)
  const [saving,     setSaving]     = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [dirty,      setDirty]      = useState(false)

  useEffect(() => {
    if (!isNew && id) {
      setLoading(true)
      frappe.getDoc<StockEntryDoc>(DOCTYPE, decodeURIComponent(id))
        .then((d) => { setDoc(d); setDirty(false) })
        .catch((err: unknown) => setError((err as Error).message || 'Failed to load'))
        .finally(() => setLoading(false))
    }
  }, [id, isNew])

  const patchDoc = (patch: Partial<StockEntryDoc>) => { setDoc((p) => ({ ...p, ...patch })); setDirty(true) }

  const patchItem = (idx: number, patch: Partial<StockEntryDetail>) => {
    setDoc((p) => ({
      ...p,
      items: p.items.map((r, i) => i === idx ? { ...r, ...patch } : r),
    }))
    setDirty(true)
  }

  const addRow = useCallback(() => {
    setDoc((p) => ({ ...p, items: [...p.items, blankItem()] }))
    setDirty(true)
  }, [])

  const removeRow = useCallback((idx: number) => {
    setDoc((p) => ({ ...p, items: p.items.filter((_, i) => i !== idx) }))
    setDirty(true)
  }, [])

  const searchItems = (q: string) =>
    frappe.call<ItemResult[]>('frappe.client.get_list', {
      doctype: 'Item', fields: ['name', 'item_name', 'stock_uom'],
      filters: [['disabled', '=', 0]],
      or_filters: [['name', 'like', `%${q}%`], ['item_name', 'like', `%${q}%`]],
      limit_page_length: 15,
    })

  const searchUoms = (q: string) =>
    frappe.call<{ name: string }[]>('frappe.client.get_list', {
      doctype: 'UOM', fields: ['name'],
      or_filters: [['name', 'like', `%${q}%`]],
      limit_page_length: 15,
    })

  const searchWarehouses = (q: string) =>
    frappe.call<WhResult[]>('frappe.client.get_list', {
      doctype: 'Warehouse', fields: ['name'],
      filters: [['disabled', '=', 0]],
      or_filters: [['name', 'like', `%${q}%`]],
      limit_page_length: 15,
    })

  const handleSave = async () => {
    if (!doc.items?.length || !doc.items[0].item_code) {
      setError('At least one item is required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const saved = await frappe.saveDoc<StockEntryDoc>(DOCTYPE, doc)
      setDoc(saved)
      setDirty(false)
      if (isNew && saved.name) {
        navigate(`/warehouse/adjustments/${encodeURIComponent(saved.name)}`, { replace: true })
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async () => {
    if (dirty) { setError('Save the document before submitting.'); return }
    if (!window.confirm('Submit this Stock Entry? Stock levels will be updated.')) return
    setSubmitting(true)
    setError(null)
    try {
      await frappe.submitDoc(DOCTYPE, doc.name!)
      const refreshed = await frappe.getDoc<StockEntryDoc>(DOCTYPE, doc.name!)
      setDoc(refreshed)
      setDirty(false)
    } catch (err: unknown) {
      setError((err as Error).message || 'Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (!can('canWarehouse') && !can('canAdmin')) {
    return (
      <div className="rounded border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-800 text-center">
        You do not have permission to create or edit stock adjustments.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 rounded-full border-4 border-cm-green border-t-transparent animate-spin" />
      </div>
    )
  }

  const isSubmitted = doc.docstatus === 1
  const isCancelled = doc.docstatus === 2
  const readOnly    = isSubmitted || isCancelled
  const isReceipt   = doc.stock_entry_type === 'Material Receipt'

  return (
    <div className="space-y-5">
      <PageHeader
        title={isNew ? 'New Stock Adjustment' : (doc.name || 'Stock Adjustment')}
        subtitle={doc.stock_entry_type}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {doc.docstatus != null && <StatusBadge docstatus={doc.docstatus} />}
            {!readOnly && (
              <Btn onClick={handleSave} disabled={saving || submitting}>
                {saving ? 'Saving…' : dirty ? 'Save *' : 'Save'}
              </Btn>
            )}
            {!isNew && !readOnly && (
              <Btn onClick={handleSubmit} disabled={saving || submitting}>
                {submitting ? 'Submitting…' : 'Submit'}
              </Btn>
            )}
            <Btn onClick={() => navigate('/warehouse/adjustments')}>← Back</Btn>
          </div>
        }
      />

      {error && <ErrorBox message={error} />}

      {/* Header */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">Header</h3>
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-gray-600">Entry Type <span className="text-red-500">*</span></label>
            {readOnly ? (
              <span className="text-sm font-medium">{doc.stock_entry_type}</span>
            ) : (
              <select
                className={inputCls}
                value={doc.stock_entry_type}
                onChange={(e) => patchDoc({ stock_entry_type: e.target.value })}
                disabled={!isNew}
              >
                <option value="Material Receipt">Material Receipt (Stock In)</option>
                <option value="Material Issue">Material Issue (Stock Out)</option>
              </select>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-gray-600">Posting Date <span className="text-red-500">*</span></label>
            {readOnly ? (
              <span className="text-sm">{doc.posting_date}</span>
            ) : (
              <input
                type="date"
                className={inputCls}
                value={doc.posting_date || ''}
                onChange={(e) => patchDoc({ posting_date: e.target.value })}
              />
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-gray-600">Remarks</label>
            {readOnly ? (
              <span className="text-sm">{doc.remarks || '—'}</span>
            ) : (
              <input
                className={inputCls}
                value={doc.remarks || ''}
                onChange={(e) => patchDoc({ remarks: e.target.value })}
                placeholder="Optional remarks…"
              />
            )}
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">Items</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="pb-2 pr-3">Item</th>
                <th className="pb-2 pr-3 w-20">Qty</th>
                <th className="pb-2 pr-3 w-24">UOM</th>
                {!isReceipt && <th className="pb-2 pr-3">From (Warehouse)</th>}
                {isReceipt  && <th className="pb-2 pr-3">To (Warehouse)</th>}
                {isReceipt  && <th className="pb-2 pr-3 w-28">Unit Cost</th>}
                {isReceipt  && <th className="pb-2 pr-3 w-28">Batch No</th>}
                {!readOnly  && <th className="pb-2 w-8" />}
              </tr>
            </thead>
            <tbody>
              {(doc.items || []).map((row, idx) => (
                <tr key={row.name || row.idx || idx} className="border-b last:border-0">
                  <td className="py-2 pr-3">
                    {readOnly ? (
                      <span>{row.item_name || row.item_code || '—'}</span>
                    ) : (
                      <Typeahead<ItemResult>
                        value={row.item_code}
                        displayValue={row.item_name || row.item_code}
                        onSearch={searchItems}
                        getLabel={(r) => `${r.item_name} (${r.name})`}
                        getValue={(r) => r.name}
                        onChange={(val, r) =>
                          patchItem(idx, {
                            item_code: val,
                            item_name: r?.item_name || val,
                            uom: r?.stock_uom || '',
                          })
                        }
                        placeholder="Search item…"
                      />
                    )}
                  </td>

                  <td className="py-2 pr-3">
                    {readOnly ? (
                      <span>{row.qty}</span>
                    ) : (
                      <input
                        type="number" min="0" step="any"
                        className={inputCls + ' w-20 text-right'}
                        value={row.qty}
                        onChange={(e) => patchItem(idx, { qty: parseFloat(e.target.value) || 0 })}
                      />
                    )}
                  </td>

                  <td className="py-2 pr-3">
                    {readOnly ? (
                      <span>{row.uom || '—'}</span>
                    ) : (
                      <Typeahead<{ name: string }>
                        value={row.uom || ''}
                        displayValue={row.uom || ''}
                        onSearch={searchUoms}
                        getLabel={(r) => r.name}
                        getValue={(r) => r.name}
                        onChange={(val) => patchItem(idx, { uom: val })}
                        placeholder="UOM…"
                      />
                    )}
                  </td>

                  <td className="py-2 pr-3">
                    {readOnly ? (
                      <span>{(isReceipt ? row.t_warehouse : row.s_warehouse) || '—'}</span>
                    ) : (
                      <Typeahead<WhResult>
                        value={isReceipt ? (row.t_warehouse || '') : (row.s_warehouse || '')}
                        displayValue={isReceipt ? (row.t_warehouse || '') : (row.s_warehouse || '')}
                        onSearch={searchWarehouses}
                        getLabel={(r) => r.name}
                        getValue={(r) => r.name}
                        onChange={(val) =>
                          patchItem(idx, isReceipt ? { t_warehouse: val } : { s_warehouse: val })
                        }
                        placeholder="Warehouse…"
                      />
                    )}
                  </td>

                  {isReceipt && (
                    <td className="py-2 pr-3">
                      {readOnly ? (
                        <span>{Number(row.basic_rate || 0).toFixed(2)}</span>
                      ) : (
                        <input
                          type="number" min="0" step="any"
                          className={inputCls + ' w-28 text-right'}
                          value={row.basic_rate ?? 0}
                          onChange={(e) => {
                            const rate = parseFloat(e.target.value) || 0
                            patchItem(idx, { basic_rate: rate, basic_amount: rate * (row.qty || 0) })
                          }}
                        />
                      )}
                    </td>
                  )}

                  {isReceipt && (
                    <td className="py-2 pr-3">
                      {readOnly ? (
                        <span className="font-mono text-xs">{row.batch_no || <span className="text-gray-400 italic">auto</span>}</span>
                      ) : (
                        <input
                          className={inputCls + ' w-28 font-mono text-xs'}
                          value={row.batch_no || ''}
                          onChange={(e) => patchItem(idx, { batch_no: e.target.value })}
                          placeholder="auto"
                          title="Leave blank to auto-assign a 6-digit code on save"
                        />
                      )}
                    </td>
                  )}

                  {!readOnly && (
                    <td className="py-2 text-center">
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        className="text-gray-400 hover:text-red-500 text-lg leading-none"
                        title="Remove row"
                      >×</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!readOnly && (
          <button type="button" onClick={addRow} className="mt-3 text-sm text-cm-green hover:underline">
            + Add Row
          </button>
        )}
      </div>
    </div>
  )
}
