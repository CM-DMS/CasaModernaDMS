/**
 * VoucherPrint — Casa Moderna branded printable voucher.
 *
 * Route: /customers/vouchers/:id/print
 */
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import { fmtMoney, fmtDate } from '../../utils/fmt'

const CM_GREEN = '#339966'

function formatCode(code: string) {
  if (!code) return ''
  const clean = code.replace(/[^A-Z0-9]/g, '')
  return clean.match(/.{1,4}/g)?.join('-') ?? code
}

function fmtDateLong(str: string) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

interface VoucherDoc {
  name: string
  voucher_code: string
  voucher_source?: string
  voucher_value: number
  valid_until: string
  purchaser_customer?: string
  purchaser_name?: string
  recipient_customer?: string
  recipient_name?: string
  notes?: string
  status?: string
  redeemed_amount?: number
  redeemed_date?: string
  redeemed_against_so?: string
}

export function VoucherPrint() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [doc, setDoc] = useState<VoucherDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    frappe.call<VoucherDoc>('casamoderna_dms.voucher_api.get_voucher', { voucher_name: decodeURIComponent(id ?? '') })
      .then((d) => { if (d) setDoc(d) })
      .catch((e: Error) => setError(e.message || 'Failed to load voucher'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (doc) {
      const t = setTimeout(() => window.print(), 600)
      return () => clearTimeout(t)
    }
  }, [doc])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-400 text-sm animate-pulse">
        Preparing voucher for print…
      </div>
    )
  }

  if (error || !doc) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-red-600 text-sm">{error || 'Voucher not found'}</p>
        <button onClick={() => navigate(-1)} className="text-sm text-gray-500 underline">Go back</button>
      </div>
    )
  }

  const isRedeemed = doc.status === 'Redeemed'
  const isCompany  = doc.voucher_source === 'Casa Moderna' || doc.voucher_source === 'Danzah'
  const fromLabel  = isCompany ? 'Issued By' : 'Purchased By'
  const fromName   = isCompany
    ? doc.voucher_source
    : (doc.purchaser_name || doc.purchaser_customer || '—')

  return (
    <>
      {/* Screen toolbar */}
      <div className="no-print flex items-center gap-3 px-6 py-3 border-b border-gray-200 bg-white">
        <button onClick={() => navigate(-1)} className="text-sm text-gray-500 hover:text-gray-800">
          ← Back
        </button>
        <span className="text-gray-300">|</span>
        <span className="text-sm text-gray-600 font-medium">
          Gift Voucher · {formatCode(doc.voucher_code)}
        </span>
        <div className="flex-1" />
        <button
          onClick={() => window.print()}
          className="px-4 py-1.5 rounded text-sm font-semibold text-white"
          style={{ background: CM_GREEN }}
        >
          🖨 Print
        </button>
      </div>

      {/* Print canvas */}
      <div className="no-print-bg flex items-center justify-center min-h-[calc(100vh-52px)] bg-gray-100 p-10">
        <div className="voucher-card bg-white w-[680px] shadow-xl" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>

          {/* Header */}
          <div className="pf-head px-8 pt-7 pb-5 flex items-center justify-between"
               style={{ borderBottom: `3px solid ${CM_GREEN}` }}>
            <img
              src={`${import.meta.env.BASE_URL.replace(/\/$/, '')}/cm-logo-print.png`}
              alt="Casa Moderna"
              style={{ height: '56px', maxWidth: '240px', objectFit: 'contain' }}
            />
            <div className="text-right">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Gift Voucher</p>
              {doc.voucher_code && (
                <p className="text-[11px] font-mono text-gray-400 mt-0.5">{formatCode(doc.voucher_code)}</p>
              )}
            </div>
          </div>

          {/* Value band */}
          <div className="px-8 py-5 flex items-center justify-between" style={{ background: CM_GREEN }}>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/70 mb-0.5">Voucher Value</p>
              <p className="text-4xl font-black text-white tabular-nums leading-none">{fmtMoney(doc.voucher_value)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/70 mb-0.5">Valid Until</p>
              <p className="text-lg font-bold text-white">{fmtDateLong(doc.valid_until)}</p>
            </div>
          </div>

          {/* Redemption code */}
          <div className="px-8 py-6 text-center" style={{ borderBottom: '1px dashed #d1d5db' }}>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400 mb-3">Redemption Code</p>
            <p className="font-mono font-black tracking-[0.22em] select-all"
               style={{ fontSize: '34px', color: CM_GREEN, letterSpacing: '0.22em' }}>
              {formatCode(doc.voucher_code)}
            </p>
            <p className="text-[10px] text-gray-400 mt-2">
              Present this code at the time of purchase · Non-transferable · Single use
            </p>
          </div>

          {/* From / To */}
          <div className="px-8 py-5 grid grid-cols-2 gap-5">
            <div style={{ borderLeft: `3px solid ${CM_GREEN}`, paddingLeft: '12px' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">{fromLabel}</p>
              <p className="text-sm font-semibold text-gray-800">{fromName}</p>
            </div>
            <div style={{ borderLeft: `3px solid ${CM_GREEN}`, paddingLeft: '12px' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Issued To</p>
              <p className="text-sm font-semibold text-gray-800">
                {doc.recipient_name || doc.recipient_customer || '—'}
              </p>
            </div>
          </div>

          {/* Notes */}
          {doc.notes && !doc.notes.startsWith('REJECTED') && !doc.notes.startsWith('Purchased with receipt') && (
            <div className="mx-8 mb-5 px-4 py-3 text-sm text-gray-700"
                 style={{ background: '#f0f9f4', borderLeft: `4px solid ${CM_GREEN}` }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: CM_GREEN }}>Message</p>
              {doc.notes}
            </div>
          )}

          {/* Redeemed banner */}
          {isRedeemed && (
            <div className="mx-8 mb-5 px-4 py-3 rounded text-sm"
                 style={{ background: '#f0f9f4', border: '1px solid #c8e6c9' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-green-700 mb-1">Redeemed</p>
              <p className="text-gray-700">
                {fmtMoney(doc.redeemed_amount ?? 0)} on {fmtDate(doc.redeemed_date ?? '')}
                {doc.redeemed_against_so ? ` · Ref: ${doc.redeemed_against_so}` : ''}
              </p>
            </div>
          )}

          {/* Footer */}
          <div className="px-8 py-4 flex items-center justify-between"
               style={{ borderTop: '1px solid #c8e6c9' }}>
            <div>
              <p className="text-[9px] text-gray-400">Casa Moderna Limited · Triq il-Balal, San Ġwann SGN 1750, Malta</p>
              <p className="text-[9px] text-gray-400">Tel: +356 2137 2378 · www.casamoderna.com.mt</p>
            </div>
            <p className="text-[9px] font-mono text-gray-300 shrink-0 ml-4">{doc.name}</p>
          </div>
        </div>
      </div>

      {/* Print CSS */}
      <style>{`
        @media print {
          .no-print        { display: none !important; }
          .no-print-bg     { background: white !important; padding: 0 !important; min-height: auto !important; display: block !important; }
          .voucher-card    { box-shadow: none !important; width: 100% !important; max-width: 680px; margin: 0 auto; }
          aside, header, nav { display: none !important; }
          main             { padding: 0 !important; margin: 0 !important; }
          body             { margin: 0; }
          @page            { size: A5 landscape; margin: 10mm; }
        }
      `}</style>
    </>
  )
}
