/**
 * GRNEditor — create or edit a Goods Receipt (Purchase Receipt).
 *
 * Part 1  Goods Receipt  (canPurchasing | canWarehouse) — quantities, condition, warehouse
 * Part 2  Landing Costs  (canPurchasing only)           — freight, duties, etc.
 *
 * Rates are hidden from warehouse-only users.
 * Can be prefilled via location.state.doc when arriving from PurchaseOrderDetail.
 *
 * Routes:
 *   /purchases/grn/new       — create blank
 *   /purchases/grn/:id/edit  — edit existing draft
 */
import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import {
  PageHeader, ErrorBox, FieldWrap, inputCls, selectCls, DetailSection,
} from '../../components/shared/ui'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { Typeahead } from '../../components/sales/Typeahead'
import { usePermissions } from '../../auth/PermissionsProvider'
import { fmtMoney } from '../../utils/fmt'

// ── Constants ─────────────────────────────────────────────────────────────────

const CONDITION_OPTIONS = ['Good', 'Damaged', 'Short'] as const
type Condition = typeof CONDITION_OPTIONS[number]

const CONDITION_CLS: Record<Condition, string> = {
  Good:    'bg-green-50 border-green-200 text-green-800',
  Damaged: 'bg-red-50 border-red-200 text-red-800',
  Short:   'bg-amber-50 border-amber-200 text-amber-800',
}

const CHARGE_TYPES = ['Sea Freight', 'Air Freight', 'Import Duty', 'Port Handling', 'Insurance', 'Other'] as const

// ── Blank constructors ────────────────────────────────────────────────────────

interface GrnItem {
  doctype?: string
  name?: string
  item_code: string
  item_name: string
  qty: number
  uom: string
  rate: number
  amount: number
  warehouse: string
  cm_condition: string
  cm_receiving_remarks: string
}

interface LandingCharge {
  doctype?: string
  name?: string
  charge_type: string
  description: string
  amount: number
}

interface GrnDoc {
  doctype: string
  name?: string
  supplier: string
  supplier_name: string
  posting_date: string
  set_warehouse: string
  lr_no: string
  status?: string
  docstatus?: number
  items: GrnItem[]
  cm_landing_charges: LandingCharge[]
}

function blankItem(): GrnItem {
  return {
    doctype: 'Purchase Receipt Item',
    item_code: '',
    item_name: '',
    qty: 1,
    uom: '',
    rate: 0,
    amount: 0,
    warehouse: '',
    cm_condition: 'Good',
    cm_receiving_remarks: '',
  }
}

function blankCharge(): LandingCharge {
  return {
    doctype: 'CM Landing Charge',
    charge_type: 'Sea Freight',
    description: '',
    amount: 0,
  }
}

function blankDoc(): GrnDoc {
  return {
    doctype: 'Purchase Receipt',
    supplier: '',
    supplier_name: '',
    posting_date: new Date().toISOString().slice(0, 10),
    set_warehouse: '',
    lr_no: '',
    items: [blankItem()],
    cm_landing_charges: [],
  }
}

function normalise(d: Record<string, unknown>): GrnDoc {
  const doc = { ...blankDoc(), ...d, doctype: 'Purchase Receipt' } as GrnDoc
  doc.cm_landing_charges = Array.isArray(doc.cm_landing_charges) ? doc.cm_landing_charges : []
  if (Array.isArray(doc.items)) {
    doc.items = doc.items.map((r: Partial<GrnItem>) => ({
      cm_condition: 'Good',
      cm_receiving_remarks: '',
      warehouse: '',
      ...r,
    } as GrnItem))
  }
  return doc
}

// ── Component ──────────────────────────────────────────────────────────────────

