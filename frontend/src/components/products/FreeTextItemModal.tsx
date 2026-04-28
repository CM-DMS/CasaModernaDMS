/**
 * FreeTextItemModal — entry form for a free-text (non-catalogue) line item.
 * TypeScript port of V2 FreeTextItemModal.jsx.
 */
import { useState, useEffect, useRef } from 'react'
import { CM } from '../ui/CMClassNames'
import type { ItemRow } from '../sales/ItemsTable'

const VAT = 18
const round2 = (n: number) => Math.round(n * 100) / 100
const exVat = (incVat: number) => round2(incVat / (1 + VAT / 100))
const discFromPrices = (rrp: number, offer: number) =>
  rrp > 0 ? round2(((rrp - offer) / rrp) * 100) : 0
const offerFromDisc = (rrp: number, disc: number) => round2(rrp * (1 - disc / 100))

interface Fields {
  desc: string
  rrp: string
  disc: string
  offer: string
  qty: string
  uom: string
}

const EMPTY: Fields = { desc: '', rrp: '', disc: '', offer: '', qty: '1', uom: 'EA' }

interface FreeTextItemModalProps {
  isOpen: boolean
  onAdd: (row: Partial<ItemRow>) => void
  onClose: () => void
  initialValues?: { rrp?: number; offer?: number } | null
}

export function FreeTextItemModal({
  isOpen,
  onAdd,
  onClose,
  initialValues = null,
}: FreeTextItemModalProps) {
  const [fields, setFields] = useState<Fields>(EMPTY)
  const descRef = useRef<HTMLInputElement>(null)

  const setUOM = (newUom: string) => {
    setFields((f) => ({ ...f, uom: newUom, qty: newUom === 'SQM' ? '' : '1' }))
  }

  useEffect(() => {
    if (!isOpen) {
      setFields(EMPTY)
      return
    }
    if (initialValues) {
      const rrpStr = initialValues.rrp != null ? String(initialValues.rrp) : ''
      const offerStr = initialValues.offer != null ? String(initialValues.offer) : rrpStr
      const rrpN = parseFloat(rrpStr) || 0
      const offN = parseFloat(offerStr) || 0
      const disc = rrpN > 0 ? String(round2(((rrpN - offN) / rrpN) * 100)) : '0'
      setFields({ desc: '', rrp: rrpStr, offer: offerStr, disc, qty: '1', uom: 'EA' })
    }
    setTimeout(() => descRef.current?.focus(), 50)
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null

  const setRRP = (raw: string) => {
    const rrp = parseFloat(raw) || 0
    const disc = parseFloat(fields.disc) || 0
    const offer = rrp > 0 ? offerFromDisc(rrp, disc) : 0
    setFields((f) => ({ ...f, rrp: raw, offer: offer > 0 ? String(offer) : '' }))
  }

  const setDisc = (raw: string) => {
    const disc = parseFloat(raw) || 0
    const rrp = parseFloat(fields.rrp) || 0
    const offer = rrp > 0 ? offerFromDisc(rrp, disc) : 0
    setFields((f) => ({ ...f, disc: raw, offer: offer > 0 ? String(offer) : '' }))
  }

  const setOffer = (raw: string) => {
    const offer = parseFloat(raw) || 0
    const rrp = parseFloat(fields.rrp) || 0
    const disc = discFromPrices(rrp, offer)
    setFields((f) => ({ ...f, offer: raw, disc: disc > 0 ? String(disc) : '0' }))
  }

  const rrpNum = parseFloat(fields.rrp) || 0
  const offerNum = parseFloat(fields.offer) || 0
  const discNum = parseFloat(fields.disc) || 0
  const qtyNum = parseFloat(fields.qty) || 0
  const canAdd = fields.desc.trim().length > 0 && rrpNum > 0 && qtyNum > 0

  const handleAdd = () => {
    if (!canAdd) return
    const rrpInc = rrpNum
    const offerInc = offerNum > 0 ? offerNum : rrpInc
    const discPct = discFromPrices(rrpInc, offerInc)
    const erpUom = fields.uom === 'SQM' ? 'SQM' : 'Nos'
    onAdd({
      item_code: 'CM-FREETEXT',
      item_name: fields.desc.trim(),
      description: fields.desc.trim(),
      uom: erpUom,
      qty: qtyNum,
      cm_vat_rate_percent: VAT,
      cm_rrp_inc_vat: rrpInc,
      cm_rrp_ex_vat: exVat(rrpInc),
      cm_final_offer_inc_vat: offerInc,
      cm_final_offer_ex_vat: exVat(offerInc),
      rate: offerInc,
      cm_effective_discount_percent: discPct,
    })
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
      return
    }
    if (e.key === 'Enter' && canAdd) handleAdd()
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
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">Free Text Item</span>
          <button className={CM.btn.ghost} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="px-4 py-4 space-y-4" onKeyDown={handleKey}>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Description <span className="text-red-500">*</span>
            </label>
            <input
              ref={descRef}
              className={CM.input + ' w-full'}
              value={fields.desc}
              onChange={(e) => setFields((f) => ({ ...f, desc: e.target.value }))}
              placeholder="Product or service description…"
              autoComplete="off"
            />
          </div>

          <div className="flex gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">UOM</label>
              <div className="flex rounded-md border overflow-hidden">
                {['EA', 'SQM'].map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setUOM(opt)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      fields.uom === opt
                        ? 'bg-cm-green text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Quantity <span className="text-red-500">*</span>
              </label>
              <input
                className={CM.input + ' w-full'}
                type="number"
                min="0.01"
                step={fields.uom === 'SQM' ? '0.01' : '1'}
                value={fields.qty}
                onChange={(e) => setFields((f) => ({ ...f, qty: e.target.value }))}
                placeholder={fields.uom === 'SQM' ? 'e.g. 131.04' : '1'}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                RRP (inc. VAT) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                  €
                </span>
                <input
                  className={CM.input + ' w-full pl-5'}
                  type="number"
                  min="0"
                  step="0.01"
                  value={fields.rrp}
                  onChange={(e) => setRRP(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Discount %</label>
              <div className="relative">
                <input
                  className={CM.input + ' w-full pr-5'}
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={fields.disc}
                  onChange={(e) => setDisc(e.target.value)}
                  placeholder="0"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                  %
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Offer Price (inc. VAT)
              </label>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                  €
                </span>
                <input
                  className={CM.input + ' w-full pl-5'}
                  type="number"
                  min="0"
                  step="0.01"
                  value={fields.offer}
                  onChange={(e) => setOffer(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          {rrpNum > 0 && (
            <div className="text-xs text-gray-500 bg-gray-50 rounded px-3 py-2">
              RRP <span className="font-medium text-gray-700">€{rrpNum.toFixed(2)}</span>
              {discNum > 0 && (
                <>
                  {' '}
                  · Disc{' '}
                  <span className="font-medium text-gray-700">{discNum.toFixed(2)}%</span>
                </>
              )}{' '}
              → Offer{' '}
              <span className="font-semibold text-cm-green">
                €{(offerNum > 0 ? offerNum : rrpNum).toFixed(2)}
              </span>
              <span className="text-gray-400"> inc. {VAT}% VAT</span>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t flex justify-end gap-2">
          <button className={CM.btn.secondary} onClick={onClose}>
            Cancel
          </button>
          <button className={CM.btn.primary} onClick={handleAdd} disabled={!canAdd}>
            + Add to Document
          </button>
        </div>
      </div>
    </div>
  )
}
