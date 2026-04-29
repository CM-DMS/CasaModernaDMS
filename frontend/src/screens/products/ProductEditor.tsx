/**
 * ProductEditor — create or edit an Item (Product) in V3.
 *
 * Routes:
 *   /products/new         → create new item
 *   /products/:itemCode/edit → edit existing item
 *
 * Sections:
 *   Identity     — always visible (canEditProduct)
 *   Pack/Dims    — dimensions/packing info
 *   Pricing      — gated by canSeePricing
 *   Supplier     — gated by canPurchasing
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import { CMSection, CMField, CMButton } from '../../components/ui/CMComponents'
import { CM } from '../../components/ui/CMClassNames'
import { PageHeader, BackLink, ErrorBox } from '../../components/shared/ui'
import { Typeahead } from '../../components/sales/Typeahead'
import { usePermissions } from '../../auth/PermissionsProvider'
import {
  customerFacingPrice, normaliseRrpIncVat, DEFAULT_VAT_RATE_PCT,
  fmtMoneySmart, fmtMoneyWhole, fmtDiscountUI, parsePrice,
} from '../../utils/pricing'
import { productsApi } from '../../api/products'
import type { CMProductDoc } from '../../api/products'

// ── Blank doc ─────────────────────────────────────────────────────────────────

const BLANK_DOC: Record<string, unknown> = {
  doctype: 'CM Product',
  item_name: '',
  cm_given_name: '',
  cm_description_line_1: '',
  cm_description_line_2: '',
  image: '',
  item_group: '',
  stock_uom: 'EA',
  is_stock_item: 1,
  disabled: 0,
  cm_hidden_from_catalogue: 0,
  cm_product_type: 'Primary',
  cm_sqm_per_box: '',
  cm_tiles_per_box: '',
  cm_supplier_pack: '',
  cm_rrp_ex_vat: '',
  cm_vat_rate_percent: '',
  cm_target_margin_percent: '',
  cm_purchase_price_ex_vat: '',
  cm_offer_tier1_inc_vat: '',
  cm_supplier_name: '',
  cm_supplier_code: '',
  cm_supplier_variant_description: '',
  cm_supplier_item_code: '',
  cm_supplier_item_name: '',
}

const ROUNDING_MODES = [
  { value: 'whole_euro_roundup', label: 'Whole euro (round nearest)' },
  { value: 'tile_decimal_pricing', label: 'Tile decimal (2 dp)' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function NumInput({
  value,
  onChange,
  placeholder = '0.00',
  min = '0',
  max,
  step = '0.01',
}: {
  value: unknown
  onChange: (v: string) => void
  placeholder?: string
  min?: string
  max?: string
  step?: string
}) {
  return (
    <input
      type="number"
      className={CM.input}
      value={(value as string) ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      min={min}
      max={max}
      step={step}
    />
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ProductEditor() {
  const { itemCode } = useParams<{ itemCode?: string }>()
  const navigate = useNavigate()
  const { can } = usePermissions()

  const isNew = !itemCode
  const canEditProduct = can('canEditProduct') || can('canAdmin')
  const canSeePricing = can('canSeePricing') || can('canAdmin')
  const canPurchasing = can('canPurchasing') || can('canAdmin')

  const [doc, setDoc] = useState<Record<string, unknown>>({ ...BLANK_DOC })
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [pricingInputMode] = useState<'discount' | 'offer'>('discount')
  const [offerInput] = useState('')

  // Load existing doc
  useEffect(() => {
    if (isNew || !itemCode) return
    setLoading(true)
    frappe
      .getDoc<Record<string, unknown>>('CM Product', itemCode)
      .then((d) => setDoc(d))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load product'))
      .finally(() => setLoading(false))
  }, [isNew, itemCode])

  const set = useCallback((field: string, value: unknown) => {
    setDoc((prev) => ({ ...prev, [field]: value }))
  }, [])

  const vatRate = parsePrice(doc.cm_vat_rate_percent) ?? DEFAULT_VAT_RATE_PCT
  const rrpEx = parsePrice(doc.cm_rrp_ex_vat) ?? 0
  const rrpIncCalc = rrpEx > 0 ? normaliseRrpIncVat(rrpEx, vatRate) : 0

  const offerInputNum = parsePrice(offerInput)
  const backCalcDisc =
    offerInputNum != null && rrpIncCalc > 0
      ? Math.max(0, Math.min(100, (1 - offerInputNum / rrpIncCalc) * 100))
      : null

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!String(doc.item_name ?? '').trim()) { setError('Item Name is required.'); return }
    if ((doc.cm_product_type ?? 'Primary') === 'Primary' && !String(doc.cm_supplier_name ?? '').trim()) {
      setError('Supplier is required for Primary products (used to generate the item code).')
      return
    }
    if (isNew && !String(doc.item_group ?? '').trim()) { setError('Item Group is required.'); return }
    if (isNew && !String(doc.stock_uom ?? '').trim()) { setError('Stock UOM is required.'); return }

    setSaving(true)
    setError('')
    try {
      let docToSave = doc
      if (pricingInputMode === 'offer' && backCalcDisc != null) {
        docToSave = { ...docToSave, cm_discount_target_percent: backCalcDisc }
      }
      const saved = await productsApi.save(docToSave)
      navigate(`/products/${encodeURIComponent(saved.name)}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.')
      setSaving(false)
    }
  }

  const handleCancel = () => {
    if (itemCode) navigate(`/products/${encodeURIComponent(itemCode)}`)
    else navigate('/products')
  }

  if (!canEditProduct) {
    return (
      <div className="p-6 text-sm text-red-600">
        You do not have permission to edit products.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-6 w-6 rounded-full border-4 border-cm-green border-t-transparent animate-spin" />
      </div>
    )
  }

  const title = isNew
    ? 'New Product'
    : `Edit: ${String(doc.item_name || doc.name || '')}`

  return (
    <div className="space-y-5">
      <BackLink label="Products" onClick={() => navigate('/products')} />

      <PageHeader
        title={title}
        actions={
          <CMButton variant="ghost" onClick={handleCancel} disabled={saving}>
            Cancel
          </CMButton>
        }
      />

      {error && <ErrorBox message={error} />}

      <CMSection title="Identity">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {!isNew && (
            <CMField label="Product Code">
              <input
                className={`${CM.input} bg-gray-50 cursor-not-allowed`}
                value={String(doc.name ?? '')}
                readOnly
              />
            </CMField>
          )}
          {isNew && (
            <div className="sm:col-span-2">
              <p className="text-[11px] text-gray-400 italic">
                Product code will be auto-generated (e.g. 0200-TST-00001) from the item group + supplier.
              </p>
            </div>
          )}

          <CMField label="Item Name *">
            <input
              className={CM.input}
              value={String(doc.item_name ?? '')}
              onChange={(e) => set('item_name', e.target.value)}
              placeholder="e.g. Porcelain Floor Tile 60×60"
            />
          </CMField>

          <CMField label="Given Name">
            <input
              className={CM.input}
              value={String(doc.cm_given_name ?? '')}
              onChange={(e) => set('cm_given_name', e.target.value)}
              placeholder="Short commercial name"
            />
          </CMField>

          <CMField label="Item Group *">
            <Typeahead<{ name: string }>
              value={String(doc.item_group ?? '')}
              onSearch={(q) =>
                frappe.getList<{ name: string }>('Item Group', {
                  fields: ['name'],
                  filters: [['name', 'like', `%${q}%`]],
                  limit: 20,
                })
              }
              getLabel={(r) => r.name}
              getValue={(r) => r.name}
              onChange={(v) => set('item_group', v)}
              placeholder="Search item group…"
            />
          </CMField>

          <CMField label="Stock UOM *">
            <Typeahead<{ name: string }>
              value={String(doc.stock_uom ?? '')}
              onSearch={(q) =>
                frappe.getList<{ name: string }>('UOM', {
                  fields: ['name'],
                  filters: [['name', 'like', `%${q}%`]],
                  limit: 20,
                })
              }
              getLabel={(r) => r.name}
              getValue={(r) => r.name}
              onChange={(v) => set('stock_uom', v)}
              placeholder="Search UOM…"
            />
          </CMField>

          <div className="sm:col-span-2">
            <CMField label="Description Line 1">
              <input
                className={CM.input}
                value={String(doc.cm_description_line_1 ?? '')}
                onChange={(e) => set('cm_description_line_1', e.target.value)}
                placeholder="e.g. finish / size / colour"
              />
            </CMField>
          </div>

          <div className="sm:col-span-2">
            <CMField label="Description Line 2">
              <input
                className={CM.input}
                value={String(doc.cm_description_line_2 ?? '')}
                onChange={(e) => set('cm_description_line_2', e.target.value)}
                placeholder="e.g. collection / series"
              />
            </CMField>
          </div>

          <div className="sm:col-span-2">
            <CMField label="Product Image">
              <div className="flex items-center gap-4">
                {doc.image && (
                  <img
                    src={String(doc.image)}
                    alt="Product"
                    className="w-20 h-20 rounded object-cover border border-gray-200 flex-shrink-0"
                  />
                )}
                <div className="flex flex-col gap-1.5 min-w-0">
                  <input
                    type="url"
                    className={CM.input}
                    value={String(doc.image ?? '')}
                    onChange={(e) => set('image', e.target.value)}
                    placeholder="Paste image URL or upload below…"
                  />
                  <input
                    type="file"
                    accept="image/*"
                    className="text-xs text-gray-500 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 cursor-pointer"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      const fd = new FormData()
                      fd.append('file', file)
                      fd.append('is_private', '0')
                      fd.append('doctype', 'CM Product')
                      if (doc.name) fd.append('docname', String(doc.name))
                      try {
                        const resp = await fetch('/api/method/upload_file', {
                          method: 'POST',
                          headers: { 'X-Frappe-CSRF-Token': (window as any).csrf_token || '' },
                          body: fd,
                        })
                        const json = await resp.json()
                        const url = json?.message?.file_url
                        if (url) set('image', url)
                      } catch {
                        /* ignore upload errors silently */
                      }
                    }}
                  />
                  {doc.image && (
                    <button
                      type="button"
                      className="text-xs text-red-500 hover:text-red-700 text-left"
                      onClick={() => set('image', '')}
                    >
                      Remove image
                    </button>
                  )}
                </div>
              </div>
            </CMField>
          </div>

          <CMField label="Product Type">
            <select
              className={CM.select}
              value={String(doc.cm_product_type ?? 'Primary')}
              onChange={(e) => set('cm_product_type', e.target.value)}
            >
              <option value="Primary">Primary</option>
              <option value="Secondary">Secondary</option>
              <option value="Special Order">Special Order</option>
            </select>
          </CMField>

          {(doc.cm_product_type ?? 'Primary') === 'Primary' && (
            <CMField label="Supplier *">
              <Typeahead<{ name: string; supplier_name?: string }>
                value={String(doc.cm_supplier_name ?? '')}
                onSearch={(q) =>
                  frappe.getList<{ name: string; supplier_name?: string }>('Supplier', {
                    fields: ['name', 'supplier_name'],
                    filters: [['supplier_name', 'like', `%${q}%`]],
                    limit: 20,
                  })
                }
                getLabel={(r) => r.supplier_name ?? r.name}
                getValue={(r) => r.name}
                onChange={(v) => set('cm_supplier_name', v)}
                placeholder="Search supplier…"
              />
            </CMField>
          )}

          <div className="flex items-center gap-6 sm:col-span-2 pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-700">
              <input
                type="checkbox"
                checked={!!doc.is_stock_item}
                onChange={(e) => set('is_stock_item', e.target.checked ? 1 : 0)}
                className="accent-cm-green"
              />
              Stock item
            </label>

            <button
              type="button"
              onClick={() => set('disabled', doc.disabled ? 0 : 1)}
              className="inline-flex items-center gap-2 cursor-pointer select-none text-sm text-gray-700"
            >
              <span
                className={[
                  'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200',
                  doc.disabled ? 'bg-gray-300' : 'bg-cm-green',
                ].join(' ')}
              >
                <span
                  className={[
                    'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-200',
                    doc.disabled ? 'translate-x-0' : 'translate-x-4',
                  ].join(' ')}
                />
              </span>
              <span
                className={doc.disabled ? 'text-red-600 font-medium' : 'text-green-700 font-medium'}
              >
                {doc.disabled ? 'Inactive' : 'Active'}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                set('cm_hidden_from_catalogue', doc.cm_hidden_from_catalogue ? 0 : 1)
              }
              className="inline-flex items-center gap-2 cursor-pointer select-none text-sm text-gray-700"
            >
              <span
                className={[
                  'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200',
                  doc.cm_hidden_from_catalogue ? 'bg-amber-400' : 'bg-gray-300',
                ].join(' ')}
              >
                <span
                  className={[
                    'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-200',
                    doc.cm_hidden_from_catalogue ? 'translate-x-4' : 'translate-x-0',
                  ].join(' ')}
                />
              </span>
              <span
                className={
                  doc.cm_hidden_from_catalogue ? 'text-amber-600 font-medium' : 'text-gray-500'
                }
              >
                {doc.cm_hidden_from_catalogue ? 'Hidden from Catalogue' : 'Visible in Catalogue'}
              </span>
            </button>
          </div>
        </div>
      </CMSection>

      {/* ── Pack / Dimensions ── */}
      <CMSection title="Pack / Dimensions">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <CMField label="m² per Box">
            <NumInput value={doc.cm_sqm_per_box} onChange={(v) => set('cm_sqm_per_box', v)} />
          </CMField>
          <CMField label="Tiles per Box">
            <NumInput
              value={doc.cm_tiles_per_box}
              onChange={(v) => set('cm_tiles_per_box', v)}
              step="1"
              placeholder="0"
            />
          </CMField>
          <CMField label="Supplier Pack">
            <input
              className={CM.input}
              value={String(doc.cm_supplier_pack ?? '')}
              onChange={(e) => set('cm_supplier_pack', e.target.value)}
              placeholder="e.g. 6 boxes/pallet"
            />
          </CMField>
        </div>
      </CMSection>

      {/* ── Pricing ── */}
      {canSeePricing && (
        <CMSection title="Pricing">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <CMField label="Purchase Price ex VAT">
              <NumInput value={doc.cm_purchase_price_ex_vat} onChange={(v) => set('cm_purchase_price_ex_vat', v)} />
            </CMField>
            <CMField label="VAT Rate %">
              <NumInput value={doc.cm_vat_rate_percent} onChange={(v) => set('cm_vat_rate_percent', v)} placeholder="23" max="100" />
            </CMField>
            <CMField label="Target Margin %">
              <NumInput value={doc.cm_target_margin_percent} onChange={(v) => set('cm_target_margin_percent', v)} placeholder="30" max="100" />
            </CMField>
            <CMField label="RRP ex VAT (leave blank to auto-compute)">
              <NumInput value={doc.cm_rrp_ex_vat} onChange={(v) => set('cm_rrp_ex_vat', v)} />
            </CMField>
            <CMField label="Tier 1 Offer inc VAT (leave blank to auto-compute)">
              <NumInput value={doc.cm_offer_tier1_inc_vat} onChange={(v) => set('cm_offer_tier1_inc_vat', v)} step="1" />
            </CMField>
          </div>
          <p className="text-[11px] text-gray-400 mt-3">
            Detailed cost inputs (shipping, handling, landed fees) and tier pricing are in the Suppliers &amp; Pricing tab.
          </p>
        </CMSection>
      )}

      {/* ── Supplier ── */}
      {canPurchasing && (
        <CMSection title="Supplier">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CMField label="Supplier Name">
              <Typeahead<{ name: string; supplier_name?: string }>
                value={String(doc.cm_supplier_name ?? '')}
                onSearch={(q) =>
                  frappe.getList<{ name: string; supplier_name?: string }>('Supplier', {
                    fields: ['name', 'supplier_name'],
                    filters: [['supplier_name', 'like', `%${q}%`]],
                    limit: 20,
                  })
                }
                getLabel={(r) => r.supplier_name ?? r.name}
                getValue={(r) => r.name}
                onChange={(v) => set('cm_supplier_name', v)}
                placeholder="Search supplier…"
              />
            </CMField>

            <CMField label="Supplier Code">
              <input
                className={CM.input}
                value={String(doc.cm_supplier_code ?? '')}
                onChange={(e) => set('cm_supplier_code', e.target.value)}
                placeholder="Internal supplier reference"
              />
            </CMField>

            <div className="sm:col-span-2">
              <CMField label="Variant Description">
                <input
                  className={CM.input}
                  value={String(doc.cm_supplier_variant_description ?? '')}
                  onChange={(e) => set('cm_supplier_variant_description', e.target.value)}
                  placeholder="e.g. colour / finish variant as named by supplier"
                />
              </CMField>
            </div>

            <CMField label="Supplier Item Code">
              <input
                className={CM.input}
                value={String(doc.cm_supplier_item_code ?? '')}
                onChange={(e) => set('cm_supplier_item_code', e.target.value)}
                placeholder="Code used by supplier"
              />
            </CMField>

            <CMField label="Supplier Item Name">
              <input
                className={CM.input}
                value={String(doc.cm_supplier_item_name ?? '')}
                onChange={(e) => set('cm_supplier_item_name', e.target.value)}
                placeholder="Name used by supplier"
              />
            </CMField>
          </div>
        </CMSection>
      )}

      {isNew && (
        <div className="rounded border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          After creating the product, use the product detail screen to enter purchase prices,
          discounts, and landed costs.
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <CMButton onClick={() => void handleSave()} disabled={saving}>
          {saving ? 'Saving…' : isNew ? 'Create Product' : 'Save'}
        </CMButton>
        <CMButton variant="ghost" onClick={handleCancel} disabled={saving}>
          Cancel
        </CMButton>
      </div>
    </div>
  )
}

