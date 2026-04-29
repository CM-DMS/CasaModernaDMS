/**
 * EmailDocumentModal — send a sales document PDF to a customer via email.
 * TypeScript port of V2 EmailDocumentModal.jsx.
 */
import { useState } from 'react'
import { CM } from '../ui/CMClassNames'
import { frappe } from '../../api/frappe'

const DEFAULT_SUBJECTS: Record<string, (name: string) => string> = {
  Quotation: (name) => `Your Quotation ${name}`,
  'Sales Order': (name) => `Sales Order ${name}`,
  'Delivery Note': (name) => `Delivery Note ${name}`,
  'Sales Invoice': (name) => `Invoice ${name}`,
  'Payment Entry': (name) => `Payment Receipt ${name}`,
}

const DISPLAY_NAMES: Record<string, string> = {
  'Payment Entry': 'Payment Receipt',
}

interface Props {
  isOpen: boolean
  doctype: string
  docName: string | null | undefined
  printFormat: string | undefined
  recipientEmail?: string
  customerName?: string
  onClose: () => void
}

export function EmailDocumentModal({
  isOpen,
  doctype,
  docName,
  printFormat,
  recipientEmail = '',
  customerName = '',
  onClose,
}: Props) {
  const displayName = DISPLAY_NAMES[doctype] || doctype
  const [to, setTo] = useState(recipientEmail)
  const [subject, setSubject] = useState(
    (DEFAULT_SUBJECTS[doctype] || (() => docName))(docName || ''),
  )
  const [message, setMessage] = useState(
    `Dear ${customerName || 'Customer'},\n\nPlease find attached your ${displayName} ${docName}.\n\nKind regards,\nCasa Moderna`,
  )
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ ok?: boolean; error?: string } | null>(null)

  if (!isOpen) return null

  const handleSend = async () => {
    if (!to.trim()) return
    setSending(true)
    setResult(null)
    try {
      await frappe.call('casamoderna_dms.email_api.send_document_email', {
        doctype,
        name: docName,
        recipients: to.trim(),
        subject,
        message,
        print_format: printFormat,
      })
      setResult({ ok: true })
    } catch (err: any) {
      setResult({ error: err.message || 'Failed to send email' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-800">Email {displayName}</div>
            <div className="text-[11px] text-gray-500">Send {docName} as PDF attachment</div>
          </div>
          <button type="button" className="text-gray-400 hover:text-gray-700" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          <div>
            <label className={CM.label}>To</label>
            <input
              type="email"
              className={CM.input}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="customer@example.com"
            />
          </div>
          <div>
            <label className={CM.label}>Subject</label>
            <input
              type="text"
              className={CM.input}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div>
            <label className={CM.label}>Message</label>
            <textarea
              className={CM.textarea}
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          {result?.ok && (
            <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
              Email sent successfully.
            </div>
          )}
          {result?.error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {result.error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t flex justify-end gap-2">
          <button type="button" className={CM.btn.secondary} onClick={onClose}>
            {result?.ok ? 'Close' : 'Cancel'}
          </button>
          {!result?.ok && (
            <button
              type="button"
              className={CM.btn.primary}
              disabled={sending || !to.trim()}
              onClick={handleSend}
            >
              {sending && (
                <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin mr-1 inline-block" />
              )}
              {sending ? 'Sending…' : 'Send Email'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
