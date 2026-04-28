/**
 * ProductSuppliersPricingTab — full supplier price pipeline tab (V3).
 *
 * Sections:
 *   Supplier         — identity, currency, pack (editable)
 *   Pipeline Inputs  — list price, increases, discounts, RRP, target discount (editable)
 *   Landed Additions — shipping/handling/other (editable)
 *   Calculated Steps — read-only, server-computed
 *   Selling Outputs  — read-only, highlighted, server-computed
 *   Price History    — timeline of changes
 *
 * Gated: visible only to canSeePricing or canPurchasing.
 */
import { useState, useEffect } from 'react'
import { frappe } from '../../api/frappe'
import { CMSection, CMButton, CMField } from '../../components/ui/CMComponents'
import { CM } from '../../components/ui/CMClassNames'
import { Typeahead } from '../../components/sales/Typeahead'
import { fmtMoneyExact, fmtMoneyWhole, fmtDiscountUI, fmtDate } from '../../utils/pricing'
import { productsApi } from '../../api/products'
import { usePermissions } from '../../auth/PermissionsProvider'
import type { ItemDoc } from '../../api/products'

interface Props {
  item: ItemDoc
  onRefresh: () => void
}

const ROUNDING_MODES = [
  { value: '', label: '— select —' },
  { value: 'whole_euro_roundup', label: 'Whole euro (round nearest)' },
  { value: 'tile_decimal_pricing', label: 'Tile (2 decimal places)' },
]

// ── Display helpers ───────────────────────────────────────────────────────────

function ReadField({ label, value, mono = false }: { label: string; value?: string | number | null; mono?: boolean }) {
  const display = value !== undefined && value !== null && value !== '' ? String(value) : '—'
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</dt>
      <dd className={`text-sm text-gray-800 ${mono ? 'font-mono' : ''}`}>{display}</dd>
    </div>
  )
}

function ReadMoney({
  label,
  value,
  formatter = fmtMoneyExact,
  highlight = false,
}: {
  label: string
  value?: number | null
  formatter?: (n: number) => string
  highlight?: boolean
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</dt>
      <dd className={`text-sm font-medium tabular-nums ${highlight ? 'text-cm-green' : 'text-gray-700'}`}>
        {value != null && value !== 0 ? formatter(Number(value)) : '—'}
      </dd>
    </div>
  )
}

function ReadPercent({
  label,
  value,
  highlight = false,
  marginHealth = false,
}: {
  label: string
  value?: number | null
  highlight?: boolean
  marginHealth?: boolean
}) {
  let healthDot = null
  if (marginHealth && value != null && value !== 0) {
    const pct = Number(value)
    const color = pct < 10 ? 'bg-red-500' : pct < 20 ? 'bg-amber-400' : 'bg-green-500'
    const title =
      pct < 10 ? 'Low margin (<10%)' : pct < 20 ? 'Moderate margin (10-20%)' : 'Healthy margin (>20%)'
    healthDot = (
      <span className={`inline-block w-2 h-2 rounded-full ${color} mr-1`} title={title} />
    )
  }
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</dt>
      <dd
        className={`text-sm font-medium tabular-nums flex items-center ${highlight ? 'text-cm-green' : 'text-gray-700'}`}
      >
        {healthDot}
        {value != null && value !== 0 ? fmtDiscountUI(Number(value)) : '—'}
      </dd>
    </div>
  )
}

function SubSection({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{title}</h4>
        {badge && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 font-medium">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

function CalcGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded bg-gray-50 border border-gray-100 px-4 py-3">
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">{children}</dl>
    </div>
  )
}

function OutputGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded bg-green-50 border border-green-100 px-4 py-3">
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">{children}</dl>
    </div>
  )
}

