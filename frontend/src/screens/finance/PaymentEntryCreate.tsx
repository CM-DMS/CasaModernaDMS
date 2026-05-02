/**
 * PaymentEntryCreate — create and view Payment Entry (customer receipts).
 *
 * Create mode: /sales/receipts/new
 *   - Accepts location.state: { party, party_name, paid_amount, reference_invoice, ref_so }
 *   - Save + Submit in one "Post Payment" action
 * View mode: /sales/receipts/:name
 *   - Read-only detail of a submitted Payment Entry
 */
import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import { CM } from '../../components/ui/CMClassNames'
import { CMSection, CMField, CMButton } from '../../components/ui/CMComponents'
import { PageHeader, BackLink, ErrorBox, DetailSection, DetailGrid, DetailField } from '../../components/shared/ui'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { Typeahead } from '../../components/sales/Typeahead'
import { usePermissions } from '../../auth/PermissionsProvider'
import { fmtDate, fmtMoney } from '../../utils/fmt'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PaymentEntryDoc {
  name: string
  party?: string
  party_name?: string
  paid_amount?: number
  mode_of_payment?: string
  reference_no?: string
  reference_date?: string
  posting_date?: string
  docstatus?: number
  cm_payment_purpose?: string
  remarks?: string
  references?: Array<{
    reference_doctype: string
    reference_name: string
    allocated_amount: number
  }>
}

interface VoucherValidation {
  name: string
  voucher_code: string
  voucher_value: number
  valid_until: string
  recipient_customer: string
  recipient_name?: string
  status: string
}

