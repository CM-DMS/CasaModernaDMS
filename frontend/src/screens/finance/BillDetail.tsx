import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import {
  PageHeader, ErrorBox, DetailSection, DetailGrid, DetailField,
  DataTable, FieldWrap, inputCls, selectCls, Btn, BackLink, type Column,
} from '../../components/shared/ui'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { usePermissions } from '../../auth/PermissionsProvider'
import { fmtDate, fmtMoney } from '../../utils/fmt'

interface BillItem {
  name: string
  item_code: string
  item_name?: string
  qty: number
  uom?: string
  rate: number
  amount: number
}

interface PaymentRecord {
  payment_entry: string
  posting_date: string
  mode_of_payment: string
  reference_no?: string
  allocated_amount: number
  remarks?: string
}

interface BillDoc {
  name: string
  supplier?: string
  supplier_name?: string
  bill_no?: string
  bill_date?: string
  posting_date?: string
  due_date?: string
  status?: string
  docstatus?: number
  outstanding_amount?: number
  grand_total?: number
  total?: number
  total_taxes_and_charges?: number
  items?: BillItem[]
  terms?: string
}

const itemColumns: Column<BillItem>[] = [
  { key: 'item_code', label: 'Item Code' },
  { key: 'item_name', label: 'Description' },
  { key: 'qty', label: 'Qty', align: 'right' },
  { key: 'uom', label: 'UOM' },
  { key: 'rate', label: 'Rate', align: 'right', render: (v) => fmtMoney(v as number) },
  { key: 'amount', label: 'Total', align: 'right', render: (v) => fmtMoney(v as number) },
]

const payColumns: Column<PaymentRecord>[] = [
  { key: 'posting_date', label: 'Date', render: (v) => fmtDate(v as string) },
  { key: 'payment_entry', label: 'Entry', render: (v) => <span className="font-mono text-[11px] text-cm-green">{v as string}</span> },
  { key: 'mode_of_payment', label: 'Mode' },
  { key: 'reference_no', label: 'Ref No' },
  { key: 'allocated_amount', label: 'Amount', align: 'right', render: (v) => fmtMoney(v as number) },
  { key: 'remarks', label: 'Remarks' },
]

const today = () => new Date().toISOString().slice(0, 10)

