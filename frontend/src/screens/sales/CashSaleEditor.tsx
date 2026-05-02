import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import {
  PageHeader, ErrorBox, FieldWrap, inputCls, selectCls,
} from '../../components/shared/ui'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { ItemsTable, type ItemRow } from '../../components/sales/ItemsTable'
import { TotalsPanel } from '../../components/sales/TotalsPanel'
import { Typeahead } from '../../components/sales/Typeahead'
import { fmtDate } from '../../utils/fmt'
import { fmtMoneyExact } from '../../utils/pricing'
import { usePermissions } from '../../auth/PermissionsProvider'

const PAYMENT_MODES = ['Cash', 'Card', 'Bank Transfer', 'Cheque', 'Card Payment (MyPOS)']

function blankItem(): Partial<ItemRow> {
  return {
    doctype: 'Sales Invoice Item',
    item_code: '',
    item_name: '',
    qty: 1,
    uom: '',
    rate: 0,
    amount: 0,
  }
}

function blankDoc() {
  return {
    doctype: 'Sales Invoice',
    is_pos: 1,
    customer: '',
    customer_name: '',
    posting_date: new Date().toISOString().slice(0, 10),
    currency: 'EUR',
    items: [blankItem()],
    payments: [{ mode_of_payment: 'Cash', amount: 0 }],
  }
}

function FieldRow({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-gray-900">{value || '—'}</dd>
    </div>
  )
}

