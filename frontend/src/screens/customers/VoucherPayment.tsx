/**
 * VoucherPayment — accept a gift voucher as a form of payment at the counter.
 *
 * Route: /vouchers/redeem
 */
import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import {
  PageHeader, DetailSection, Btn, inputCls,
} from '../../components/shared/ui'
import { CM } from '../../components/ui/CMClassNames'
import { fmtMoney, fmtDate } from '../../utils/fmt'

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000)
}

function fmtDateLong(str: string) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function normaliseCode(raw: string) {
  const clean = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12)
  return clean.match(/.{1,4}/g)?.join('-') ?? clean
}

const STAGE = { ENTER: 'enter', FOUND: 'found', SUCCESS: 'success' } as const
type Stage = typeof STAGE[keyof typeof STAGE]

interface VoucherDetail {
  name: string
  voucher_code: string
  voucher_value: number
  valid_until: string
  recipient_customer: string
  recipient_name?: string
  status: string
}

interface CustomerOpt { name: string; customer_name: string }

interface SuccessData {
  voucher: VoucherDetail
  customer: CustomerOpt
  amount: number
  receiptRef: string
  result?: { redeemed_date?: string; voucher_name?: string }
}

// ── Customer Search Input ─────────────────────────────────────────────────────

function CustomerSearchInput({
  label, onSelect, disabled,
}: {
  label: string
  onSelect: (opt: CustomerOpt | null) => void
  disabled?: boolean
}) {
  const [query, setQuery] = useState('')
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
        limit_page_length: 15,
      })
      setOptions(Array.isArray(data) ? data : [])
    } catch { setOptions([]) }
    finally { setLoading(false) }
  }, [])

  const handleSelect = (opt: CustomerOpt) => {
    setQuery(opt.customer_name || opt.name)
    setOptions([])
    onSelect(opt)
  }

  return (
    <div className="relative">
      <label className={CM.label}>{label}</label>
      <input
        type="text" value={query}
        onChange={(e) => { setQuery(e.target.value); onSelect(null); search(e.target.value) }}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        disabled={disabled}
        className={inputCls}
        placeholder="Type customer name to search…"
        autoComplete="off"
      />
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
              <span className="text-gray-400 ml-2 font-mono text-[11px]">{opt.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Stage 1: Enter Code ───────────────────────────────────────────────────────

function EnterCodeStage({ onFound }: { onFound: (v: VoucherDetail) => void }) {
  const [raw, setRaw] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRaw(normaliseCode(e.target.value))
    setError('')
  }

  const handleLookup = async () => {
    const clean = raw.replace(/-/g, '')
    if (clean.length < 8) { setError('Please enter a valid voucher code.'); return }
    setError('')
    setLoading(true)
    try {
      const detail = await frappe.call<VoucherDetail>(
        'casamoderna_dms.voucher_api.validate_voucher_for_payment',
        { voucher_code: raw },
      )
      if (detail) onFound(detail)
    } catch (e: unknown) {
      setError((e as Error).message || 'Voucher not found or not valid for payment.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <DetailSection title="Enter Voucher Code">
      <div className="max-w-md space-y-4">
        <p className="text-sm text-gray-600">
          Enter the code printed on the gift voucher card. Dashes are optional.
        </p>
        <div>
          <label className={CM.label}>Voucher Code</label>
          <input
            type="text" value={raw} onChange={handleChange}
            onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
            className={`${inputCls} font-mono text-lg tracking-[0.15em] uppercase`}
            placeholder="XXXX-XXXX-XXXX"
            maxLength={14}
            autoFocus
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Btn onClick={handleLookup} disabled={loading}>{loading ? 'Looking up…' : 'Look Up Voucher'}</Btn>
      </div>
    </DetailSection>
  )
}

// ── Stage 2: Apply Payment ────────────────────────────────────────────────────

function ApplyPaymentStage({
  voucher, onSuccess, onReset,
}: {
  voucher: VoucherDetail
  onSuccess: (data: SuccessData) => void
  onReset: () => void
}) {
  const [customer, setCustomer] = useState<CustomerOpt | null>(null)
  const [amount, setAmount] = useState(String(voucher.voucher_value))
  const [receiptRef, setReceiptRef] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const days = daysUntil(voucher.valid_until)
  const expiryClass =
    days < 0  ? 'text-red-600 font-semibold' :
    days <= 7 ? 'text-amber-600 font-semibold' :
    'text-green-700 font-semibold'

  const handleApply = async () => {
    if (!customer) { setError('Please select the customer account being served.'); return }
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError('Please enter a valid amount.'); return }
    if (amt > voucher.voucher_value) {
      setError(`Amount cannot exceed the voucher face value (${fmtMoney(voucher.voucher_value)}).`)
      return
    }
    setError('')
    setLoading(true)
    try {
      const result = await frappe.call<{ redeemed_date?: string; voucher_name?: string }>(
        'casamoderna_dms.voucher_api.redeem_voucher_by_code_with_pe',
        {
          voucher_code: voucher.voucher_code,
          customer: customer.name,
          amount: amt,
          party_name: customer.customer_name,
          posting_date: '',
        },
      )
      onSuccess({ voucher, customer, amount: amt, receiptRef: receiptRef.trim(), result: result ?? undefined })
    } catch (e: unknown) {
      setError((e as Error).message || 'Redemption failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <DetailSection title="Voucher Details">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Code</p>
            <p className="font-mono text-lg font-black text-cm-green tracking-widest">
              {voucher.voucher_code.match(/.{1,4}/g)?.join('-') ?? voucher.voucher_code}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Face Value</p>
            <p className="text-2xl font-bold text-gray-900 tabular-nums">{fmtMoney(voucher.voucher_value)}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Valid Until</p>
            <p className={`text-sm font-semibold ${expiryClass}`}>{fmtDateLong(voucher.valid_until)}</p>
            <p className={`text-[11px] ${expiryClass}`}>
              {days < 0 ? `Expired ${Math.abs(days)} day(s) ago` : days === 0 ? 'Expires today' : `${days} day(s) remaining`}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Issued To</p>
            <p className="text-sm font-semibold text-gray-800">{voucher.recipient_name || voucher.recipient_customer}</p>
            <p className="text-[11px] text-gray-400 font-mono mt-0.5">{voucher.recipient_customer}</p>
          </div>
        </div>
      </DetailSection>

      <DetailSection title="Verify Customer Account">
        <div className="max-w-lg space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
            <strong>Non-transferable.</strong> This voucher may only be applied to the customer account it was issued to.
          </div>

          <CustomerSearchInput
            label="Customer being served *"
            onSelect={(opt) => { setCustomer(opt); setError('') }}
            disabled={loading}
          />

          <div>
            <label className={CM.label}>Amount to Apply (€) * <span className="normal-case font-normal text-gray-400">max {fmtMoney(voucher.voucher_value)}</span></label>
            <input
              type="number" min="0.01" step="0.01" max={voucher.voucher_value}
              value={amount} onChange={(e) => setAmount(e.target.value)}
              disabled={loading} className={inputCls}
            />
          </div>

          <div>
            <label className={CM.label}>Receipt Reference <span className="font-normal text-gray-400">(optional)</span></label>
            <input
              type="text" value={receiptRef} onChange={(e) => setReceiptRef(e.target.value)}
              disabled={loading} className={inputCls} placeholder="e.g. SINV-00042"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-1">
            <Btn onClick={handleApply} disabled={loading}>{loading ? 'Processing…' : 'Confirm Voucher Payment'}</Btn>
            <Btn variant="ghost" onClick={onReset} disabled={loading}>← Different Code</Btn>
          </div>
        </div>
      </DetailSection>
    </div>
  )
}

// ── Stage 3: Success ──────────────────────────────────────────────────────────

function SuccessStage({
  data, onAnother, onViewVoucher,
}: {
  data: SuccessData
  onAnother: () => void
  onViewVoucher: () => void
}) {
  return (
    <DetailSection title="">
      <div className="text-center py-10 space-y-4">
        <div className="text-5xl">✅</div>
        <h2 className="text-xl font-bold text-gray-800">Voucher Payment Accepted</h2>
        <div className="inline-block text-left space-y-1 bg-green-50 border border-green-200 rounded-xl px-6 py-4 mx-auto">
          <p className="text-sm">
            <span className="text-gray-500">Amount applied:</span>{' '}
            <strong className="text-green-700">{fmtMoney(data.amount)}</strong>
          </p>
          <p className="text-sm">
            <span className="text-gray-500">Customer:</span>{' '}
            <strong>{data.customer.customer_name || data.customer.name}</strong>
          </p>
          <p className="text-sm">
            <span className="text-gray-500">Voucher code:</span>{' '}
            <span className="font-mono font-semibold text-cm-green">
              {data.voucher.voucher_code.match(/.{1,4}/g)?.join('-')}
            </span>
          </p>
          {data.receiptRef && (
            <p className="text-sm">
              <span className="text-gray-500">Receipt ref:</span>{' '}
              <span className="font-mono">{data.receiptRef}</span>
            </p>
          )}
          <p className="text-sm">
            <span className="text-gray-500">Redeemed on:</span>{' '}
            {fmtDate(data.result?.redeemed_date ?? new Date().toISOString().slice(0, 10))}
          </p>
        </div>
        <div className="flex justify-center gap-3 pt-2">
          <Btn onClick={onAnother}>Redeem Another</Btn>
          <Btn variant="ghost" onClick={onViewVoucher}>View Voucher Record</Btn>
        </div>
      </div>
    </DetailSection>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function VoucherPayment() {
  const navigate = useNavigate()
  const [stage, setStage] = useState<Stage>(STAGE.ENTER)
  const [voucher, setVoucher] = useState<VoucherDetail | null>(null)
  const [successData, setSuccessData] = useState<SuccessData | null>(null)

  const handleFound = (detail: VoucherDetail) => { setVoucher(detail); setStage(STAGE.FOUND) }
  const handleSuccess = (data: SuccessData) => { setSuccessData(data); setStage(STAGE.SUCCESS) }
  const handleReset = () => { setVoucher(null); setSuccessData(null); setStage(STAGE.ENTER) }

  return (
    <div className="space-y-5 max-w-3xl">
      <PageHeader
        title="Accept Voucher Payment"
        subtitle="Validate and redeem a gift voucher — tied to the named customer account only"
        actions={<Btn variant="ghost" onClick={() => navigate('/customers/vouchers')}>Voucher Records</Btn>}
      />

      {stage === STAGE.ENTER && <EnterCodeStage onFound={handleFound} />}
      {stage === STAGE.FOUND && voucher && (
        <ApplyPaymentStage voucher={voucher} onSuccess={handleSuccess} onReset={handleReset} />
      )}
      {stage === STAGE.SUCCESS && successData && (
        <SuccessStage
          data={successData}
          onAnother={handleReset}
          onViewVoucher={() => navigate(`/customers/vouchers/${encodeURIComponent(successData.result?.voucher_name ?? '')}`)}
        />
      )}
    </div>
  )
}