// ── ImageUpload sub-component ─────────────────────────────────────────────────

interface ImageUploadProps {
  doctype: string
  docname: string
  currentImage?: string
  onUploaded: (fileUrl: string) => void
}

function ImageUpload({ doctype, docname, currentImage, onUploaded }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setUploading(true)
    setError(null)
    try {
      const resp = await frappe.uploadFile(file, {
        doctype,
        docname: docname || undefined,
        fieldname: 'image',
        isPrivate: false,
      })
      const url = (resp as { file_url?: string }).file_url ?? ''
      if (docname) {
        await frappe.call('frappe.client.set_value', {
          doctype,
          name: docname,
          fieldname: 'image',
          value: url,
        })
      }
      onUploaded(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleRemove() {
    if (!docname) return
    await frappe.call('frappe.client.set_value', {
      doctype,
      name: docname,
      fieldname: 'image',
      value: '',
    })
    onUploaded('')
  }

  return (
    <div className="flex items-center gap-3">
      {currentImage ? (
        <img
          src={currentImage}
          alt="Product"
          className="h-16 w-16 rounded-lg object-cover border border-gray-200"
        />
      ) : (
        <div className="h-16 w-16 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-300 text-2xl">
          🖼
        </div>
      )}
      <div className="flex flex-col gap-1">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className={CM.btn.secondary + ' text-xs py-1 px-2'}
          >
            {uploading ? 'Uploading…' : currentImage ? 'Replace' : 'Upload image'}
          </button>
          {currentImage && (
            <button
              type="button"
              onClick={() => void handleRemove()}
              className={CM.btn.danger + ' text-xs py-1 px-2'}
            >
              Remove
            </button>
          )}
        </div>
        {error && <p className="text-[11px] text-red-600">{error}</p>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f) }}
      />
    </div>
  )
}

