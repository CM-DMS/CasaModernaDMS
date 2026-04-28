/**
 * VoucherEditor — create a new voucher or view/action an existing one.
 *
 * Route: /customers/vouchers/new       → create mode
 *        /customers/vouchers/:id       → view / act mode
 */
import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import {
  PageHeader, DetailSection, BackLink, ErrorBox, Btn, inputCls,
} from '../../components/shared/ui'
import { CM } from '../../components/ui/CMClassNames'
import { fmtMoney, fmtDate } from '../../utils/fmt'
import { usePermissions } from '../../auth/PermissionsProvider'

// ── Constants ─────────────────────────────────────────────────────────────────

const SOURCES = ['Customer Purchase', 'Casa Moderna', 'Danzah'] as const
const COMPANY_SOURCES = new Set(['Casa Moderna', 'Danzah'])

const STATUS_STYLES: Record<string, string> = {
  Draft:                   'bg-gray-100 text-gray-600',
  'Pending Authorization': 'bg-amber-100 text-amber-700',
  Authorized:              'bg-blue-100 text-blue-700',
  Rejected:                'bg-red-100 text-red-700',
  Redeemed:                'bg-green-100 text-green-700',
}

const SOURCE_STYLES: Record<string, string> = {
  'Customer Purchase': 'bg-blue-50 text-blue-700 border-blue-200',
  'Casa Moderna':      'bg-green-50 text-green-700 border-green-200',
  'Danzah':            'bg-purple-50 text-purple-700 border-purple-200',
}

