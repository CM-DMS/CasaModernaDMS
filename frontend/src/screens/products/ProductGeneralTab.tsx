/**
 * ProductGeneralTab — General tab for ProductProfile (V3).
 *
 * Layout: hero (large image left + identity/pricing right), then pack/dims below.
 * Pricing section has Inc/Exc VAT toggle.
 * Inline edit mode via ProductEditor.
 */
import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import { CMSection, CMButton } from '../../components/ui/CMComponents'
import { CM } from '../../components/ui/CMClassNames'
import { fmtMoneySmart, fmtMoneyWhole, fmtDiscountUI } from '../../utils/pricing'
import { usePermissions } from '../../auth/PermissionsProvider'
import type { ItemDoc } from '../../api/products'
import { ProductEditorInline } from './ProductEditor'

interface Props {
  item: ItemDoc
  onRefresh: () => void
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  const display =
    value !== undefined && value !== null && value !== '' ? String(value) : '—'
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
        {label}
      </dt>
      <dd className="text-sm text-gray-800">{display}</dd>
    </div>
  )
}

function VatToggle({
  value,
  onChange,
}: {
  value: 'inc' | 'exc'
  onChange: (v: 'inc' | 'exc') => void
}) {
  return (
    <div className="inline-flex rounded-full bg-gray-100 p-0.5 text-xs font-medium">
      {(['inc', 'exc'] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          className={[
            'px-3 py-1 rounded-full transition-all',
            value === mode
              ? 'bg-white text-gray-800 shadow-sm'
              : 'text-gray-500 hover:text-gray-700',
          ].join(' ')}
        >
          {mode === 'inc' ? 'Inc VAT' : 'Exc VAT'}
        </button>
      ))}
    </div>
  )
}

function PriceCard({
  label,
  value,
  formatter,
  accent = false,
  subLabel,
  subValue,
  subFormatter,
}: {
  label: string
  value?: number | null
  formatter: (n: number) => string
  accent?: boolean
  subLabel?: string
  subValue?: number | null
  subFormatter?: (n: number) => string
}) {
  return (
    <div
      className={[
        'flex flex-col gap-1 rounded-xl p-4',
        accent
          ? 'bg-cm-green/10 border border-cm-green/30'
          : 'bg-gray-50 border border-gray-200',
      ].join(' ')}
    >
      <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
        {label}
      </span>
      <span
        className={[
          'text-2xl font-bold tabular-nums',
          accent ? 'text-cm-green' : 'text-gray-900',
        ].join(' ')}
      >
        {value != null && value !== 0 ? formatter(Number(value)) : '—'}
      </span>
      {subLabel && subFormatter && (
        <span className="text-xs text-gray-400 tabular-nums mt-0.5">
          {subLabel}:{' '}
          {subValue != null && subValue !== 0 ? subFormatter(Number(subValue)) : '—'}
        </span>
      )}
    </div>
  )
}

function DiscountCard({ value }: { value?: number | null }) {
  const display =
    value != null && Number(value) > 0 ? fmtDiscountUI(Number(value)) : '—'
  return (
    <div className="flex flex-col gap-1 rounded-xl p-4 bg-amber-50 border border-amber-200">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
        Discount
      </span>
      <span className="text-2xl font-bold tabular-nums text-amber-700">{display}</span>
    </div>
  )
}

function ImagePanel({
  item,
  canEdit,
  onImageUpdated,
}: {
  item: ItemDoc
  canEdit: boolean
  onImageUpdated: (url: string) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const result = await frappe.uploadFile(file, {
        doctype: 'Item',
        docname: item.name,
        fieldname: 'image',
        isPrivate: false,
      })
      onImageUpdated((result as { file_url: string }).file_url)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {item.image ? (
        <img
          src={item.image}
          alt={item.item_name}
          className="w-full aspect-square object-contain rounded-xl border border-gray-200 bg-gray-50"
          onError={(e) => {
            ;(e.target as HTMLImageElement).style.display = 'none'
          }}
        />
      ) : (
        <div className="w-full aspect-square rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center text-gray-300 text-sm">
          No image
        </div>
      )}
      {canEdit && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
            disabled={uploading}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-full px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {uploading ? 'Uploading…' : item.image ? 'Replace Image' : 'Upload Image'}
          </button>
          {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
        </>
      )}
    </div>
  )
}