export function GRNEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { can } = usePermissions()

  const isNew = !id || id === 'new'
  const isPurchasing = can('canPurchasing') || can('canAdmin')
  const isWarehouse = can('canWarehouse')

  const [doc, setDoc] = useState<GrnDoc>(() => {
    const state = (location.state as any)?.doc
    return state ? normalise(state) : blankDoc()
  })
  const [loading, setLoading] = useState(!isNew && !(location.state as any)?.doc)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(!!(location.state as any)?.doc)

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isNew || (location.state as any)?.doc) return
    setLoading(true)
    frappe
      .getDoc<Record<string, unknown>>('Purchase Receipt', decodeURIComponent(id!))
      .then((d) => { setDoc(normalise(d)); setDirty(false) })
      .catch((e: any) => setError(e.message || 'Failed to load GRN'))
      .finally(() => setLoading(false))
  }, [id, isNew]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Patch helpers ─────────────────────────────────────────────────────────
  const patchDoc = (patch: Partial<GrnDoc>) => {
    setDoc((p) => ({ ...p, ...patch }))
    setDirty(true)
  }

  const patchItem = useCallback((idx: number, patch: Partial<GrnItem>) => {
    setDoc((p) => ({
      ...p,
      items: p.items.map((r, i) => {
        if (i !== idx) return r
        const updated = { ...r, ...patch }
        updated.amount = (updated.qty || 0) * (updated.rate || 0)
        return updated
      }),
    }))
    setDirty(true)
  }, [])

  const patchCharge = useCallback((idx: number, patch: Partial<LandingCharge>) => {
    setDoc((p) => ({
      ...p,
      cm_landing_charges: p.cm_landing_charges.map((c, i) => i === idx ? { ...c, ...patch } : c),
    }))
    setDirty(true)
  }, [])

  const addRow = useCallback(() => {
    setDoc((p) => ({ ...p, items: [...p.items, blankItem()] }))
    setDirty(true)
  }, [])

  const removeRow = useCallback((idx: number) => {
    setDoc((p) => ({ ...p, items: p.items.filter((_, i) => i !== idx) }))
    setDirty(true)
  }, [])

  const addCharge = useCallback(() => {
    setDoc((p) => ({ ...p, cm_landing_charges: [...p.cm_landing_charges, blankCharge()] }))
    setDirty(true)
  }, [])

  const removeCharge = useCallback((idx: number) => {
    setDoc((p) => ({ ...p, cm_landing_charges: p.cm_landing_charges.filter((_, i) => i !== idx) }))
    setDirty(true)
  }, [])

  const applySetWarehouse = (wh: string) => {
    patchDoc({
      set_warehouse: wh,
      items: doc.items.map((r) => (!r.warehouse ? { ...r, warehouse: wh } : r)),
    })
  }

  // ── Search helpers ────────────────────────────────────────────────────────
  const searchSuppliers = (q: string) =>
    frappe.call('frappe.client.get_list', {
      doctype: 'Supplier',
      fields: ['name', 'supplier_name'],
      or_filters: [['supplier_name', 'like', `%${q}%`], ['name', 'like', `%${q}%`]],
      limit_page_length: 15,
    })

  const searchItems = (q: string) =>
    frappe.call('frappe.client.get_list', {
      doctype: 'Item',
      fields: ['name', 'item_name', 'stock_uom'],
      filters: [['disabled', '=', 0]],
      or_filters: [['name', 'like', `%${q}%`], ['item_name', 'like', `%${q}%`]],
      limit_page_length: 15,
    })

  // ── Save / Submit ─────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!doc.supplier) { setError('Supplier is required.'); return }
    if (!doc.items.length || !doc.items[0].item_code) {
      setError('At least one item is required.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const saved = await frappe.saveDoc<GrnDoc>('Purchase Receipt', doc as unknown as Record<string, unknown>)
      setDoc(normalise(saved as unknown as Record<string, unknown>))
      setDirty(false)
      if (isNew && (saved as any).name) {
        navigate(`/purchases/grn/${encodeURIComponent((saved as any).name)}/edit`, { replace: true })
      }
    } catch (e: any) {
      setError(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async () => {
    if (dirty) { setError('Save first before submitting.'); return }
    if (!window.confirm('Submit this GRN? This will update stock levels and cannot be undone.')) return
    setSubmitting(true)
    setError('')
    try {
      await frappe.post(`/api/v2/document/Purchase%20Receipt/${encodeURIComponent(doc.name!)}/submit`, {})
      const refreshed = await frappe.getDoc<Record<string, unknown>>('Purchase Receipt', doc.name!)
      setDoc(normalise(refreshed))
      setDirty(false)
    } catch (e: any) {
      setError(e.message || 'Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Guards ────────────────────────────────────────────────────────────────
  if (!isPurchasing && !isWarehouse) {
    return (
      <div className="rounded border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-800 text-center">
        You do not have permission to create or edit GRNs.
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
  const isDraft = !isSubmitted && !isCancelled
  const readOnly = !isDraft

  const totalCharges = doc.cm_landing_charges.reduce((s, c) => s + (Number(c.amount) || 0), 0)
  const totalGoods = doc.items.reduce((s, r) => s + (Number(r.amount) || 0), 0)

  return (
    <div className="space-y-5">
      {/* Header bar */}
      <PageHeader
        title={isNew ? 'New GRN' : doc.name || 'GRN'}
        subtitle={doc.supplier_name || doc.supplier}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {doc.docstatus != null && (
              <StatusBadge status={doc.status} docstatus={doc.docstatus} />
            )}

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

            <button
              onClick={() =>
                doc.name
                  ? navigate(`/purchases/grn/${encodeURIComponent(doc.name)}`)
                  : navigate('/purchases/grn')
              }
              className="px-3 py-1.5 rounded text-xs font-semibold border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {isNew ? '← Cancel' : '← View'}
            </button>
          </div>
        }
      />

      {error && <ErrorBox message={error} />}

      {/* Part 1 — Header */}
      <DetailSection title="Part 1 — Goods Receipt">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <FieldWrap label="Supplier *">
              <Typeahead<{ name: string; supplier_name: string }>
                value={doc.supplier}
                displayValue={doc.supplier_name || doc.supplier}
                onSearch={searchSuppliers}
                getLabel={(r) => `${r.supplier_name} (${r.name})`}
                getValue={(r) => r.name}
                onChange={(val, row) =>
                  patchDoc({ supplier: val, supplier_name: (row as any)?.supplier_name || val })
                }
                placeholder="Search supplier…"
                disabled={readOnly}
              />
            </FieldWrap>
          </div>

          <FieldWrap label="Posting Date">
            <input
              type="date"
              className={inputCls}
              value={doc.posting_date}
              onChange={(e) => patchDoc({ posting_date: e.target.value })}
              disabled={readOnly}
            />
          </FieldWrap>

          <FieldWrap label="Lorry / AWB No.">
            <input
              className={inputCls}
              value={doc.lr_no}
              onChange={(e) => patchDoc({ lr_no: e.target.value })}
              placeholder="LR / AWB number…"
              disabled={readOnly}
            />
          </FieldWrap>

          <div className="sm:col-span-2 lg:col-span-1">
            <FieldWrap label="Default Warehouse">
              <input
                className={inputCls}
                value={doc.set_warehouse}
                onChange={(e) => applySetWarehouse(e.target.value)}
                placeholder="e.g. Finished Goods - CM"
                disabled={readOnly}
              />
            </FieldWrap>
          </div>
        </div>
      </DetailSection>

      {/* Part 1 — Items */}
      <DetailSection title={`Items (${doc.items.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-gray-200 text-[10px] uppercase tracking-wider text-gray-400">
                <th className="text-left px-2 py-2 w-8">#</th>
                <th className="text-left px-2 py-2">Item</th>
                <th className="text-right px-2 py-2 w-20">Qty</th>
                <th className="text-left px-2 py-2 w-20">UOM</th>
                {isPurchasing && <th className="text-right px-2 py-2 w-28">Unit Cost</th>}
                {isPurchasing && <th className="text-right px-2 py-2 w-28">Amount</th>}
                <th className="text-left px-2 py-2 w-36">Condition</th>
                <th className="text-left px-2 py-2">Warehouse</th>
                {!readOnly && <th className="w-8" />}
              </tr>
            </thead>
            <tbody>
              {doc.items.map((row, idx) => (
                <tr key={idx} className="border-b border-gray-100">
                  <td className="px-2 py-1.5 text-gray-400 text-[11px]">{idx + 1}</td>

                  <td className="px-2 py-1.5 min-w-[200px]">
                    {readOnly ? (
                      <div>
                        <div className="font-medium">{row.item_code}</div>
                        <div className="text-[11px] text-gray-400">{row.item_name}</div>
                      </div>
                    ) : (
                      <Typeahead<{ name: string; item_name: string; stock_uom: string }>
                        value={row.item_code}
                        displayValue={row.item_name || row.item_code}
                        onSearch={searchItems}
                        getLabel={(r) => `${r.name} — ${r.item_name}`}
                        getValue={(r) => r.name}
                        onChange={(val, r: any) =>
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

                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className={`${inputCls} w-20 text-right`}
                      value={row.qty}
                      onChange={(e) => patchItem(idx, { qty: parseFloat(e.target.value) || 0 })}
                      disabled={readOnly}
                    />
                  </td>

                  <td className="px-2 py-1.5">
                    <input
                      className={`${inputCls} w-20`}
                      value={row.uom}
                      onChange={(e) => patchItem(idx, { uom: e.target.value })}
                      disabled={readOnly}
                    />
                  </td>

                  {isPurchasing && (
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={`${inputCls} w-28 text-right`}
                        value={row.rate}
                        onChange={(e) => patchItem(idx, { rate: parseFloat(e.target.value) || 0 })}
                        disabled={readOnly}
                      />
                    </td>
                  )}

                  {isPurchasing && (
                    <td className="px-2 py-1.5 text-right tabular-nums text-gray-600">
                      {fmtMoney(row.amount)}
                    </td>
                  )}

                  <td className="px-2 py-1.5">
                    {readOnly ? (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-semibold ${CONDITION_CLS[row.cm_condition as Condition] || ''}`}>
                        {row.cm_condition}
                      </span>
                    ) : (
                      <select
                        className={`${selectCls} w-28`}
                        value={row.cm_condition}
                        onChange={(e) => patchItem(idx, { cm_condition: e.target.value })}
                      >
                        {CONDITION_OPTIONS.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    )}
                  </td>

                  <td className="px-2 py-1.5">
                    <input
                      className={`${inputCls} w-40`}
                      value={row.warehouse}
                      onChange={(e) => patchItem(idx, { warehouse: e.target.value })}
                      placeholder={doc.set_warehouse || 'Warehouse…'}
                      disabled={readOnly}
                    />
                  </td>

                  {!readOnly && (
                    <td className="px-2 py-1.5">
                      <button
                        className="text-gray-400 hover:text-red-500 transition-colors text-[12px]"
                        onClick={() => removeRow(idx)}
                        title="Remove row"
                      >
                        ✕
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!readOnly && (
          <button
            className="mt-2 text-sm text-cm-green hover:underline"
            onClick={addRow}
          >
            + Add Row
          </button>
        )}

        {isPurchasing && (
          <div className="mt-3 flex justify-end">
            <div className="w-64 space-y-1 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Goods Total</span>
                <span className="tabular-nums">{fmtMoney(totalGoods)}</span>
              </div>
              {totalCharges > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Landing Costs</span>
                  <span className="tabular-nums">{fmtMoney(totalCharges)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold border-t border-gray-200 pt-1">
                <span>Total</span>
                <span className="tabular-nums">{fmtMoney(totalGoods + totalCharges)}</span>
              </div>
            </div>
          </div>
        )}
      </DetailSection>

      {/* Part 2 — Landing Costs (canPurchasing only) */}
      {isPurchasing && (
        <DetailSection title="Part 2 — Landing Costs">
          {doc.cm_landing_charges.length === 0 && readOnly ? (
            <p className="text-sm text-gray-400">No landing charges recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[500px]">
                <thead>
                  <tr className="border-b border-gray-200 text-[10px] uppercase tracking-wider text-gray-400">
                    <th className="text-left px-2 py-2">Type</th>
                    <th className="text-left px-2 py-2">Description</th>
                    <th className="text-right px-2 py-2 w-32">Amount (€)</th>
                    {!readOnly && <th className="w-8" />}
                  </tr>
                </thead>
                <tbody>
                  {doc.cm_landing_charges.map((c, idx) => (
                    <tr key={idx} className="border-b border-gray-100">
                      <td className="px-2 py-1.5">
                        {readOnly ? (
                          <span>{c.charge_type}</span>
                        ) : (
                          <select
                            className={`${selectCls} w-36`}
                            value={c.charge_type}
                            onChange={(e) => patchCharge(idx, { charge_type: e.target.value })}
                          >
                            {CHARGE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {readOnly ? (
                          <span className="text-gray-600">{c.description}</span>
                        ) : (
                          <input
                            className={`${inputCls} w-full`}
                            value={c.description}
                            onChange={(e) => patchCharge(idx, { description: e.target.value })}
                            placeholder="Description…"
                          />
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {readOnly ? (
                          <span className="tabular-nums text-right block">{fmtMoney(c.amount)}</span>
                        ) : (
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className={`${inputCls} w-32 text-right`}
                            value={c.amount}
                            onChange={(e) => patchCharge(idx, { amount: parseFloat(e.target.value) || 0 })}
                          />
                        )}
                      </td>
                      {!readOnly && (
                        <td className="px-2 py-1.5">
                          <button
                            className="text-gray-400 hover:text-red-500 text-[12px] transition-colors"
                            onClick={() => removeCharge(idx)}
                            title="Remove"
                          >
                            ✕
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!readOnly && (
            <button
              className="mt-2 text-sm text-cm-green hover:underline"
              onClick={addCharge}
            >
              + Add Charge
            </button>
          )}

          {doc.cm_landing_charges.length > 0 && (
            <div className="mt-3 flex justify-end">
              <div className="w-64 text-sm font-semibold flex justify-between border-t border-gray-200 pt-1">
                <span>Total Landing</span>
                <span className="tabular-nums">{fmtMoney(totalCharges)}</span>
              </div>
            </div>
          )}
        </DetailSection>
      )}
    </div>
  )
}
