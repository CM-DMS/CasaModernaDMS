import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import {
  PageHeader, ErrorBox, FieldWrap, inputCls, selectCls,
} from '../../components/shared/ui'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { Typeahead } from '../../components/sales/Typeahead'
import { ProductSelectorModal } from '../../components/products/ProductSelectorModal'
import { productsApi } from '../../api/products'
import { usePermissions } from '../../auth/PermissionsProvider'

interface PoItem {
  doctype?: string
  name?: string
  item_code: string
  item_name: string
  cm_supplier_item_code?: string
  description?: string
  qty: number
  uom: string
  schedule_date?: string
  rate?: number
  amount?: number
}

function blankItem(): Partial<PoItem> {
  return {
    doctype: 'Purchase Order Item',
    item_code: '',
    item_name: '',
    cm_supplier_item_code: '',
    qty: 1,
    uom: '',
    schedule_date: '',
  }
}

function blankDoc() {
  return {
    doctype: 'Purchase Order',
    cm_po_stage: 'Pricing Inquiry',
    supplier: '',
    supplier_name: '',
    transaction_date: new Date().toISOString().slice(0, 10),
    schedule_date: '',
    currency: 'EUR',
    items: [] as Partial<PoItem>[],
    taxes: [],
  }
}

function StageBadge({ stage }: { stage?: string }) {
  if (stage === 'Pricing Inquiry')
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">Pricing Inquiry</span>
  if (stage === 'Confirmed')
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-700">Confirmed</span>
  return null
}

