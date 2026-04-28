/**
 * BillEditor — create and edit Purchase Invoice (supplier bill) drafts.
 *
 * Routes:
 *   /finance/bills/new        create blank
 *   /finance/bills/:id/edit   edit draft
 *
 * Accepts location.state.doc when navigated from PurchaseOrderDetail.
 * Gate: canFinance || canPurchasing || canAdmin
 */
import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import {
  PageHeader, ErrorBox, DetailSection, FieldWrap, inputCls, BackLink,
} from '../../components/shared/ui'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { Typeahead } from '../../components/sales/Typeahead'
import { usePermissions } from '../../auth/PermissionsProvider'
import { fmtMoney } from '../../utils/fmt'

// ── Types ─────────────────────────────────────────────────────────────────────

interface BillItem {
  doctype?: string
  name?: string
  item_code: string
  item_name: string
  qty: number
  uom: string
  rate: number
  amount: number
}

interface BillDoc {
  doctype: string
  name?: string
  supplier: string
  supplier_name: string
  posting_date: string
  bill_no: string
  bill_date: string
  due_date: string
  status?: string
  docstatus?: number
  items: BillItem[]
  taxes?: unknown[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().slice(0, 10)

function blankItem(): BillItem {
  return {
    doctype: 'Purchase Invoice Item',
    item_code: '',
    item_name: '',
    qty: 1,
    uom: '',
    rate: 0,
    amount: 0,
  }
}

function blankDoc(override: Partial<BillDoc> = {}): BillDoc {
  return {
    doctype: 'Purchase Invoice',
    supplier: '',
    supplier_name: '',
    posting_date: today(),
    bill_no: '',
    bill_date: '',
    due_date: '',
    items: [blankItem()],
    taxes: [],
    ...override,
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

export function BillEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { can } = usePermissions()

  const isNew = !id || id === 'new'
  const stateDoc = (location.state as any)?.doc ?? null

  const [doc, setDoc] = useState<BillDoc>(() => stateDoc ? { ...blankDoc(), ...stateDoc, doctype: 'Purchase Invoice' } : blankDoc())
  const [loading, setLoading] = useState(!isNew && !stateDoc)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(!!stateDoc)

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isNew || stateDoc) return
    setLoading(true)
    frappe
      .getDoc<BillDoc>('Purchase Invoice', decodeURIComponent(id!))
      .then((d) => { setDoc(d); setDirty(false) })
      .catch((e: any) => setError(e.message || 'Failed to load bill'))
      .finally(() => setLoading(false))
  }, [id, isNew]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Patch helpers ─────────────────────────────────────────────────────────
  const patchDoc = (patch: Partial<BillDoc>) => {
    setDoc((p) => ({ ...p, ...patch }))
    setDirty(true)
  }

  const patchItem = useCallback((idx: number, patch: Partial<BillItem>) => {
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

  const addRow = useCallback(() => {
    setDoc((p) => ({ ...p, items: [...p.items, blankItem()] }))
    setDirty(true)
  }, [])

  const removeRow = useCallback((idx: number) => {
    setDoc((p) => ({ ...p, items: p.items.filter((_, i) => i !== idx) }))
    setDirty(true)
  }, [])

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
      const saved = await frappe.saveDoc<BillDoc>('Purchase Invoice', doc as unknown as Record<string, unknown>)
      setDoc(saved as unknown as BillDoc)
      setDirty(false)
      const savedName = (saved as any).name as string
      if (isNew && savedName) {
        navigate(`/finance/bills/${encodeURIComponent(savedName)}/edit`, { replace: true })
      }
    } catch (e: any) {
      setError(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async () => {
    if (dirty) { setError('Save first before submitting.'); return }
    if (!window.confirm('Submit this bill? This will create an AP entry and cannot be undone.')) return
    setSubmitting(true)
    setError('')
    try {
      await frappe.post(`/api/v2/document/Purchase%20Invoice/${encodeURIComponent(doc.name!)}/submit`, {})
      const refreshed = await frappe.getDoc<BillDoc>('Purchase Invoice', doc.name!)
      setDoc(refreshed)
      setDirty(false)
    } catch (e: any) {
      setError(e.message || 'Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Guards ────────────────────────────────────────────────────────────────
  if (!can('canFinance') && !can('canPurchasing') && !can('canAdmin')) {
    return (
      <div className="rounded border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-800 text-center">
        You do not have permission to create or edit bills.
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

  const grandTotal = doc.items.reduce((s, r) => s + (Number(r.amount) || 0), 0)

  return (
    <div className="space-y-5">
      <BackLink label="Bills" onClick={() => navigate('/finance/bills')} />

      <PageHeader
        title={isNew ? 'New Bill' : doc.name || 'Bill'}
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

            {!isNew && isSubmitted && (
              <button
                onClick={() => navigate(`/finance/bills/${encodeURIComponent(doc.name!)}`)}
                className="px-3 py-1.5 rounded text-xs font-semibold border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
              >
                View Detail →
              </button>
            )}
          </div>
        }
      />

      {error && <ErrorBox message={error} />}

      {/* Header fields */}
      <DetailSection title="Header">
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

          <FieldWrap label="Supplier Bill No">
            <input
              className={inputCls}
              value={doc.bill_no}
              onChange={(e) => patchDoc({ bill_no: e.target.value })}
              placeholder="Supplier's invoice number"
              disabled={readOnly}
            />
          </FieldWrap>

          <FieldWrap label="Bill Date">
            <input
              type="date"
              className={inputCls}
              value={doc.bill_date}
              onChange={(e) => patchDoc({ bill_date: e.target.value })}
              disabled={readOnly}
            />
          </FieldWrap>

          <FieldWrap label="Posting Date">
            <input
              type="date"
              className={inputCls}
              value={doc.posting_date}
              onChange={(e) => patchDoc({ posting_date: e.target.value })}
              disabled={readOnly}
            />
          </FieldWrap>

          <FieldWrap label="Due Date">
            <input
              type="date"
              className={inputCls}
              value={doc.due_date}
              onChange={(e) => patchDoc({ due_date: e.target.value })}
              disabled={readOnly}
            />
          </FieldWrap>
        </div>
      </DetailSection>

      {/* Items */}
      <DetailSection title={`Items (${doc.items.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="border-b border-gray-200 text-[10px] uppercase tracking-wider text-gray-400">
                <th className="text-left px-2 py-2 w-8">#</th>
                <th className="text-left px-2 py-2">Item</th>
                <th className="text-right px-2 py-2 w-20">Qty</th>
                <th className="text-left px-2 py-2 w-20">UOM</th>
                <th className="text-right px-2 py-2 w-32">Rate (€)</th>
                <th className="text-right px-2 py-2 w-32">Amount (€)</th>
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
                      type="number" min="0" step="1"
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

                  <td className="px-2 py-1.5">
                    <input
                      type="number" min="0" step="0.01"
                      className={`${inputCls} w-32 text-right`}
                      value={row.rate}
                      onChange={(e) => patchItem(idx, { rate: parseFloat(e.target.value) || 0 })}
                      disabled={readOnly}
                    />
                  </td>

                  <td className="px-2 py-1.5 text-right tabular-nums text-gray-600">
                    {fmtMoney(row.amount)}
                  </td>

                  {!readOnly && (
                    <td className="px-2 py-1.5">
                      <button
                        className="text-gray-400 hover:text-red-500 text-[12px] transition-colors"
                        onClick={() => removeRow(idx)}
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

        {!readOnly && (
          <button className="mt-2 text-sm text-cm-green hover:underline" onClick={addRow}>
            + Add Row
          </button>
        )}

        <div className="mt-3 flex justify-end">
          <div className="w-64 text-sm font-semibold flex justify-between border-t border-gray-200 pt-1">
            <span>Grand Total</span>
            <span className="tabular-nums">{fmtMoney(grandTotal)}</span>
          </div>
        </div>
      </DetailSection>
    </div>
  )
}