interface FormState {
  party: string
  party_name: string
  paid_amount: string
  mode_of_payment: string
  payment_purpose: string
  reference_no: string
  reference_date: string
  posting_date: string
  remarks: string
  reference_invoice: string
  ref_so: string
  redeem_code: string
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function blankForm(state: Partial<FormState> = {}): FormState {
  return {
    party: state.party ?? '',
    party_name: state.party_name ?? '',
    paid_amount: state.paid_amount ?? '',
    mode_of_payment: state.mode_of_payment ?? 'Cash',
    payment_purpose: state.payment_purpose ?? 'Deposit',
    reference_no: '',
    reference_date: '',
    posting_date: today(),
    remarks: '',
    reference_invoice: state.reference_invoice ?? '',
    ref_so: state.ref_so ?? '',
    redeem_code: '',
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PaymentEntryCreate() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { can } = usePermissions()

  const isNew = !name || name === 'new'

  const [form, setForm] = useState<FormState>(() =>
    blankForm((location.state as Partial<FormState>) ?? {}),
  )
  const [doc, setDoc] = useState<PaymentEntryDoc | null>(null)
  const [modes, setModes] = useState<string[]>([])
  const [loading, setLoading] = useState(!isNew)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')
  const [successName, setSuccessName] = useState('')
  const [validatedVoucher, setValidatedVoucher] = useState<VoucherValidation | null>(null)
  const [voucherError, setVoucherError] = useState('')
  const [validating, setValidating] = useState(false)

  // Load modes of payment
  useEffect(() => {
    frappe.getList<{ name: string }>('Mode of Payment', {
      fields: ['name'],
      limit: 30,
      order_by: 'name asc',
    })
      .then((rows) => { if (rows.length) setModes(rows.map((r) => r.name)) })
      .catch(() => {})
  }, [])

  // Load existing doc when viewing
  const loadDoc = useCallback(() => {
    if (isNew || !name) return
    setLoading(true)
    frappe.getDoc<PaymentEntryDoc>('Payment Entry', name)
      .then(setDoc)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load receipt'))
      .finally(() => setLoading(false))
  }, [isNew, name])

  useEffect(() => { loadDoc() }, [loadDoc])

  const patch = (updates: Partial<FormState>) =>
    setForm((prev) => ({ ...prev, ...updates }))

  const searchCustomers = async (q: string) => {
    return frappe.getList<{ name: string; customer_name: string }>('Customer', {
      fields: ['name', 'customer_name'],
      filters: [['customer_name', 'like', `%${q}%`, '']],
      limit: 15,
    })
  }

  const searchSalesOrders = async (q: string) => {
    const filters: Array<[string, string, string, unknown]> = [['docstatus', '=', '1', '']]
    if (q) filters.push(['name', 'like', `%${q}%`, ''])
    return frappe.getList<{ name: string; customer: string; customer_name: string; grand_total: number; transaction_date: string }>('Sales Order', {
      fields: ['name', 'customer', 'customer_name', 'grand_total', 'transaction_date'],
      filters,
      limit: 20,
      order_by: 'transaction_date desc',
    })
  }

  const searchInvoices = async (q: string) => {
    const filters: Array<[string, string, string, unknown]> = [
      ['docstatus', '=', '1', ''],
      ['outstanding_amount', '>', '0', ''],
    ]
    if (form.party) filters.push(['customer', '=', form.party, ''])
    if (q) filters.push(['name', 'like', `%${q}%`, ''])
    return frappe.getList<{ name: string; customer: string; customer_name: string; grand_total: number; outstanding_amount: number; posting_date: string }>('Sales Invoice', {
      fields: ['name', 'customer', 'customer_name', 'grand_total', 'outstanding_amount', 'posting_date'],
      filters,
      limit: 20,
      order_by: 'posting_date desc',
    })
  }

  const handleValidateVoucher = async () => {
    setVoucherError('')
    setValidatedVoucher(null)
    const code = form.redeem_code.replace(/-/g, '')
    if (code.length < 8) { setVoucherError('Please enter a valid voucher code.'); return }
    setValidating(true)
    try {
      const v = await frappe.call<VoucherValidation>(
        'casamoderna_dms.voucher_api.validate_voucher_for_payment',
        { voucher_code: form.redeem_code, customer: form.party || '', amount: 0 },
      )
      if (v) {
        setValidatedVoucher(v)
        patch({ paid_amount: String(v.voucher_value) })
      }
    } catch (e: unknown) {
      setVoucherError((e as Error).message || 'Voucher not found or not valid for payment.')
    } finally {
      setValidating(false)
    }
  }

  const handlePost = async () => {
    setError('')
    if (!form.party) { setError('Customer is required.'); return }
    if (!form.paid_amount || Number(form.paid_amount) <= 0) {
      setError('Paid amount must be greater than 0.')
      return
    }

    // ── Gift Voucher mode: redemption via backend endpoint ─────────────────
    if (form.mode_of_payment === 'Gift Voucher') {
      if (!validatedVoucher) { setError('Validate the voucher code first.'); return }
      if (!window.confirm(`Redeem voucher for ${fmtMoney(Number(form.paid_amount))} against ${form.party_name || form.party}?`)) return
      setPosting(true)
      try {
        const result = await frappe.call<{ pe_name: string }>(
          'casamoderna_dms.voucher_api.redeem_voucher_by_code_with_pe',
          {
            voucher_code: form.redeem_code,
            customer: form.party,
            amount: Number(form.paid_amount),
            party_name: form.party_name || '',
            posting_date: form.posting_date || '',
          },
        )
        setSuccessName(result?.pe_name ?? '')
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Voucher redemption failed.')
      } finally {
        setPosting(false)
      }
      return
    }

    if (!window.confirm('Post this payment? It will be submitted immediately.')) return

    setPosting(true)
    try {
      // References
      const references: Array<Record<string, unknown>> = []
      if (form.payment_purpose === 'Deposit' && form.ref_so) {
        references.push({
          doctype: 'Payment Entry Reference',
          reference_doctype: 'Sales Order',
          reference_name: form.ref_so,
          allocated_amount: Number(form.paid_amount),
        })
      } else if (form.payment_purpose === 'Invoice Settlement' && form.reference_invoice) {
        references.push({
          doctype: 'Payment Entry Reference',
          reference_doctype: 'Sales Invoice',
          reference_name: form.reference_invoice,
          allocated_amount: Number(form.paid_amount),
        })
      }

      const peDoc: Record<string, unknown> = {
        doctype: 'Payment Entry',
        naming_series: 'PE-.######',
        company: 'Casa Moderna Limited',
        payment_type: 'Receive',
        party_type: 'Customer',
        party: form.party,
        party_name: form.party_name,
        paid_amount: Number(form.paid_amount),
        received_amount: Number(form.paid_amount),
        base_paid_amount: Number(form.paid_amount),
        base_received_amount: Number(form.paid_amount),
        source_exchange_rate: 1,
        target_exchange_rate: 1,
        mode_of_payment: form.mode_of_payment,
        paid_from: 'Debtors - CM',
        paid_from_account_currency: 'EUR',
        paid_to: form.payment_purpose === 'Voucher Purchase' ? 'Gift Vouchers - CM' : 'Cash - CM',
        paid_to_account_currency: 'EUR',
        reference_no: form.reference_no.trim() || form.posting_date,
        reference_date: form.reference_date || form.posting_date,
        posting_date: form.posting_date,
        cm_payment_purpose: form.payment_purpose,
        ...(form.remarks ? { remarks: form.remarks } : {}),
        ...(references.length ? { references } : {}),
      }

      const saved = await frappe.saveDoc<PaymentEntryDoc>('Payment Entry', peDoc)
      // Submit
      await frappe.post(`/api/v2/document/Payment%20Entry/${encodeURIComponent(saved.name ?? '')}/submit`)

      // Voucher Purchase: hand off to voucher creation with receipt pre-filled
      if (form.payment_purpose === 'Voucher Purchase') {
        navigate('/customers/vouchers/new', {
          state: {
            fromReceipt: saved.name,
            party:       form.party,
            party_name:  form.party_name,
            paid_amount: form.paid_amount,
          },
        })
        return
      }

      setSuccessName(saved.name ?? '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to post payment')
    } finally {
      setPosting(false)
    }
  }

  const modeOptions = modes.length > 0
    ? modes
    : ['Cash', 'Bank Transfer', 'Card Payment', 'Cheque', 'Wire Transfer']

  // ── Success state ──────────────────────────────────────────────────────────
  if (successName) {
    return (
      <div className="space-y-5">
        <PageHeader title="Payment Posted" subtitle={`Receipt ${successName} submitted`} />
        <div className="max-w-2xl">
          <CMSection title="Receipt Confirmed">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
              <p className="text-green-800 font-semibold text-sm">✓ Payment recorded successfully</p>
              <p className="text-sm text-gray-700">Receipt: <span className="font-mono font-medium">{successName}</span></p>
            </div>
            <div className="flex gap-2 mt-4 flex-wrap">
              <CMButton
                variant="primary"
                onClick={() => {
                  window.open(
                    `/printview?doctype=Payment%20Entry&name=${encodeURIComponent(successName)}&format=CasaModerna%20Receipt&no_letterhead=0`,
                    '_blank',
                  )
                }}
              >
                Print Receipt
              </CMButton>
              <CMButton
                variant="secondary"
                onClick={() => navigate(`/sales/receipts/${encodeURIComponent(successName)}`)}
              >
                View Receipt
              </CMButton>
              <CMButton
                variant="ghost"
                onClick={() => {
                  setSuccessName('')
                  setForm(blankForm())
                  setError('')
                }}
              >
                New Receipt
              </CMButton>
            </div>
          </CMSection>
        </div>
      </div>
    )
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) return <div className="py-12 text-center text-gray-400">Loading…</div>
  if (error && !isNew) return <ErrorBox message={error} />

  // ── View mode (submitted doc) ──────────────────────────────────────────────
  if (!isNew && doc) {
    return (
      <div className="space-y-4">
        <BackLink label="Receipts" onClick={() => navigate('/sales/receipts')} />
        <PageHeader
          title={doc.name}
          subtitle={doc.party_name}
          actions={
            <div className="flex items-center gap-3 flex-wrap">
              <StatusBadge
                docstatus={doc.docstatus ?? 0}
                status={doc.docstatus === 1 ? 'Submitted' : doc.docstatus === 2 ? 'Cancelled' : 'Draft'}
              />
              <CMButton
                variant="secondary"
                onClick={() =>
                  window.open(
                    `/printview?doctype=Payment%20Entry&name=${encodeURIComponent(doc.name)}&format=CasaModerna%20Receipt&no_letterhead=0`,
                    '_blank',
                  )
                }
              >
                Print Receipt
              </CMButton>
            </div>
          }
        />

        <DetailSection title="Payment Details">
          <DetailGrid>
            <DetailField label="Reference" value={doc.name} />
            <DetailField label="Customer" value={doc.party_name} />
            <DetailField label="Amount Paid" value={fmtMoney(doc.paid_amount)} />
            <DetailField label="Mode" value={doc.mode_of_payment} />
            <DetailField label="Payment Type" value={doc.cm_payment_purpose} />
            <DetailField label="Reference No." value={doc.reference_no} />
            <DetailField label="Reference Date" value={fmtDate(doc.reference_date)} />
            <DetailField label="Posting Date" value={fmtDate(doc.posting_date)} />
            {doc.remarks && <DetailField label="Remarks" value={doc.remarks} />}
          </DetailGrid>
        </DetailSection>

        {(doc.references ?? []).length > 0 && (
          <DetailSection title="Linked Documents">
            <DetailGrid>
              {(doc.references ?? []).map((r, i) => (
                <DetailField
                  key={i}
                  label={r.reference_doctype}
                  value={`${r.reference_name}  (${fmtMoney(r.allocated_amount)})`}
                />
              ))}
            </DetailGrid>
          </DetailSection>
        )}
      </div>
    )
  }

  // ── Create mode ────────────────────────────────────────────────────────────
  if (!(can('canSales') || can('canFinance'))) {
    return <ErrorBox message="You do not have permission to create receipts." />
  }

  return (
    <div className="space-y-5">
      <BackLink label="Receipts" onClick={() => navigate('/sales/receipts')} />

      <PageHeader
        title="New Receipt"
        subtitle={form.party_name || form.party || undefined}
        actions={
          <div className="flex items-center gap-2">
            <CMButton variant="primary" onClick={handlePost} disabled={posting}>
              {posting ? 'Posting…' : 'Post Payment'}
            </CMButton>
            <CMButton variant="ghost" onClick={() => navigate('/sales/receipts')} disabled={posting}>
              Cancel
            </CMButton>
          </div>
        }
      />

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="max-w-2xl space-y-5">

        {/* Purpose */}
        <CMSection title="Payment Purpose">
          <CMField label="Purpose *">
            <select
              className={CM.select}
              value={form.payment_purpose}
              onChange={(e) => patch({ payment_purpose: e.target.value, ref_so: '', reference_invoice: '' })}
            >
              <option value="Deposit">Deposit (advance against Sales Order)</option>
              <option value="Invoice Settlement">Invoice Settlement</option>
              <option value="Payment on Account">Payment on Account</option>
              <option value="Voucher Purchase">Voucher Purchase (customer buying a gift voucher)</option>
            </select>
          </CMField>

          {form.payment_purpose === 'Deposit' && (
            <div className="mt-3">
              <Typeahead<{ name: string; customer: string; customer_name: string; grand_total: number; transaction_date: string }>
                label="Link Sales Order (optional)"
                value={form.ref_so}
                displayValue={form.ref_so}
                placeholder="Type SO number…"
                onSearch={searchSalesOrders}
                getLabel={(r) => `${r.name} — ${r.customer_name || r.customer} (${fmtMoney(r.grand_total)})`}
                getValue={(r) => r.name}
                onChange={(val, row) => patch({
                  ref_so: val,
                  ...(row ? { party: row.customer, party_name: row.customer_name || row.customer } : {}),
                })}
              />
            </div>
          )}

          {form.payment_purpose === 'Invoice Settlement' && (
            <div className="mt-3">
              <Typeahead<{ name: string; customer: string; customer_name: string; outstanding_amount: number; posting_date: string }>
                label="Sales Invoice *"
                value={form.reference_invoice}
                displayValue={form.reference_invoice}
                placeholder="Type invoice reference…"
                onSearch={searchInvoices}
                getLabel={(r) => `${r.name} — ${r.customer_name} (${fmtMoney(r.outstanding_amount)} outstanding)`}
                getValue={(r) => r.name}
                onChange={(val, row) => patch({
                  reference_invoice: val,
                  ...(row ? {
                    party: row.customer,
                    party_name: row.customer_name || row.customer,
                    paid_amount: String(Number(row.outstanding_amount ?? 0).toFixed(2)),
                  } : {}),
                })}
              />
            </div>
          )}
        </CMSection>

        {/* Customer */}
        <CMSection title="Customer">
          <Typeahead<{ name: string; customer_name: string }>
            label="Customer *"
            value={form.party}
            displayValue={form.party_name || form.party}
            onSearch={searchCustomers}
            getLabel={(r) => `${r.customer_name} (${r.name})`}
            getValue={(r) => r.name}
            onChange={(val, row) => patch({
              party: val,
              party_name: row?.customer_name ?? val,
              reference_invoice: '',
              paid_amount: '',
            })}
          />
        </CMSection>

        {/* Payment details */}
        <CMSection title="Payment">
          <div className="grid grid-cols-2 gap-4">
            <CMField label="Mode of Payment *">
              <select
                className={CM.select}
                value={form.mode_of_payment}
                onChange={(e) => {
                  patch({ mode_of_payment: e.target.value, redeem_code: '' })
                  setValidatedVoucher(null)
                  setVoucherError('')
                }}
              >
                {modeOptions.filter((m) => m !== 'Gift Voucher').map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
                {can('canVouchers') && <option value="Gift Voucher">🎟️ Gift Voucher</option>}
              </select>
            </CMField>

            <CMField label="Amount (€) *">
              <input
                type="number"
                step="0.01"
                min="0.01"
                className={CM.input}
                value={form.paid_amount}
                onChange={(e) => patch({ paid_amount: e.target.value })}
                placeholder="0.00"
              />
            </CMField>

            {form.mode_of_payment === 'Gift Voucher' && (
              <div className="col-span-2 space-y-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-xs text-amber-800">
                  🎟️ Non-transferable — the voucher must be issued to the customer selected above.
                </p>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className={CM.label}>Voucher Code *</label>
                    <input
                      className={`${CM.input} font-mono uppercase tracking-widest`}
                      value={form.redeem_code}
                      onChange={(e) => {
                        const clean = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12)
                        const fmt = clean.match(/.{1,4}/g)?.join('-') ?? clean
                        patch({ redeem_code: fmt })
                        setValidatedVoucher(null)
                        setVoucherError('')
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && handleValidateVoucher()}
                      placeholder="XXXX-XXXX-XXXX"
                      maxLength={14}
                    />
                  </div>
                  <CMButton
                    variant="secondary"
                    onClick={handleValidateVoucher}
                    disabled={validating || !form.redeem_code.trim()}
                  >
                    {validating ? 'Checking…' : '🔍 Validate'}
                  </CMButton>
                </div>
                {voucherError && <p className="text-sm text-red-600">{voucherError}</p>}
                {validatedVoucher && (
                  <div className="rounded border border-green-200 bg-green-50 px-3 py-2 space-y-1">
                    <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">✓ Valid voucher</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-gray-500">Face value: </span><strong>{fmtMoney(validatedVoucher.voucher_value)}</strong></div>
                      <div><span className="text-gray-500">Valid until: </span><span>{fmtDate(validatedVoucher.valid_until)}</span></div>
                      <div><span className="text-gray-500">Issued to: </span><span>{validatedVoucher.recipient_name || validatedVoucher.recipient_customer}</span></div>
                      <div><span className="text-gray-500">Status: </span><span>{validatedVoucher.status}</span></div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <CMField label="Posting Date *">
              <input
                type="date"
                className={CM.input}
                value={form.posting_date}
                onChange={(e) => patch({ posting_date: e.target.value })}
              />
            </CMField>

            <CMField label="Reference No.">
              <input
                className={CM.input}
                value={form.reference_no}
                onChange={(e) => patch({ reference_no: e.target.value })}
                placeholder="Cheque / transfer ref…"
              />
            </CMField>

            <CMField label="Reference Date">
              <input
                type="date"
                className={CM.input}
                value={form.reference_date}
                onChange={(e) => patch({ reference_date: e.target.value })}
              />
            </CMField>
          </div>
        </CMSection>

        {/* Remarks */}
        <CMSection title="Remarks">
          <textarea
            className={CM.textarea}
            rows={2}
            value={form.remarks}
            onChange={(e) => patch({ remarks: e.target.value })}
            placeholder="Optional internal note…"
          />
        </CMSection>

        {/* Bottom actions */}
        <div className="flex gap-2 justify-end pt-2 pb-8">
          <CMButton variant="primary" onClick={handlePost} disabled={posting}>
            {posting ? 'Posting…' : 'Post Payment'}
          </CMButton>
          <CMButton variant="ghost" onClick={() => navigate('/sales/receipts')} disabled={posting}>
            Cancel
          </CMButton>
        </div>
      </div>
    </div>
  )
}