function NumInput({
  value,
  onChange,
  placeholder = '0.00',
  step = '0.01',
  min = '0',
  max,
}: {
  value: unknown
  onChange: (v: string) => void
  placeholder?: string
  step?: string
  min?: string
  max?: string
}) {
  return (
    <input
      type="number"
      className={CM.input}
      value={(value as string) ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      step={step}
      min={min}
      max={max}
    />
  )
}

function EditForm({
  draft,
  setDraft,
  onSave,
  onCancel,
  saving,
}: {
  draft: ItemDoc
  setDraft: React.Dispatch<React.SetStateAction<ItemDoc>>
  onSave: () => void
  onCancel: () => void
  saving: boolean
}) {
  const set = (f: string, v: unknown) => setDraft((p) => ({ ...p, [f]: v }))
  return (
    <div className="space-y-6">
      <SubSection title="Supplier">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CMField label="Product Type">
            <select
              className={CM.select}
              value={String(draft.cm_product_type ?? 'Primary')}
              onChange={(e) => set('cm_product_type', e.target.value)}
            >
              <option value="Primary">Primary</option>
              <option value="Secondary">Secondary</option>
              <option value="Special Order">Special Order</option>
            </select>
          </CMField>
          <CMField label="Supplier Name">
            <Typeahead<{ name: string; supplier_name?: string }>
              value={String(draft.cm_supplier_name ?? '')}
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
              value={String(draft.cm_supplier_code ?? '')}
              onChange={(e) => set('cm_supplier_code', e.target.value)}
            />
          </CMField>
          <div className="sm:col-span-2">
            <CMField label="Variant Description">
              <input
                className={CM.input}
                value={String(draft.cm_supplier_variant_description ?? '')}
                onChange={(e) => set('cm_supplier_variant_description', e.target.value)}
              />
            </CMField>
          </div>
          <CMField label="Supplier Item Code">
            <input
              className={CM.input}
              value={String(draft.cm_supplier_item_code ?? '')}
              onChange={(e) => set('cm_supplier_item_code', e.target.value)}
            />
          </CMField>
          <CMField label="Supplier Item Name">
            <input
              className={CM.input}
              value={String(draft.cm_supplier_item_name ?? '')}
              onChange={(e) => set('cm_supplier_item_name', e.target.value)}
            />
          </CMField>
          <CMField label="Supplier Pack">
            <input
              className={CM.input}
              value={String(draft.cm_supplier_pack ?? '')}
              onChange={(e) => set('cm_supplier_pack', e.target.value)}
            />
          </CMField>
          <CMField label="Lead Time (days)">
            <NumInput
              value={draft.lead_time_days}
              onChange={(v) => set('lead_time_days', v)}
              placeholder="0"
              step="1"
            />
          </CMField>
        </div>
      </SubSection>

      <SubSection title="Pipeline Inputs" badge="editable">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <CMField label="Supplier List Price ex VAT">
            <NumInput
              value={draft.cm_purchase_price_ex_vat}
              onChange={(v) => set('cm_purchase_price_ex_vat', v)}
            />
          </CMField>
          <CMField label="Increase Before %">
            <NumInput
              value={draft.cm_increase_before_percent}
              onChange={(v) => set('cm_increase_before_percent', v)}
              placeholder="0"
            />
          </CMField>
          <CMField label="Discount 1 %">
            <NumInput
              value={draft.cm_discount_1_percent}
              onChange={(v) => set('cm_discount_1_percent', v)}
              placeholder="0"
              max="100"
            />
          </CMField>
          <CMField label="Discount 2 %">
            <NumInput
              value={draft.cm_discount_2_percent}
              onChange={(v) => set('cm_discount_2_percent', v)}
              placeholder="0"
              max="100"
            />
          </CMField>
          <CMField label="Discount 3 %">
            <NumInput
              value={draft.cm_discount_3_percent}
              onChange={(v) => set('cm_discount_3_percent', v)}
              placeholder="0"
              max="100"
            />
          </CMField>
          <CMField label="Increase After %">
            <NumInput
              value={draft.cm_increase_after_percent}
              onChange={(v) => set('cm_increase_after_percent', v)}
              placeholder="0"
            />
          </CMField>
          <CMField label="RRP ex VAT">
            <NumInput value={draft.cm_rrp_ex_vat} onChange={(v) => set('cm_rrp_ex_vat', v)} />
          </CMField>
          <CMField label="Target Discount %">
            <NumInput
              value={draft.cm_discount_target_percent}
              onChange={(v) => set('cm_discount_target_percent', v)}
              placeholder="0"
              max="100"
            />
          </CMField>
          <CMField label="Cost ex VAT (override)">
            <NumInput value={draft.cm_cost_ex_vat} onChange={(v) => set('cm_cost_ex_vat', v)} />
          </CMField>
          <CMField label="Pricing Mode">
            <select
              className={CM.select}
              value={String(draft.cm_pricing_rounding_mode ?? '')}
              onChange={(e) => set('cm_pricing_rounding_mode', e.target.value)}
            >
              {ROUNDING_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </CMField>
        </div>
      </SubSection>

      <SubSection title="Landed Additions" badge="editable">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CMField label="Shipping %">
            <NumInput
              value={draft.cm_shipping_percent}
              onChange={(v) => set('cm_shipping_percent', v)}
              placeholder="0"
            />
          </CMField>
          <CMField label="Shipping Fee">
            <NumInput value={draft.cm_shipping_fee} onChange={(v) => set('cm_shipping_fee', v)} />
          </CMField>
          <CMField label="Handling Fee">
            <NumInput value={draft.cm_handling_fee} onChange={(v) => set('cm_handling_fee', v)} />
          </CMField>
          <CMField label="Other Landed">
            <NumInput value={draft.cm_other_landed} onChange={(v) => set('cm_other_landed', v)} />
          </CMField>
          <CMField label="Delivery & Installation">
            <NumInput
              value={draft.cm_delivery_installation_fee}
              onChange={(v) => set('cm_delivery_installation_fee', v)}
            />
          </CMField>
        </div>
      </SubSection>

      <div className="flex gap-3 pt-1">
        <CMButton onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </CMButton>
        <CMButton variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </CMButton>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface PriceHistoryEntry {
  date: string
  by: string
  changes: Array<{ field: string; old: string; new: string }>
}

export function ProductSuppliersPricingTab({ item, onRefresh }: Props) {
  const { can } = usePermissions()
  const canEdit =
    (can('canEditProduct') || can('canAdmin')) &&
    (can('canPurchasing') || can('canSeePricing') || can('canAdmin'))
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<ItemDoc>(item)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [priceHistory, setPriceHistory] = useState<PriceHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  useEffect(() => {
    setHistoryLoading(true)
    frappe
      .call<PriceHistoryEntry[]>(
        'casamoderna_dms.api.catalogue_search.get_item_price_history',
        { name: item.name },
      )
      .then((d) => setPriceHistory(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }, [item.name])

  const startEdit = () => {
    setDraft({ ...item })
    setEditing(true)
    setError(null)
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await productsApi.save(draft as Record<string, unknown>)
      setEditing(false)
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="space-y-5">
        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        <EditForm
          draft={draft}
          setDraft={setDraft}
          onSave={handleSave}
          onCancel={() => setEditing(false)}
          saving={saving}
        />
        <p className="text-[11px] text-gray-400">
          Calculated Steps and Selling Outputs are computed automatically when saved.
        </p>
      </div>
    )
  }

  const roundingLabel =
    item.cm_pricing_rounding_mode === 'whole_euro_roundup'
      ? 'Whole euro (round nearest)'
      : item.cm_pricing_rounding_mode === 'tile_decimal_pricing'
      ? 'Tile (2 decimal places)'
      : item.cm_pricing_rounding_mode || null

  return (
    <div className="space-y-6">
      {canEdit && (
        <div className="flex justify-end">
          <CMButton variant="ghost" onClick={startEdit}>
            ✏️ Edit
          </CMButton>
        </div>
      )}

      <CMSection title="Supplier">
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <ReadField label="Product Type" value={item.cm_product_type} />
          <ReadField label="Supplier Name" value={item.cm_supplier_name} />
          <ReadField label="Supplier Code" value={item.cm_supplier_code} />
          <ReadField label="Supplier Item Code" value={item.cm_supplier_item_code} />
          <ReadField label="Supplier Item Name" value={item.cm_supplier_item_name} />
          <ReadField label="Supplier Pack" value={item.cm_supplier_pack} />
          <ReadField
            label="Lead Time"
            value={
              item.lead_time_days != null && item.lead_time_days !== 0
                ? `${item.lead_time_days} days`
                : null
            }
          />
          {item.cm_supplier_variant_description && (
            <div className="sm:col-span-3">
              <ReadField
                label="Variant Description"
                value={item.cm_supplier_variant_description}
              />
            </div>
          )}
        </dl>
      </CMSection>

      <CMSection title="Pipeline Inputs">
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <ReadMoney label="Supplier List Price ex VAT" value={item.cm_purchase_price_ex_vat} />
          <ReadPercent label="Increase Before %" value={item.cm_increase_before_percent} />
          <ReadPercent label="Discount 1 %" value={item.cm_discount_1_percent} />
          <ReadPercent label="Discount 2 %" value={item.cm_discount_2_percent} />
          <ReadPercent label="Discount 3 %" value={item.cm_discount_3_percent} />
          <ReadPercent label="Increase After %" value={item.cm_increase_after_percent} />
          <ReadMoney label="RRP ex VAT" value={item.cm_rrp_ex_vat} />
          <ReadPercent label="Target Discount %" value={item.cm_discount_target_percent} />
          <ReadMoney label="Cost ex VAT (override)" value={item.cm_cost_ex_vat} />
          <ReadField label="Pricing Mode" value={roundingLabel} />
        </dl>
      </CMSection>

      <CMSection title="Landed Additions">
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <ReadPercent label="Shipping %" value={item.cm_shipping_percent} />
          <ReadMoney label="Shipping Fee" value={item.cm_shipping_fee} />
          <ReadMoney label="Handling Fee" value={item.cm_handling_fee} />
          <ReadMoney label="Other Landed" value={item.cm_other_landed} />
          <ReadMoney label="Delivery & Installation" value={item.cm_delivery_installation_fee} />
        </dl>
      </CMSection>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            Calculated Steps
          </h4>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 font-medium">
            auto-computed on save
          </span>
        </div>
        <CalcGrid>
          <ReadMoney label="After Increase" value={item.cm_after_increase_before_ex_vat} />
          <ReadMoney label="After Discount 1" value={item.cm_after_discount_1_ex_vat} />
          <ReadMoney label="After Discount 2" value={item.cm_after_discount_2_ex_vat} />
          <ReadMoney label="After Discount 3" value={item.cm_after_discount_3_ex_vat} />
          <ReadMoney label="Landed Total ex VAT" value={item.cm_landed_additions_total_ex_vat} />
          <ReadMoney label="Cost ex VAT (calc)" value={item.cm_cost_ex_vat_calculated} />
          <ReadField
            label="VAT Rate %"
            value={item.cm_vat_rate_percent != null ? `${item.cm_vat_rate_percent}%` : null}
          />
        </CalcGrid>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            Selling Outputs
          </h4>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-600 font-medium">
            auto-computed on save
          </span>
        </div>
        <OutputGrid>
          <ReadMoney
            label="RRP inc VAT"
            value={item.cm_rrp_inc_vat}
            formatter={fmtMoneyWhole}
            highlight
          />
          <ReadMoney
            label="Final Offer inc VAT"
            value={item.cm_final_offer_inc_vat}
            formatter={fmtMoneyWhole}
            highlight
          />
          <ReadMoney
            label="Final Offer ex VAT"
            value={item.cm_final_offer_ex_vat}
            formatter={fmtMoneyExact}
          />
          <ReadPercent label="Effective Discount %" value={item.cm_discount_percent} highlight />
          <ReadMoney label="Profit ex VAT" value={item.cm_profit_ex_vat} formatter={fmtMoneyExact} />
          <ReadPercent label="Margin %" value={item.cm_margin_percent} highlight marginHealth />
          <ReadPercent label="Markup %" value={item.cm_markup_percent} />
        </OutputGrid>
      </div>

      {(historyLoading || priceHistory.length > 0) && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Price History
            </h4>
          </div>
          {historyLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
              <div className="h-4 w-4 rounded-full border-2 border-cm-green border-t-transparent animate-spin" />
              Loading…
            </div>
          ) : (
            <div className="space-y-3">
              {priceHistory.map((entry, i) => (
                <div key={i} className="border-l-2 border-indigo-200 pl-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] text-gray-500">{fmtDate(entry.date)}</span>
                    <span className="text-[11px] text-gray-400">by {entry.by}</span>
                  </div>
                  <div className="space-y-0.5">
                    {(entry.changes || []).map((c, j) => (
                      <div key={j} className="text-[12px] text-gray-700">
                        <span className="font-medium text-gray-500">{c.field}:</span>{' '}
                        <span className="line-through text-red-400">{c.old || '—'}</span>
                        {' → '}
                        <span className="text-green-700 font-medium">{c.new || '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
