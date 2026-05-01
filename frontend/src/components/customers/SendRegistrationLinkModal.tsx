/**
 * SendRegistrationLinkModal
 *
 * Lets a DMS user send the customer self-registration form link
 * (https://forms.casamodernadms.eu/new-customer/) to a prospect via
 * email or SMS.
 *
 * Before sending it checks whether the email/mobile is already registered
 * as a Customer or has a pending Onboarding Request. If so, it shows a
 * warning and asks the user to confirm before proceeding.
 *
 * Props:
 *   isOpen   {boolean}
 *   onClose  {() => void}
 */
import { useState } from 'react'
import { frappe } from '../../api/frappe'
import { CM } from '../ui/CMClassNames'

type Method = 'Email' | 'SMS'

interface ConflictData {
  customers:     { name: string; customer_name: string }[]
  registrations: { name: string; full_name: string; status: string }[]
}

interface InvitationResult {
  ok:             boolean
  token:          string
  delivered:      boolean
  delivery_error: string
}

interface Props {
  isOpen:  boolean
  onClose: () => void
}

export function SendRegistrationLinkModal({ isOpen, onClose }: Props) {
  const [method, setMethod]       = useState<Method>('Email')
  const [recipient, setRecipient] = useState('')
  const [checking, setChecking]   = useState(false)
  const [sending, setSending]     = useState(false)
  const [result, setResult]       = useState<'ok' | 'ok-undelivered' | string | null>(null)
  const [deliveryError, setDeliveryError] = useState('')
  const [conflicts, setConflicts] = useState<ConflictData | null>(null)

  if (!isOpen) return null

  const handleClose = () => {
    setMethod('Email')
    setRecipient('')
    setChecking(false)
    setSending(false)
    setResult(null)
    setConflicts(null)
    setDeliveryError('')
    onClose()
  }

  const doSend = async () => {
    setSending(true)
    setResult(null)
    try {
      const res = await frappe.call<InvitationResult>('casamoderna_dms.onboarding_api.send_invitation', {
        method,
        recipient: recipient.trim(),
      })
      if (res?.delivered === false) {
        setDeliveryError(res.delivery_error || 'Dispatch failed — the link was saved, check Sent Links.')
        setResult('ok-undelivered')
      } else {
        setResult('ok')
      }
      setConflicts(null)
    } catch (err) {
      setResult((err as Error).message || 'Failed to send. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const handleSend = async () => {
    if (!recipient.trim()) return

    // If user already confirmed past a warning, just send
    if (conflicts !== null) {
      await doSend()
      return
    }

    setChecking(true)
    setResult(null)
    try {
      const data = await frappe.call<ConflictData>(
        'casamoderna_dms.onboarding_api.check_recipient',
        { method, recipient: recipient.trim() },
      )
      const hasConflicts =
        (data?.customers?.length ?? 0) > 0 ||
        (data?.registrations?.length ?? 0) > 0

      if (hasConflicts) {
        setConflicts(data)
      } else {
        await doSend()
      }
    } catch {
      // If the duplicate-check itself fails, proceed anyway
      await doSend()
    } finally {
      setChecking(false)
    }
  }

  const placeholder = method === 'Email' ? 'customer@example.com' : 'e.g. 9912 3456'
  const inputType   = method === 'Email' ? 'email' : 'tel'
  const isBusy      = checking || sending

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            Send Registration Link
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {result === 'ok' ? (
          /* ── Success state ── */
          <div className="px-6 py-8 text-center space-y-3">
            <div className="text-4xl text-cm-green">✓</div>
            <p className="text-sm text-gray-700 font-medium">
              Link sent via {method} to <strong>{recipient}</strong>
            </p>
            <p className="text-xs text-gray-500">
              You'll receive an email notification once they complete the form.
            </p>
            <button type="button" onClick={handleClose} className={CM.btn.primary + ' mt-4'}>
              Done
            </button>
          </div>
        ) : result === 'ok-undelivered' ? (
          /* ── Saved but dispatch failed ── */
          <div className="px-6 py-8 text-center space-y-3">
            <div className="text-4xl text-amber-500">⚠</div>
            <p className="text-sm text-gray-700 font-medium">
              Invitation saved, but {method.toLowerCase()} dispatch failed.
            </p>
            <p className="text-xs text-gray-500 text-left bg-amber-50 border border-amber-200 rounded p-3">
              {deliveryError}
            </p>
            <p className="text-xs text-gray-500">
              The invitation link is recorded in <strong>Sent Links</strong>.
              You can copy it manually and share with the customer.
            </p>
            <button type="button" onClick={handleClose} className={CM.btn.secondary + ' mt-4'}>
              Close
            </button>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-5">
            <p className="text-sm text-gray-500">
              Send the customer registration form to a prospective customer.
              You'll be notified when they complete it.
            </p>

            {/* Method toggle */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Send via
              </label>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                {(['Email', 'SMS'] as Method[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setMethod(m)
                      setRecipient('')
                      setConflicts(null)
                      setResult(null)
                    }}
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${
                      method === m
                        ? 'bg-cm-green text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {m === 'Email' ? '✉ Email' : '📱 SMS'}
                  </button>
                ))}
              </div>
            </div>

            {/* Recipient input */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                {method === 'Email' ? 'Email Address' : 'Mobile Number'}
              </label>
              <input
                type={inputType}
                value={recipient}
                onChange={(e) => {
                  setRecipient(e.target.value)
                  setConflicts(null)
                  setResult(null)
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
                placeholder={placeholder}
                disabled={isBusy}
                className={CM.input}
                autoFocus
              />
            </div>

            {/* Conflict warning */}
            {conflicts && (
              <div className="rounded border border-amber-200 bg-amber-50 p-4 space-y-2">
                <p className="text-sm font-semibold text-amber-800">
                  ⚠ Already on file
                </p>
                {conflicts.customers.length > 0 && (
                  <div>
                    <p className="text-xs text-amber-700 font-medium mb-1">Existing customers:</p>
                    {conflicts.customers.map((c) => (
                      <p key={c.name} className="text-xs text-amber-700 ml-2">• {c.customer_name} ({c.name})</p>
                    ))}
                  </div>
                )}
                {conflicts.registrations.length > 0 && (
                  <div>
                    <p className="text-xs text-amber-700 font-medium mb-1">Pending registrations:</p>
                    {conflicts.registrations.map((r) => (
                      <p key={r.name} className="text-xs text-amber-700 ml-2">• {r.full_name} — {r.status}</p>
                    ))}
                  </div>
                )}
                <p className="text-xs text-amber-700 mt-1">
                  Send anyway? Click <strong>Send Link</strong> again to confirm.
                </p>
              </div>
            )}

            {/* Error banner */}
            {result && result !== 'ok' && (
              <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {result}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={handleClose}
                disabled={isBusy}
                className={CM.btn.secondary}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={isBusy || !recipient.trim()}
                className={conflicts ? CM.btn.warning : CM.btn.primary}
              >
                {checking
                  ? 'Checking…'
                  : sending
                    ? 'Sending…'
                    : conflicts
                      ? 'Send Anyway'
                      : 'Send Link'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