export function ProductGeneralTab({ item, onRefresh }: Props) {
  const { can } = usePermissions()
  const navigate = useNavigate()
  const canEdit = can('canEditProduct') || can('canAdmin')
  const canSeePricing = can('canSeePricing') || can('canSales') || can('canPurchasing') || can('canAdmin')
  const canSales = can('canSales') || can('canAdmin')
  const [editing, setEditing] = useState(false)
  const [vatMode, setVatMode] = useState<'inc' | 'exc'>('inc')
  const [imageSaveError, setImageSaveError] = useState<string | null>(null)

  const handleImageUpdated = async (url: string) => {
    setImageSaveError(null)
    try {
      await frappe.call('frappe.client.set_value', {
        doctype: 'Item',
        name: item.name,
        fieldname: 'image',
        value: url,
      })
      onRefresh()
    } catch (err) {
      setImageSaveError(
        `Failed to save image: ${err instanceof Error ? err.message : 'Unknown error'}`,
      )
    }
  }

  if (editing) {
    return (
      <ProductEditorInline
        doc={item}
        onSave={() => {
          setEditing(false)
          onRefresh()
        }}
        onCancel={() => setEditing(false)}
        hideSupplier
      />
    )
  }

  const rrpValue = vatMode === 'inc' ? item.cm_rrp_inc_vat : item.cm_rrp_ex_vat
  const rrpSub = vatMode === 'inc' ? item.cm_rrp_ex_vat : item.cm_rrp_inc_vat
  const rrpSubLabel = vatMode === 'inc' ? 'Exc VAT' : 'Inc VAT'

  const offerValue =
    vatMode === 'inc' ? item.cm_final_offer_inc_vat : item.cm_final_offer_ex_vat
  const offerFmt = vatMode === 'inc' ? fmtMoneyWhole : fmtMoneySmart
  const offerSub =
    vatMode === 'inc' ? item.cm_final_offer_ex_vat : item.cm_final_offer_inc_vat
  const offerSubFmt = vatMode === 'inc' ? fmtMoneySmart : fmtMoneyWhole
  const offerSubLabel = vatMode === 'inc' ? 'Exc VAT' : 'Inc VAT'

  return (
    <div className="space-y-6">
      {imageSaveError && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {imageSaveError}
        </div>
      )}

      {/* Hero: image + info */}
      <div className="grid grid-cols-1 sm:grid-cols-[280px_1fr] gap-6">
        {/* Left: large image */}
        <ImagePanel item={item} canEdit={canEdit} onImageUpdated={handleImageUpdated} />

        {/* Right: identity + pricing */}
        <div className="flex flex-col gap-5">
          {/* Name + badges */}
          <div>
            <h2 className="text-xl font-bold text-gray-900 leading-tight">
              {item.cm_given_name || item.item_name}
            </h2>
            {item.cm_given_name && item.item_name !== item.cm_given_name && (
              <p className="text-sm text-gray-400 mt-0.5">{item.item_name}</p>
            )}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {!!item.disabled && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-red-100 text-red-700">
                  Inactive
                </span>
              )}
              {!!item.cm_hidden_from_catalogue && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-100 text-amber-700">
                  Hidden from Catalogue
                </span>
              )}
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
            <Field label="Item Code" value={item.item_code} />
            <Field label="Group" value={item.item_group} />
            <Field label="UOM" value={item.stock_uom} />
            <Field label="Brand" value={item.brand} />
          </dl>

          {(item.cm_description_line_1 || item.cm_description_line_2 || item.description) && (
            <div className="space-y-0.5">
              {item.cm_description_line_1 && (
                <p className="text-sm text-gray-700">{item.cm_description_line_1}</p>
              )}
              {item.cm_description_line_2 && (
                <p className="text-sm text-gray-500">{item.cm_description_line_2}</p>
              )}
              {!item.cm_description_line_1 && item.description && (
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{item.description}</p>
              )}
            </div>
          )}

          {/* Pricing */}
          {canSeePricing && (
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  Pricing
                </span>
                <VatToggle value={vatMode} onChange={setVatMode} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <PriceCard
                  label="RRP"
                  value={rrpValue}
                  formatter={fmtMoneySmart}
                  subLabel={rrpSubLabel}
                  subValue={rrpSub}
                  subFormatter={fmtMoneySmart}
                />
                <PriceCard
                  label="Offer Price"
                  value={offerValue}
                  formatter={offerFmt}
                  accent
                  subLabel={offerSubLabel}
                  subValue={offerSub}
                  subFormatter={offerSubFmt}
                />
                <DiscountCard value={item.cm_discount_percent} />
              </div>
            </div>
          )}

          {canEdit && (
            <div className="pt-1">
              <CMButton variant="ghost" onClick={() => setEditing(true)}>
                ✏️ Edit
              </CMButton>
            </div>
          )}

          <div className="pt-1 flex gap-2 flex-wrap">
            {canSales && (
              <button
                type="button"
                className={CM.btn.secondary}
                onClick={() =>
                  navigate('/sales/quotations/new', {
                    state: {
                      doc: {
                        items: [
                          {
                            item_code: item.item_code,
                            item_name: item.item_name || item.cm_given_name,
                            qty: 1,
                            rate: item.cm_final_offer_ex_vat,
                          },
                        ],
                      },
                    },
                  })
                }
              >
                📋 Add to Quotation
              </button>
            )}
            <CMButton variant="ghost" onClick={() => window.print()}>
              🖨 Print Sheet
            </CMButton>
          </div>
        </div>
      </div>

      {/* Pack / Dimensions */}
      {(item.cm_sqm_per_box || item.cm_tiles_per_box || item.cm_supplier_pack) && (
        <CMSection title="Pack / Dimensions">
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {item.cm_sqm_per_box != null && (
              <Field label="m² per Box" value={item.cm_sqm_per_box} />
            )}
            {item.cm_tiles_per_box != null && (
              <Field label="Tiles per Box" value={item.cm_tiles_per_box} />
            )}
            {item.cm_supplier_pack && (
              <Field label="Supplier Pack" value={item.cm_supplier_pack} />
            )}
          </dl>
        </CMSection>
      )}
    </div>
  )
}