export function PurchaseOrderEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { can } = usePermissions()
  const isNew = !id || id === 'new'

  const [doc, setDoc] = useState<Record<string, unknown>>(() =>
    (location.state as any)?.doc ? { ...blankDoc(), ...(location.state as any).doc, doctype: 'Purchase Order' } : blankDoc()
  )
  const [loading, setLoading] = useState(!isNew && !(location.state as any)?.doc)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [showProduct, setShowProduct] = useState(false)

  useEffect(() => {
    if (isNew || (location.state as any)?.doc) return
    setLoading(true)
    frappe
      .getDoc('Purchase Order', decodeURIComponent(id!))
      .then((d) => { setDoc(d as Record<string, unknown>); setDirty(false) })
      .catch((e: any) => setError(e.message || 'Failed to load purchase order'))
      .finally(() => setLoading(false))
  }, [id, isNew]) // eslint-disable-line react-hooks/exhaustive-deps

  const patchDoc = (patch: Record<string, unknown>) => {
    setDoc((p) => ({ ...p, ...patch }))
    setDirty(true)
  }

  const handleItemChange = useCallback((idx: number, patch: Partial<PoItem>) => {
    setDoc((p) => ({
      ...p,
      items: ((p.items as PoItem[]) || []).map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    }))
    setDirty(true)
  }, [])

  const handleRemoveRow = useCallback((idx: number) => {
    setDoc((p) => ({ ...p, items: ((p.items as PoItem[]) || []).filter((_, i) => i !== idx) }))
    setDirty(true)
  }, [])

  const handleProductSelect = (product: any) => {
    setShowProduct(false)
    const row = {
      ...blankItem(),
      item_code: product.item_code || '',
      item_name: product.item_name || '',
      cm_supplier_item_code: '',
      description: product.description || '',
      uom: product.uom || 'Unit',
      qty: 1,
      schedule_date: (doc.schedule_date as string) || '',
    }
    setDoc((prev) => ({ ...prev, items: [...((prev.items as PoItem[]) || []), row] }))
    setDirty(true)
  }

  const searchSuppliers = (q: string) =>
    frappe.call('frappe.client.get_list', {
      doctype: 'Supplier',
      fields: ['name', 'supplier_name'],
      or_filters: [
        ['supplier_name', 'like', `%${q}%`],
        ['name', 'like', `%${q}%`],
      ],
      limit_page_length: 15,
    })

  const handleSave = async () => {
    if (!doc.supplier) { setError('Supplier is required.'); return }
    if (!doc.schedule_date) { setError('Required By date is required.'); return }
    const items = (doc.items as PoItem[]) || []
    if (!items.length || items.some((r) => !r.item_code)) {
      setError('At least one item with a valid product is required.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const saved = await frappe.saveDoc('Purchase Order', doc)
      setDoc(saved as Record<string, unknown>)
      setDirty(false)
      const savedName = (saved as any).name as string
      if (isNew && savedName) {
        navigate(`/purchases/orders/${encodeURIComponent(savedName)}/edit`, { replace: true })
      }
    } catch (err: any) {
      setError(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async () => {
    if (dirty) { setError('Save the document first before submitting.'); return }
    if (!window.confirm('Submit this Purchase Order?')) return
    setSubmitting(true)
    setError('')
    try {
      await frappe.post(`/api/v2/document/Purchase%20Order/${encodeURIComponent(doc.name as string)}/submit`, {})
      const refreshed = await frappe.getDoc('Purchase Order', doc.name as string)
      setDoc(refreshed as Record<string, unknown>)
      setDirty(false)
    } catch (err: any) {
      setError(err.message || 'Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (!can('canPurchasing') && !can('canAdmin')) {
    return (
      <div className="rounded border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-800 text-center">
        You do not have permission to create or edit purchase orders.
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
  const isDraft = doc.docstatus === 0 || doc.docstatus == null
  const readOnly = isSubmitted || isCancelled

  let soRefs: string[] = []
  try { soRefs = doc.cm_so_references ? JSON.parse(doc.cm_so_references as string) : [] } catch { /* */ }

  const items = (doc.items as PoItem[]) || []
  const grandTotal = items.reduce((s, r) => s + (Number(r.amount) || 0), 0)

  return (
    <div className="space-y-5">
      <PageHeader
        title={isNew ? 'New Purchase Order' : (doc.name as string) || 'Purchase Order'}
        subtitle={(doc.supplier_name as string) || (doc.supplier as string)}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {doc.docstatus != null && (
              <StatusBadge status={doc.status as string} docstatus={doc.docstatus as number} />
            )}
            {doc.cm_po_stage && <StageBadge stage={doc.cm_po_stage as string} />}

            {isDraft && (
              <button
                onClick={() => void handleSave()}
                disabled={saving || submitting}
                className="px-4 py-1.5 rounded text-sm font-semibold bg-cm-green text-white hover:bg-cm-green/90 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : dirty ? 'Save *' : 'Save'}
              </button>
            )}

            {!isNew && isDraft && (
              <button
                onClick={() => void handleSubmit()}
                disabled={saving || submitting || dirty}
                title={dirty ? 'Save first' : ''}
                className="px-4 py-1.5 rounded text-sm font-semibold border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
            )}

            {!isNew && (
              <a
                href={`/printview?doctype=Purchase%20Order&name=${encodeURIComponent(doc.name as string)}&trigger_print=1`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded text-xs font-semibold border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
              >
                🖨 {(doc.cm_po_stage as string) === 'Pricing Inquiry' ? 'Print Inquiry' : 'Print Final'}
              </a>
            )}

            <button
              onClick={() =>
                doc.name
                  ? navigate(`/purchases/orders/${encodeURIComponent(doc.name as string)}`)
                  : navigate('/purchases/orders')
              }
              className="px-3 py-1.5 rounded text-xs font-semibold border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {isNew ? '← Cancel' : '← View'}
            </button>
          </div>
        }
      />

      {error && <ErrorBox message={error} />}

      {/* Header */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Header</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 sm:col-span-1">
            <Typeahead<{ name: string; supplier_name: string }>
              value={(doc.supplier as string) || ''}
              displayValue={(doc.supplier_name as string) || (doc.supplier as string) || ''}
              onSearch={searchSuppliers}
              getLabel={(r) => `${r.supplier_name} (${r.name})`}
              getValue={(r) => r.name}
              onChange={(val, row) =>
                patchDoc({ supplier: val, supplier_name: (row as any)?.supplier_name || val })
              }
              placeholder="Search supplier…"
              disabled={readOnly}
            />
          </div>

          <FieldWrap label="Currency">
            <input
              className={inputCls}
              value={(doc.currency as string) || 'EUR'}
              onChange={(e) => patchDoc({ currency: e.target.value })}
              disabled={readOnly}
            />
          </FieldWrap>

          <FieldWrap label="Order Date *">
            <input
              type="date"
              className={inputCls}
              value={(doc.transaction_date as string) || ''}
              onChange={(e) => patchDoc({ transaction_date: e.target.value })}
              disabled={readOnly}
            />
          </FieldWrap>

          <FieldWrap label="Required By *">
            <input
              type="date"
              className={inputCls}
              value={(doc.schedule_date as string) || ''}
              onChange={(e) => patchDoc({ schedule_date: e.target.value })}
              disabled={readOnly}
            />
          </FieldWrap>

          {!isNew && (
            <FieldWrap label="Stage">
              <select
                className={selectCls}
                value={(doc.cm_po_stage as string) || 'Pricing Inquiry'}
                onChange={(e) => patchDoc({ cm_po_stage: e.target.value })}
                disabled={readOnly}
              >
                <option value="Pricing Inquiry">Pricing Inquiry</option>
                <option value="Confirmed">Confirmed</option>
              </select>
            </FieldWrap>
          )}

          {soRefs.length > 0 && (
            <div className="col-span-2">
              <FieldWrap label="Sales Order References">
                <div className="flex gap-2 flex-wrap mt-1">
                  {soRefs.map((so) => (
                    <button
                      key={so}
                      onClick={() => navigate(`/sales/orders/${encodeURIComponent(so)}`)}
                      className="text-xs text-cm-green font-mono font-semibold hover:underline"
                    >
                      {so}
                    </button>
                  ))}
                </div>
              </FieldWrap>
            </div>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Items</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase w-8">#</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Item</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase w-20">Qty</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase w-16">UOM</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase w-24">Rate</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase w-24">Amount</th>
                {!readOnly && <th className="px-2 py-2 w-8" />}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-gray-400 text-xs">
                    No items — use "+ Add Product" to search and add products.
                  </td>
                </tr>
              )}
              {items.map((row, idx) => (
                <tr key={(row as any).name || idx} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-2 py-2 text-gray-400">{idx + 1}</td>
                  <td className="px-2 py-2">
                    {readOnly ? (
                      <>
                        <div className="font-medium text-gray-900">{row.item_name || row.item_code}</div>
                        {row.description && <div className="text-[11px] text-gray-400 mt-0.5">{row.description}</div>}
                        {row.cm_supplier_item_code && (
                          <div className="text-[10px] text-gray-400 font-mono mt-0.5">{row.cm_supplier_item_code}</div>
                        )}
                      </>
                    ) : (
                      <>
                        <Typeahead<any>
                          value={row.item_code || ''}
                          displayValue={row.item_name || row.item_code || ''}
                          onSearch={(q) =>
                            productsApi.search({
                              q,
                              ...(doc.supplier_name ? { supplierName: String(doc.supplier_name) } : {}),
                              productType: '',
                              limit: 15,
                            }).then((r) => r.rows)
                          }
                          getLabel={(r: any) => r.cm_given_name || r.item_name || r.name}
                          getValue={(r: any) => r.name}
                          onChange={(val, itemRow: any) =>
                            handleItemChange(idx, {
                              item_code: val,
                              item_name: itemRow?.cm_given_name || itemRow?.item_name || '',
                              cm_supplier_item_code: '',
                              description: '',
                              uom: itemRow?.stock_uom || row.uom || '',
                            })
                          }
                          placeholder="Search by item or supplier code…"
                        />
                        <input
                          type="text"
                          value={row.description || ''}
                          onChange={(e) => handleItemChange(idx, { description: e.target.value })}
                          placeholder="Description…"
                          className="mt-1 w-full text-[11px] text-gray-500 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-indigo-300 bg-white placeholder:text-gray-300"
                        />
                      </>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {readOnly ? (
                      <span className="tabular-nums">{Number(row.qty || 0).toFixed(2)}</span>
                    ) : (
                      <input
                        type="number"
                        className={inputCls + ' text-right'}
                        value={row.qty ?? ''}
                        min="0"
                        step="0.01"
                        onChange={(e) => handleItemChange(idx, { qty: parseFloat(e.target.value) || 0 })}
                      />
                    )}
                  </td>
                  <td className="px-2 py-2 text-gray-500">{row.uom || '—'}</td>
                  <td className="px-2 py-2 text-right">
                    {readOnly ? (
                      <span className="tabular-nums">{Number(row.rate || 0).toFixed(2)}</span>
                    ) : (
                      <input
                        type="number"
                        className={inputCls + ' text-right'}
                        value={row.rate ?? ''}
                        min="0"
                        step="0.01"
                        onChange={(e) => handleItemChange(idx, { rate: parseFloat(e.target.value) || 0 })}
                      />
                    )}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-gray-600">
                    {Number(row.amount || 0).toFixed(2)}
                  </td>
                  {!readOnly && (
                    <td className="px-2 py-2">
                      <button
                        onClick={() => handleRemoveRow(idx)}
                        className="text-red-400 hover:text-red-600 p-1"
                        title="Remove"
                      >
                        ✕
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {items.length > 0 && (
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50">
                  <td colSpan={5} className="px-2 py-2 text-right text-xs font-semibold text-gray-500">Total</td>
                  <td className="px-2 py-2 text-right text-xs font-bold text-gray-800 tabular-nums">
                    {grandTotal.toFixed(2)}
                  </td>
                  {!readOnly && <td />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {!readOnly && (
          <button
            onClick={() => setShowProduct(true)}
            className="px-3 py-1.5 rounded text-xs font-semibold border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
          >
            + Add Product
          </button>
        )}
      </div>

      {/* Terms / Notes */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-2">
        <h2 className="text-sm font-semibold text-gray-700">Terms / Notes</h2>
        <textarea
          className={inputCls + ' min-h-[80px] resize-y'}
          value={(doc.terms as string) || ''}
          onChange={(e) => patchDoc({ terms: e.target.value })}
          rows={3}
          disabled={readOnly}
          placeholder="Payment terms, delivery instructions…"
        />
      </div>

      <ProductSelectorModal
        isOpen={showProduct}
        onSelect={handleProductSelect}
        onClose={() => setShowProduct(false)}
      />
    </div>
  )
}