function addDays(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function todayStr() { return new Date().toISOString().slice(0, 10) }

interface VoucherDoc {
  name?: string
  voucher_code?: string
  purchaser_customer?: string
  purchaser_name?: string
  recipient_customer?: string
  recipient_name?: string
  voucher_source?: string
  voucher_value?: number | string
  valid_until?: string
  notes?: string
  status?: string
  authorized_by_jason?: number
  redeemed_amount?: number
  redeemed_date?: string
  redeemed_against_so?: string
}

function blankDoc(): VoucherDoc {
  return {
    purchaser_customer: '',
    purchaser_name: '',
    recipient_customer: '',
    recipient_name: '',
    voucher_source: 'Customer Purchase',
    voucher_value: '',
    valid_until: addDays(180),
    notes: '',
    status: 'Draft',
  }
}

// ── Customer Typeahead ─────────────────────────────────────────────────────────

interface CustomerOpt { name: string; customer_name: string }

function CustomerSearchInput({
  label, value, displayName, onChange, disabled,
}: {
  label: string
  value: string
  displayName?: string
  onChange: (opt: { name: string; customer_name: string }) => void
  disabled?: boolean
}) {
  const [query, setQuery] = useState(displayName || value || '')
  const [options, setOptions] = useState<CustomerOpt[]>([])
  const [focused, setFocused] = useState(false)
  const [loading, setLoading] = useState(false)

  const search = useCallback(async (q: string) => {
    if (!q || q.length < 2) { setOptions([]); return }
    setLoading(true)
    try {
      const data = await frappe.call<CustomerOpt[]>('frappe.client.get_list', {
        doctype: 'Customer',
        fields: ['name', 'customer_name'],
        or_filters: [
          ['customer_name', 'like', `%${q}%`],
          ['name', 'like', `%${q}%`],
        ],
        limit_page_length: 10,
        order_by: 'customer_name asc',
      })
      setOptions(Array.isArray(data) ? data : [])
    } catch { setOptions([]) }
    finally { setLoading(false) }
  }, [])

  const handleSelect = (opt: CustomerOpt) => {
    setQuery(opt.customer_name)
    setOptions([])
    onChange(opt)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value)
    if (!e.target.value) onChange({ name: '', customer_name: '' })
    search(e.target.value)
  }

  return (
    <div className="relative">
      <label className={CM.label}>{label}</label>
      <input
        type="text"
        value={query}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        disabled={disabled}
        className={inputCls}
        placeholder="Type customer name or code…"
        autoComplete="off"
      />
      {value && <p className="text-[11px] text-gray-400 mt-0.5">Code: {value}</p>}
      {focused && loading && (
        <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded shadow text-sm px-3 py-2 text-gray-400">
          Searching…
        </div>
      )}
      {focused && options.length > 0 && (
        <ul className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded shadow-md max-h-48 overflow-y-auto text-sm">
          {options.map((opt) => (
            <li
              key={opt.name}
              className="px-3 py-2 cursor-pointer hover:bg-gray-50 flex justify-between"
              onMouseDown={() => handleSelect(opt)}
            >
              <span className="font-medium">{opt.customer_name}</span>
              <span className="text-gray-400 font-mono text-[11px] ml-3">{opt.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Redeem Form ───────────────────────────────────────────────────────────────

function RedeemForm({
  recipientCustomer, recipientName, voucherValue, onSubmit, onCancel, loading,
}: {
  recipientCustomer: string
  recipientName?: string
  voucherValue: number | string
  onSubmit: (customer: string, amount: number, ref: string) => void
  onCancel: () => void
  loading: boolean
}) {
  const [amount, setAmount] = useState('')
  const [receiptRef, setReceiptRef] = useState('')
  const [err, setErr] = useState('')

  const handleSubmit = () => {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setErr('Please enter a valid amount.'); return }
    if (amt > parseFloat(String(voucherValue))) {
      setErr(`Amount cannot exceed the voucher face value (${fmtMoney(Number(voucherValue))}).`)
      return
    }
    setErr('')
    onSubmit(recipientCustomer, amt, receiptRef.trim())
  }

  return (
    <div className="space-y-4 pt-2">
      <p className="text-sm text-gray-600">
        Voucher face value: <strong>{fmtMoney(Number(voucherValue))}</strong>
      </p>
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800">
        This voucher will be redeemed against customer account{' '}
        <strong>{recipientName || recipientCustomer}</strong>.
        Vouchers are non-transferable and cannot be redeemed for cash.
      </div>
      <div>
        <label className={CM.label}>Amount to Redeem (€)</label>
        <input
          type="number" min="0.01" step="0.01" max={voucherValue}
          value={amount} onChange={(e) => setAmount(e.target.value)}
          className={inputCls} placeholder={`Max ${fmtMoney(Number(voucherValue))}`}
        />
      </div>
      <div>
        <label className={CM.label}>Receipt Reference <span className="font-normal text-gray-400">(optional)</span></label>
        <input
          type="text" value={receiptRef} onChange={(e) => setReceiptRef(e.target.value)}
          className={inputCls} placeholder="e.g. SINV-00042"
        />
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="flex gap-2 pt-1">
        <Btn onClick={handleSubmit} disabled={loading}>Confirm Redemption</Btn>
        <Btn variant="ghost" onClick={onCancel} disabled={loading}>Cancel</Btn>
      </div>
    </div>
  )
}

// ── Reject Form ───────────────────────────────────────────────────────────────

function RejectForm({
  onConfirm, onCancel, loading,
}: {
  onConfirm: (reason: string) => void
  onCancel: () => void
  loading: boolean
}) {
  const [reason, setReason] = useState('')
  return (
    <div className="space-y-3 pt-1">
      <p className="text-sm text-gray-600">
        Optionally provide a reason for rejection.
      </p>
      <textarea
        rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
        className={CM.textarea + ' resize-none'} placeholder="Reason (optional)…"
      />
      <div className="flex gap-2">
        <button className={CM.btn.danger} onClick={() => onConfirm(reason)} disabled={loading}>
          Confirm Rejection
        </button>
        <Btn variant="ghost" onClick={onCancel} disabled={loading}>Cancel</Btn>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function VoucherEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { can } = usePermissions()

  const isNew = !id || id === 'new'
  const isAuthorizer = can('canAuthorizeVouchers')

  const fromReceipt = (location.state as Record<string, unknown>)?.fromReceipt as string | null ?? null

  const [doc, setDoc] = useState<VoucherDoc>(() => {
    const s = (location.state ?? {}) as Record<string, unknown>
    return {
      ...blankDoc(),
      ...(s.fromReceipt ? {
        purchaser_customer: (s.party as string) || '',
        purchaser_name:     (s.party_name as string) || '',
        voucher_value:      (s.paid_amount as number) || '',
        notes:              `Purchased with receipt ${s.fromReceipt}`,
        voucher_source:     'Customer Purchase',
      } : {}),
    }
  })
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [panel, setPanel] = useState<null | 'redeem' | 'reject'>(null)

  useEffect(() => {
    if (isNew) return
    setLoading(true)
    frappe.call<VoucherDoc>('casamoderna_dms.voucher_api.get_voucher', { voucher_name: decodeURIComponent(id ?? '') })
      .then((d) => { if (d) setDoc(d) })
      .catch((e: Error) => setError(e.message || 'Failed to load voucher'))
      .finally(() => setLoading(false))
  }, [id, isNew])

  const patchDoc = (patch: Partial<VoucherDoc>) => setDoc((prev) => ({ ...prev, ...patch }))

  const flashSuccess = (msg: string) => {
    setSuccess(msg)
    setTimeout(() => setSuccess(''), 4000)
  }

  const handleCreate = async () => {
    setError('')
    setSaving(true)
    try {
      const result = await frappe.call<{ name: string }>(
        'casamoderna_dms.voucher_api.create_voucher',
        {
          purchaser_customer: doc.purchaser_customer,
          recipient_customer: doc.recipient_customer,
          voucher_value:      parseFloat(String(doc.voucher_value)),
          valid_until:        doc.valid_until,
          voucher_source:     doc.voucher_source ?? 'Customer Purchase',
          notes:              doc.notes ?? '',
        },
      )
      if (result?.name) navigate(`/customers/vouchers/${encodeURIComponent(result.name)}`, { replace: true })
    } catch (e: unknown) {
      setError((e as Error).message || 'Failed to create voucher')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmitForAuth = async () => {
    setError('')
    setSaving(true)
    try {
      const result = await frappe.call<{ status: string }>('casamoderna_dms.voucher_api.submit_for_authorization', { voucher_name: doc.name })
      patchDoc({ status: result?.status })
      const isCompany = COMPANY_SOURCES.has(doc.voucher_source ?? '')
      flashSuccess(
        result?.status === 'Authorized' ? 'Voucher activated and ready to use.' :
        isCompany ? "Submitted for Jason's authorisation." : 'Voucher activated.',
      )
    } catch (e: unknown) {
      setError((e as Error).message || 'Action failed')
    } finally {
      setSaving(false)
    }
  }

  const handleApprove = async () => {
    setError('')
    setSaving(true)
    try {
      const result = await frappe.call<{ status: string; authorized_by_jason: number }>(
        'casamoderna_dms.voucher_api.authorize_voucher',
        { voucher_name: doc.name },
      )
      patchDoc({ status: result?.status, authorized_by_jason: result?.authorized_by_jason })
      flashSuccess(result?.status === 'Authorized' ? 'Voucher is now Authorized!' : 'Your approval has been recorded.')
    } catch (e: unknown) {
      setError((e as Error).message || 'Action failed')
    } finally {
      setSaving(false)
    }
  }

  const handleReject = async (reason: string) => {
    setError('')
    setSaving(true)
    try {
      const result = await frappe.call<{ status: string }>('casamoderna_dms.voucher_api.reject_voucher', { voucher_name: doc.name, reason })
      patchDoc({ status: result?.status })
      setPanel(null)
      flashSuccess('Voucher has been rejected.')
    } catch (e: unknown) {
      setError((e as Error).message || 'Action failed')
    } finally {
      setSaving(false)
    }
  }

  const handleRedeem = async (customer: string, amount: number, receiptRef: string) => {
    setError('')
    setSaving(true)
    try {
      const result = await frappe.call<{
        status: string; redeemed_amount: number; redeemed_date: string; receipt_reference: string
      }>('casamoderna_dms.voucher_api.redeem_voucher', {
        voucher_name: doc.name,
        customer,
        amount,
        receipt_reference: receiptRef,
      })
      patchDoc({
        status: result?.status,
        redeemed_amount: result?.redeemed_amount,
        redeemed_date: result?.redeemed_date,
        redeemed_against_so: result?.receipt_reference ?? '',
      })
      setPanel(null)
      flashSuccess('Voucher redeemed successfully.')
    } catch (e: unknown) {
      setError((e as Error).message || 'Redemption failed')
    } finally {
      setSaving(false)
    }
  }

  const isReadOnly = !isNew && doc.status !== 'Draft'
  const isCompanySource = COMPANY_SOURCES.has(doc.voucher_source ?? '')

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400 text-sm animate-pulse">
        Loading voucher…
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <PageHeader
        title={isNew ? 'New Gift Voucher' : `Voucher ${doc.voucher_code ?? id}`}
        subtitle={isNew ? 'Create a gift voucher for a customer' : `Created for ${doc.recipient_name ?? doc.recipient_customer}`}
        actions={
          !isNew ? (
            <div className="flex items-center gap-2">
              {doc.voucher_source && (
                <span className={`inline-flex items-center px-2.5 py-1 rounded text-[12px] font-semibold border ${SOURCE_STYLES[doc.voucher_source] ?? 'bg-gray-100 text-gray-600'}`}>
                  {doc.voucher_source}
                </span>
              )}
              <span className={`inline-flex items-center px-2.5 py-1 rounded text-[12px] font-semibold ${STATUS_STYLES[doc.status ?? ''] ?? 'bg-gray-100 text-gray-500'}`}>
                {doc.status}
              </span>
            </div>
          ) : undefined
        }
      />

      {success && (
        <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">{success}</div>
      )}
      {error && <ErrorBox message={error} />}

      {fromReceipt && (
        <div className="rounded border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Issuing gift voucher for receipt <strong>{fromReceipt}</strong>. Customer and amount are pre-filled.
        </div>
      )}

      {/* Voucher Details */}
      <DetailSection title="Voucher Details">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {!isNew && (
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Voucher Code</dt>
              <dd className="font-mono font-bold text-cm-green tracking-widest text-lg">{doc.voucher_code}</dd>
            </div>
          )}

          {isNew && (
            <div>
              <label className={CM.label}>
                Source <span className="text-red-500">*</span>
              </label>
              <select
                value={doc.voucher_source ?? 'Customer Purchase'}
                onChange={(e) => patchDoc({ voucher_source: e.target.value })}
                className={CM.select}
              >
                {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              {isCompanySource && (
                <p className="text-[11px] text-amber-600 mt-1">
                  ⚠️ Requires Jason Falzon's authorisation before use.
                </p>
              )}
            </div>
          )}

          <div>
            <label className={CM.label}>Voucher Value (€) <span className="text-red-500">*</span></label>
            <input
              type="number" min="1" step="0.01"
              value={String(doc.voucher_value ?? '')}
              onChange={(e) => patchDoc({ voucher_value: e.target.value })}
              disabled={isReadOnly}
              className={inputCls} placeholder="e.g. 100.00"
            />
          </div>

          <div>
            <label className={CM.label}>
              Valid Until <span className="text-red-500">*</span>
              <span className="ml-1 normal-case font-normal text-gray-400">(default 180 days)</span>
            </label>
            <input
              type="date" value={doc.valid_until ?? ''}
              min={todayStr()}
              onChange={(e) => patchDoc({ valid_until: e.target.value })}
              disabled={isReadOnly}
              className={inputCls}
            />
          </div>
        </div>
      </DetailSection>

      {/* Parties */}
      <DetailSection title="Parties">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {(isNew ? !isCompanySource : !!doc.purchaser_customer) && (
            <CustomerSearchInput
              label="Purchaser (pays for voucher) *"
              value={doc.purchaser_customer ?? ''}
              displayName={doc.purchaser_name}
              disabled={isReadOnly}
              onChange={({ name, customer_name }) => patchDoc({ purchaser_customer: name, purchaser_name: customer_name })}
            />
          )}
          <CustomerSearchInput
            label="Recipient (receives voucher) *"
            value={doc.recipient_customer ?? ''}
            displayName={doc.recipient_name}
            disabled={isReadOnly}
            onChange={({ name, customer_name }) => patchDoc({ recipient_customer: name, recipient_name: customer_name })}
          />
        </div>
      </DetailSection>

      {/* Notes */}
      <DetailSection title="Notes">
        <textarea
          rows={3}
          value={doc.notes ?? ''}
          onChange={(e) => patchDoc({ notes: e.target.value })}
          disabled={isReadOnly && doc.status !== 'Pending Authorization'}
          className={CM.textarea + ' resize-none w-full'}
          placeholder="Optional internal notes…"
        />
      </DetailSection>

      {/* Authorization status */}
      {!isNew && doc.status !== 'Draft' && (
        <DetailSection title="Authorization">
          <div className="flex gap-6 text-sm">
            <div className="flex items-center gap-2">
              <span className={`inline-block w-4 h-4 rounded-full ${doc.authorized_by_jason ? 'bg-green-500' : 'bg-gray-200'}`} />
              <span className={doc.authorized_by_jason ? 'text-green-700 font-medium' : 'text-gray-400'}>
                Jason Falzon {doc.authorized_by_jason ? '✓' : '(pending)'}
              </span>
            </div>
          </div>
        </DetailSection>
      )}

      {/* Redemption info */}
      {doc.status === 'Redeemed' && (
        <DetailSection title="Redemption">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Redeemed Amount</dt>
              <dd>{doc.redeemed_amount != null ? fmtMoney(doc.redeemed_amount) : '—'}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Redeemed Date</dt>
              <dd>{doc.redeemed_date ? fmtDate(doc.redeemed_date) : '—'}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Receipt Reference</dt>
              <dd>{doc.redeemed_against_so || '—'}</dd>
            </div>
          </div>
        </DetailSection>
      )}

      {/* Inline panels */}
      {panel === 'redeem' && (
        <DetailSection title="Redeem Voucher">
          <RedeemForm
            recipientCustomer={doc.recipient_customer ?? ''}
            recipientName={doc.recipient_name}
            voucherValue={doc.voucher_value ?? 0}
            onSubmit={handleRedeem}
            onCancel={() => setPanel(null)}
            loading={saving}
          />
        </DetailSection>
      )}

      {panel === 'reject' && (
        <DetailSection title="Reject Voucher">
          <RejectForm
            onConfirm={handleReject}
            onCancel={() => setPanel(null)}
            loading={saving}
          />
        </DetailSection>
      )}

      {/* Action bar */}
      <div className="flex flex-wrap gap-3 pt-2">
        {isNew && can('canVouchers') && (
          <Btn onClick={handleCreate} disabled={saving}>{saving ? 'Creating…' : 'Create Voucher'}</Btn>
        )}

        {!isNew && doc.status === 'Draft' && can('canVouchers') && (
          <Btn onClick={handleSubmitForAuth} disabled={saving}>
            {isCompanySource ? 'Submit for Authorisation' : 'Activate Voucher'}
          </Btn>
        )}

        {!isNew && doc.status === 'Pending Authorization' && isAuthorizer && (
          <>
            <Btn onClick={handleApprove} disabled={saving}>{saving ? 'Approving…' : 'Approve'}</Btn>
            {panel !== 'reject' && (
              <button className={CM.btn.danger} onClick={() => setPanel('reject')} disabled={saving}>
                Reject
              </button>
            )}
          </>
        )}

        {!isNew && doc.status === 'Authorized' && can('canVouchers') && panel !== 'redeem' && (
          <Btn onClick={() => setPanel('redeem')} disabled={saving}>Redeem Voucher</Btn>
        )}

        {!isNew && (
          <Btn variant="ghost" onClick={() => navigate(`/customers/vouchers/${encodeURIComponent(doc.name ?? '')}/print`)}>
            🖨 Print Voucher
          </Btn>
        )}

        <Btn variant="ghost" onClick={() => fromReceipt ? navigate(`/sales/receipts/${encodeURIComponent(fromReceipt)}`) : navigate('/customers/vouchers')}>
          {fromReceipt ? '← Back to Receipt' : 'Back to List'}
        </Btn>
      </div>
    </div>
  )
}