export function CashSaleEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { can } = usePermissions()
  const isNew = !id || id === 'new'

  const [doc, setDoc] = useState<Record<string, unknown>>(() => blankDoc())
  const [loading, setLoading] = useState(!isNew)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isNew) return
    setLoading(true)
    frappe
      .getDoc('Sales Invoice', id!)
      .then((data) => setDoc(data as Record<string, unknown>))
      .catch((err: any) => setError(err.message || 'Failed to load cash sale'))
      .finally(() => setLoading(false))
  }, [id, isNew])

  const patchDoc = useCallback((patch: Record<string, unknown>) => {
    setDoc((prev) => ({ ...prev, ...patch }))
  }, [])

  const handleItemChange = useCallback((idx: number, patch: Partial<ItemRow>) => {
    setDoc((prev) => ({
      ...prev,
      items: ((prev.items as ItemRow[]) || []).map((row, i) => (i === idx ? { ...row, ...patch } : row)),
    }))
  }, [])

  const handleRemoveRow = useCallback((idx: number) => {
    setDoc((prev) => ({
      ...prev,
      items: ((prev.items as ItemRow[]) || []).filter((_, i) => i !== idx),
    }))
  }, [])

  const handleAddRow = useCallback(() => {
    setDoc((prev) => ({
      ...prev,
      items: [...((prev.items as ItemRow[]) || []), blankItem()],
    }))
  }, [])

  const searchCustomers = useCallback((q: string) =>
    frappe.call('frappe.client.get_list', {
      doctype: 'Customer',
      fields: ['name', 'customer_name'],
      or_filters: [
        ['customer_name', 'like', `%${q}%`],
        ['name', 'like', `%${q}%`],
      ],
      limit_page_length: 15,
    }), [])

  const handlePost = async () => {
    if (!doc.customer) { setError('Customer is required.'); return }
    const items = (doc.items as ItemRow[]) || []
    if (!items.length || !items[0].item_code) { setError('At least one item is required.'); return }
    if (!window.confirm('Post this Cash Sale? The invoice will be submitted immediately.')) return

    setPosting(true)
    setError('')
    try {
      const saved = await frappe.saveDoc('Sales Invoice', doc)
      const savedName = (saved as any).name as string
      await frappe.post(`/api/v2/document/Sales%20Invoice/${encodeURIComponent(savedName)}/submit`, {})
      navigate(`/sales/cash-sales/${encodeURIComponent(savedName)}`, { replace: true })
    } catch (err: any) {
      setError(err.message || 'Failed to post cash sale')
    } finally {
      setPosting(false)
    }
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
  const readOnly = isSubmitted || isCancelled || !isNew

  const payments = (doc.payments as Array<{ mode_of_payment?: string; amount?: number }>) || []
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0)

  return (
    <div className="space-y-5">
      <PageHeader
        title={isNew ? 'New Cash Sale' : (doc.name as string) || 'Cash Sale'}
        subtitle={(doc.customer_name as string) || (doc.customer as string)}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {doc.docstatus != null && (
              <StatusBadge status={doc.status as string} docstatus={doc.docstatus as number} />
            )}

            {isNew && can('canSales') && (
              <button
                onClick={() => void handlePost()}
                disabled={posting}
                className="px-4 py-1.5 rounded text-sm font-semibold bg-cm-green text-white hover:bg-cm-green/90 disabled:opacity-50 transition-colors"
              >
                {posting ? 'Posting…' : '✓ Post Cash Sale'}
              </button>
            )}

            {!isNew && (
              <a
                href={`/printview?doctype=Sales%20Invoice&name=${encodeURIComponent(doc.name as string)}&trigger_print=1`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded text-xs font-semibold border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
              >
                🖨 Print
              </a>
            )}

            <button
              onClick={() => navigate('/sales/cash-sales')}
              className="px-3 py-1.5 rounded text-xs font-semibold border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
            >
              ← Back
            </button>
          </div>
        }
      />

      {error && <ErrorBox message={error} />}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-5">

          {/* Header */}
          <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Header</h2>
            {readOnly ? (
              <dl className="grid grid-cols-2 gap-4">
                <FieldRow label="Reference" value={doc.name as string} />
                <FieldRow label="Customer" value={doc.customer_name as string} />
                <FieldRow label="Date" value={fmtDate(doc.posting_date as string)} />
                <FieldRow label="Currency" value={doc.currency as string} />
              </dl>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Typeahead<{ name: string; customer_name: string }>
                    value={doc.customer as string || ''}
                    displayValue={(doc.customer_name as string) || (doc.customer as string) || ''}
                    onSearch={searchCustomers}
                    getLabel={(r) => `${r.customer_name} (${r.name})`}
                    getValue={(r) => r.name}
                    onChange={(val, row) =>
                      patchDoc({ customer: val, customer_name: (row as any)?.customer_name || val })
                    }
                    placeholder="Search customer…"
                  />
                </div>
                <FieldWrap label="Sale Date *">
                  <input
                    type="date"
                    className={inputCls}
                    value={doc.posting_date as string || ''}
                    onChange={(e) => patchDoc({ posting_date: e.target.value })}
                  />
                </FieldWrap>
                <FieldWrap label="Currency">
                  <input
                    className={inputCls}
                    value={doc.currency as string || ''}
                    onChange={(e) => patchDoc({ currency: e.target.value })}
                    placeholder="EUR"
                  />
                </FieldWrap>
              </div>
            )}
          </div>

          {/* Items */}
          <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">Items</h2>
            <ItemsTable
              items={(doc.items as ItemRow[]) || []}
              readOnly={readOnly}
              showIncVat={false}
              onItemChange={handleItemChange}
              onRemoveRow={handleRemoveRow}
            />
            {!readOnly && (
              <div className="mt-2 flex gap-2">
                <button
                  onClick={handleAddRow}
                  className="px-3 py-1.5 rounded text-xs font-semibold border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  + Add Row
                </button>
              </div>
            )}
            {!readOnly && (
              <p className="text-[11px] text-gray-400">
                Amounts are calculated by the server after posting.
              </p>
            )}
          </div>

          {/* Payment */}
          <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">Payment</h2>
            {readOnly ? (
              isSubmitted ? (
                <dl className="grid grid-cols-2 gap-4">
                  {payments.map((p, i) => (
                    <FieldRow
                      key={p.mode_of_payment || String(i)}
                      label={p.mode_of_payment || 'Cash'}
                      value={fmtMoneyExact(p.amount)}
                    />
                  ))}
                  {totalPaid > 0 && doc.grand_total && totalPaid > (doc.grand_total as number) && (
                    <FieldRow label="Change" value={fmtMoneyExact(totalPaid - (doc.grand_total as number))} />
                  )}
                </dl>
              ) : (
                <p className="text-sm text-gray-400">—</p>
              )
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <FieldWrap label="Mode of Payment">
                  <select
                    className={selectCls}
                    value={payments[0]?.mode_of_payment || 'Cash'}
                    onChange={(e) =>
                      patchDoc({ payments: [{ mode_of_payment: e.target.value, amount: payments[0]?.amount || 0 }] })
                    }
                  >
                    {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </FieldWrap>
                <FieldWrap label="Paid Amount">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={inputCls}
                    value={payments[0]?.amount ?? ''}
                    onChange={(e) =>
                      patchDoc({ payments: [{ mode_of_payment: payments[0]?.mode_of_payment || 'Cash', amount: parseFloat(e.target.value) || 0 }] })
                    }
                    placeholder="Leave blank to auto-fill from total"
                  />
                </FieldWrap>
              </div>
            )}
          </div>
        </div>

        <div>
          <TotalsPanel doc={doc} />
        </div>
      </div>
    </div>
  )
}