// ── ProductEditorInline — embedded editor for ProductGeneralTab ───────────────

interface InlineProps {
  doc: CMProductDoc
  onSave: (saved?: unknown) => void
  onCancel: () => void
  hideSupplier?: boolean
}

export function ProductEditorInline({ doc: initialDoc, onSave, onCancel, hideSupplier }: InlineProps) {
  const { can } = usePermissions()
  const canSeePricing = can('canSeePricing') || can('canAdmin')
  const canPurchasing = can('canPurchasing') || can('canAdmin')

  const [doc, setDoc] = useState<Record<string, unknown>>(initialDoc as unknown as Record<string, unknown>)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [pricingInputMode] = useState<'discount' | 'offer'>('discount')
  const [offerInput] = useState('')

  const set = useCallback((field: string, value: unknown) => {
    setDoc((prev) => ({ ...prev, [field]: value }))
  }, [])

  const vatRate = parsePrice(doc.cm_vat_rate_percent) ?? DEFAULT_VAT_RATE_PCT
  const rrpEx = parsePrice(doc.cm_rrp_ex_vat) ?? 0
  const rrpIncCalc = rrpEx > 0 ? normaliseRrpIncVat(rrpEx, vatRate) : 0

  const offerInputNum = parsePrice(offerInput)
  const backCalcDisc =
    offerInputNum != null && rrpIncCalc > 0
      ? Math.max(0, Math.min(100, (1 - offerInputNum / rrpIncCalc) * 100))
      : null

  async function handleSave() {
    if (!String(doc.item_name ?? '').trim()) { setError('Item Name is required.'); return }
    setSaving(true)
    setError('')
    try {
      let docToSave = doc as unknown as CMProductDoc
      if (pricingInputMode === 'offer' && backCalcDisc != null) {
        docToSave = { ...docToSave, cm_discount_target_percent: backCalcDisc } as CMProductDoc
      }
      const saved = await productsApi.save(docToSave)
      onSave(saved)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.')
      setSaving(false)
    }
  }

  const docName = String(doc.name ?? '')

  return (
    <div className="space-y-5">
      {error && <ErrorBox message={error} />}

      {/* Identity */}
      <CMSection title="Identity">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {docName && (
            <CMField label="Product Code">
              <input className={`${CM.input} bg-gray-50 cursor-not-allowed`} value={docName} readOnly />
            </CMField>
          )}
          <CMField label="Item Name *">
            <input
              className={CM.input}
              value={String(doc.item_name ?? '')}
              onChange={(e) => set('item_name', e.target.value)}
            />
          </CMField>
          <CMField label="Given Name">
            <input
              className={CM.input}
              value={String(doc.cm_given_name ?? '')}
              onChange={(e) => set('cm_given_name', e.target.value)}
            />
          </CMField>
          <CMField label="Item Group">
            <Typeahead<{ name: string }>
              value={String(doc.item_group ?? '')}
              onSearch={(q) =>
                frappe.getList<{ name: string }>('Item Group', {
                  fields: ['name'],
                  filters: [['name', 'like', `%${q}%`]],
                  limit: 20,
                })
              }
              getLabel={(r) => r.name}
              getValue={(r) => r.name}
              onChange={(v) => set('item_group', v)}
            />
          </CMField>
          <div className="sm:col-span-2">
            <CMField label="Description Line 1">
              <input
                className={CM.input}
                value={String(doc.cm_description_line_1 ?? '')}
                onChange={(e) => set('cm_description_line_1', e.target.value)}
              />
            </CMField>
          </div>
          <div className="sm:col-span-2">
            <CMField label="Description Line 2">
              <input
                className={CM.input}
                value={String(doc.cm_description_line_2 ?? '')}
                onChange={(e) => set('cm_description_line_2', e.target.value)}
              />
            </CMField>
          </div>
          {docName && (
            <div className="sm:col-span-2">
              <CMField label="Image">
                <ImageUpload
                  doctype="CM Product"
                  docname={docName}
                  currentImage={String(doc.image ?? '')}
                  onUploaded={(url) => set('image', url)}
                />
              </CMField>
            </div>
          )}
          <div className="flex items-center gap-6 sm:col-span-2 pt-1">
            <button
              type="button"
              onClick={() => set('disabled', doc.disabled ? 0 : 1)}
              className="inline-flex items-center gap-2 cursor-pointer select-none text-sm text-gray-700"
            >
              <span
                className={[
                  'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200',
                  doc.disabled ? 'bg-gray-300' : 'bg-cm-green',
                ].join(' ')}
              >
                <span
                  className={[
                    'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-200',
                    doc.disabled ? 'translate-x-0' : 'translate-x-4',
                  ].join(' ')}
                />
              </span>
              <span className={doc.disabled ? 'text-red-600 font-medium' : 'text-green-700 font-medium'}>
                {doc.disabled ? 'Inactive' : 'Active'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => set('cm_hidden_from_catalogue', doc.cm_hidden_from_catalogue ? 0 : 1)}
              className="inline-flex items-center gap-2 cursor-pointer select-none text-sm text-gray-700"
            >
              <span
                className={[
                  'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200',
                  doc.cm_hidden_from_catalogue ? 'bg-amber-400' : 'bg-gray-300',
                ].join(' ')}
              >
                <span
                  className={[
                    'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-200',
                    doc.cm_hidden_from_catalogue ? 'translate-x-4' : 'translate-x-0',
                  ].join(' ')}
                />
              </span>
              <span className={doc.cm_hidden_from_catalogue ? 'text-amber-600 font-medium' : 'text-gray-500'}>
                {doc.cm_hidden_from_catalogue ? 'Hidden from Catalogue' : 'Visible in Catalogue'}
              </span>
            </button>
          </div>
        </div>
      </CMSection>

      {/* Pack / Dimensions */}
      <CMSection title="Pack / Dimensions">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <CMField label="m² per Box">
            <NumInput value={doc.cm_sqm_per_box} onChange={(v) => set('cm_sqm_per_box', v)} />
          </CMField>
          <CMField label="Tiles per Box">
            <NumInput value={doc.cm_tiles_per_box} onChange={(v) => set('cm_tiles_per_box', v)} step="1" placeholder="0" />
          </CMField>
          <CMField label="Supplier Pack">
            <input
              className={CM.input}
              value={String(doc.cm_supplier_pack ?? '')}
              onChange={(e) => set('cm_supplier_pack', e.target.value)}
            />
          </CMField>
        </div>
      </CMSection>

      {/* Pricing */}
      {canSeePricing && (
        <CMSection title="Pricing">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CMField label="RRP excl. VAT">
              <NumInput value={doc.cm_rrp_ex_vat} onChange={(v) => set('cm_rrp_ex_vat', v)} />
            </CMField>
            <CMField label="RRP incl. VAT (calculated)">
              <div className={`${CM.input} bg-gray-50 text-gray-600 cursor-default`}>
                {rrpEx > 0 ? fmtMoneySmart(rrpIncCalc) : '—'}
              </div>
            </CMField>
            <div className="sm:col-span-2">
              <div className="flex gap-2 mb-3">
                {[
                  { mode: 'discount' as const, label: 'Set Discount %' },
                  { mode: 'offer' as const, label: 'Set Offer Price' },
                ].map(({ mode, label }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setPricingInputMode(mode)}
                    className={[
                      'px-3 py-1.5 rounded text-xs font-medium border transition-colors',
                      pricingInputMode === mode
                        ? 'bg-gray-700 text-white border-gray-700'
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50',
                    ].join(' ')}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {pricingInputMode === 'discount' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <CMField label="Target Discount %">
                    <NumInput value={doc.cm_discount_target_percent} onChange={(v) => set('cm_discount_target_percent', v)} placeholder="0.000" step="0.001" max="100" />
                  </CMField>
                  <CMField label="Offer incl. VAT (preview)">
                    <div className={`${CM.input} bg-gray-50 font-semibold text-cm-green cursor-default`}>
                      {rrpEx > 0 && discPct >= 0 ? fmtMoneyWhole(previewOffer) : '—'}
                    </div>
                  </CMField>
                  {rrpEx > 0 && discPct > 0 && (
                    <p className="sm:col-span-2 text-[11px] text-gray-400">
                      Offer excl. VAT: {fmtMoneySmart(previewOfferEx)}&ensp;·&ensp;Discount: {fmtDiscountUI(discPct)}
                    </p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <CMField label="Offer incl. VAT">
                    <NumInput value={offerInput} onChange={(v) => setOfferInput(v)} placeholder="0" step="1" />
                  </CMField>
                  <CMField label="Implied discount % (will be saved)">
                    <div className={`${CM.input} bg-gray-50 text-gray-600 cursor-default`}>
                      {backCalcDisc != null ? fmtDiscountUI(backCalcDisc) : '—'}
                    </div>
                  </CMField>
                  {backCalcOfferEx != null && (
                    <p className="sm:col-span-2 text-[11px] text-gray-400">
                      Offer excl. VAT: {fmtMoneySmart(backCalcOfferEx)}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </CMSection>
      )}

      {/* Supplier */}
      {!hideSupplier && canPurchasing && (
        <CMSection title="Supplier">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CMField label="Supplier Name">
              <Typeahead<{ name: string; supplier_name?: string }>
                value={String(doc.cm_supplier_name ?? '')}
                onSearch={(q) =>
                  frappe.getList<{ name: string; supplier_name?: string }>('Supplier', {
                    fields: ['name', 'supplier_name'],
                    filters: [['supplier_name', 'like', `%${q}%`]],
                    limit: 20,
                  })
                }
                getLabel={(r) => r.supplier_name ?? r.name}
                getValue={(r) => r.name}
                onChange={(v) => set('cm_supplier_name', v)}
              />
            </CMField>
            <CMField label="Supplier Code">
              <input
                className={CM.input}
                value={String(doc.cm_supplier_code ?? '')}
                onChange={(e) => set('cm_supplier_code', e.target.value)}
              />
            </CMField>
            <div className="sm:col-span-2">
              <CMField label="Variant Description">
                <input
                  className={CM.input}
                  value={String(doc.cm_supplier_variant_description ?? '')}
                  onChange={(e) => set('cm_supplier_variant_description', e.target.value)}
                />
              </CMField>
            </div>
            <CMField label="Supplier Item Code">
              <input
                className={CM.input}
                value={String(doc.cm_supplier_item_code ?? '')}
                onChange={(e) => set('cm_supplier_item_code', e.target.value)}
              />
            </CMField>
            <CMField label="Supplier Item Name">
              <input
                className={CM.input}
                value={String(doc.cm_supplier_item_name ?? '')}
                onChange={(e) => set('cm_supplier_item_name', e.target.value)}
              />
            </CMField>
          </div>
        </CMSection>
      )}

      <div className="flex gap-3 pt-1">
        <CMButton onClick={() => void handleSave()} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </CMButton>
        <CMButton variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </CMButton>
      </div>
    </div>
  )
}