export function BillDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { can } = usePermissions()

  const [doc, setDoc] = useState<BillDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [payHistory, setPayHistory] = useState<PaymentRecord[]>([])
  const [modes, setModes] = useState<string[]>([])
  const [showPayForm, setShowPayForm] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payMop, setPayMop] = useState('')
  const [payPostDate, setPayPostDate] = useState(today())
  const [payRefNo, setPayRefNo] = useState('')
  const [payRefDate, setPayRefDate] = useState('')
  const [payRemarks, setPayRemarks] = useState('')
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState('')
  const [paySuccess, setPaySuccess] = useState('')

  const loadDoc = useCallback(() => {
    if (!id) return
    setLoading(true)
    frappe
      .getDoc<BillDoc>('Purchase Invoice', decodeURIComponent(id))
      .then((d) => {
        setDoc(d)
        if (d.docstatus === 1) {
          setPayAmount(String(Number(d.outstanding_amount || 0).toFixed(2)))
          Promise.all([
            frappe.call<PaymentRecord[]>('frappe.client.get_list', {
              doctype: 'Payment Entry Reference',
              fields: ['parent as payment_entry', 'posting_date', 'mode_of_payment', 'reference_no', 'allocated_amount', 'remarks'],
              filters: [['reference_name', '=', d.name], ['reference_doctype', '=', 'Purchase Invoice']],
              limit_page_length: 50,
            }).catch(() => [] as PaymentRecord[]),
            frappe.call<Array<{ name: string }>>('frappe.client.get_list', {
              doctype: 'Mode of Payment',
              fields: ['name'],
              limit_page_length: 30,
            }).catch(() => [] as Array<{ name: string }>),
          ]).then(([hist, modeList]) => {
            setPayHistory(Array.isArray(hist) ? hist : [])
            const names = Array.isArray(modeList) ? modeList.map((m) => m.name) : []
            setModes(names)
            if (names.length) setPayMop(names[0])
          })
        }
      })
      .catch((e: any) => setError(e.message || 'Failed to load bill'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => { loadDoc() }, [loadDoc])

  const handlePay = useCallback(async () => {
    const amt = parseFloat(payAmount)
    if (!amt || amt <= 0) { setPayError('Enter a valid amount.'); return }
    if (!payMop) { setPayError('Select a mode of payment.'); return }
    setPaying(true)
    setPayError('')
    try {
      const result = await frappe.call<{ payment_entry: string }>(
        'casamoderna_dms.ap_payment_api.make_payment',
        {
          bill_name: doc!.name,
          amount: amt,
          mode_of_payment: payMop,
          posting_date: payPostDate,
          reference_no: payRefNo,
          reference_date: payRefDate,
          remarks: payRemarks,
        },
      )
      setPaySuccess(`Payment ${result.payment_entry} posted.`)
      setShowPayForm(false)
      setPayRefNo('')
      setPayRefDate('')
      setPayRemarks('')
      loadDoc()
    } catch (e: any) {
      setPayError(e.message || 'Payment failed')
    } finally {
      setPaying(false)
    }
  }, [doc, payAmount, payMop, payPostDate, payRefNo, payRefDate, payRemarks, loadDoc])

  if (loading) return <div className="py-12 text-center text-gray-400">Loading…</div>
  if (error) return <ErrorBox message={error} />
  if (!doc) return <ErrorBox message="Bill not found." />

  const isDraft = doc.docstatus === 0
  const isSubmitted = doc.docstatus === 1
  const outstanding = Number(doc.outstanding_amount) || 0
  const canPay = (can('canFinance') || can('canFinanceAccounting') || can('canAdmin')) && isSubmitted && outstanding > 0

  return (
    <div className="space-y-4">
      <BackLink label="Bills" onClick={() => navigate('/finance/bills')} />

      <PageHeader
        title={doc.name}
        subtitle={doc.supplier_name || doc.supplier}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={doc.status} docstatus={doc.docstatus} />

            {isDraft && (can('canFinance') || can('canPurchasing') || can('canAdmin')) && (
              <Btn onClick={() => navigate(`/finance/bills/${encodeURIComponent(doc.name)}/edit`)}>
                ✏️ Edit
              </Btn>
            )}

            <Btn variant="ghost" onClick={() => navigate('/finance/bills')}>← Back</Btn>
          </div>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 space-y-4">
          <DetailSection title="Header">
            <DetailGrid>
              <DetailField label="Reference" value={doc.name} />
              <DetailField label="Supplier" value={doc.supplier_name || doc.supplier} />
              <DetailField label="Supplier Bill No" value={doc.bill_no} />
              <DetailField label="Bill Date" value={fmtDate(doc.bill_date)} />
              <DetailField label="Posting Date" value={fmtDate(doc.posting_date)} />
              <DetailField label="Due Date" value={fmtDate(doc.due_date)} />
            </DetailGrid>
          </DetailSection>

          <DetailSection title={`Items (${(doc.items || []).length})`}>
            <DataTable columns={itemColumns} rows={doc.items ?? []} emptyMessage="No items." />
            <div className="mt-3 flex justify-end">
              <div className="w-64 space-y-1 text-sm">
                {(doc.total_taxes_and_charges ?? 0) !== 0 && (
                  <>
                    <div className="flex justify-between text-gray-500">
                      <span>Net Total</span>
                      <span className="tabular-nums">{fmtMoney(doc.total)}</span>
                    </div>
                    <div className="flex justify-between text-gray-500">
                      <span>VAT</span>
                      <span className="tabular-nums">{fmtMoney(doc.total_taxes_and_charges)}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between font-semibold border-t border-gray-200 pt-1">
                  <span>Grand Total</span>
                  <span className="tabular-nums">{fmtMoney(doc.grand_total)}</span>
                </div>
              </div>
            </div>
          </DetailSection>

          {doc.terms && (
            <DetailSection title="Terms / Notes">
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{doc.terms}</p>
            </DetailSection>
          )}
        </div>

        <div className="space-y-4">
          {isSubmitted && outstanding > 0 && (
            <DetailSection title="Outstanding">
              <p className="text-2xl font-bold tabular-nums text-amber-700">{fmtMoney(outstanding)}</p>
              <p className="text-xs text-gray-400 mt-1">Unpaid to supplier</p>
            </DetailSection>
          )}

          {isSubmitted && outstanding <= 0 && (
            <DetailSection title="Status">
              <p className="text-sm font-semibold text-green-700">✓ Fully Paid</p>
            </DetailSection>
          )}

          {paySuccess && (
            <div className="rounded border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">
              ✓ {paySuccess}
            </div>
          )}

          {canPay && !showPayForm && (
            <DetailSection title="Payment">
              <Btn onClick={() => { setShowPayForm(true); setPaySuccess('') }}>Pay This Bill</Btn>
            </DetailSection>
          )}

          {canPay && showPayForm && (
            <DetailSection title="Make Payment">
              {payError && <ErrorBox message={payError} />}
              <div className="space-y-3 mt-2">
                <FieldWrap label="Amount (€)">
                  <input
                    type="number" min="0.01" step="0.01"
                    className={inputCls}
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                  />
                </FieldWrap>

                <FieldWrap label="Mode of Payment">
                  <select className={selectCls} value={payMop} onChange={(e) => setPayMop(e.target.value)}>
                    {modes.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </FieldWrap>

                <FieldWrap label="Posting Date">
                  <input type="date" className={inputCls} value={payPostDate} onChange={(e) => setPayPostDate(e.target.value)} />
                </FieldWrap>

                <FieldWrap label="Reference No">
                  <input className={inputCls} value={payRefNo} onChange={(e) => setPayRefNo(e.target.value)} placeholder="Cheque / IBAN ref…" />
                </FieldWrap>

                <FieldWrap label="Reference Date">
                  <input type="date" className={inputCls} value={payRefDate} onChange={(e) => setPayRefDate(e.target.value)} />
                </FieldWrap>

                <FieldWrap label="Remarks">
                  <input className={inputCls} value={payRemarks} onChange={(e) => setPayRemarks(e.target.value)} placeholder="Optional remarks" />
                </FieldWrap>

                <div className="flex gap-2 pt-1">
                  <Btn onClick={() => void handlePay()} disabled={paying}>
                    {paying ? 'Posting…' : 'Post Payment'}
                  </Btn>
                  <Btn variant="ghost" onClick={() => { setShowPayForm(false); setPayError('') }}>Cancel</Btn>
                </div>
              </div>
            </DetailSection>
          )}
        </div>
      </div>

      {isSubmitted && payHistory.length > 0 && (
        <DetailSection title="Payment History">
          <DataTable columns={payColumns} rows={payHistory} emptyMessage="No payments." keyField="payment_entry" />
        </DetailSection>
      )}
    </div>
  )
}
