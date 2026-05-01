/**
 * ProductSuppliersPricingTab — Suppliers & Pricing tab for ProductProfile (V3).
 *
 * Sections:
 *   1. Supplier         — name + code (editable)
 *   2. Cost Inputs      — purchase price, VAT rate, shipping/handling/fees (editable)
 *   3. Computed Cost    — landed total + cost ex VAT (read-only)
 *   4. RRP              — target margin, RRP ex VAT (editable), RRP inc VAT (r/o)
 *   5. Offer Pricing    — Tier 1 / 2 / 3 (Tier 1 editable, Tier 2+3 r/o from server)
 *   6. Profitability    — profit + margin with health indicator (r/o)
 *   7. Price History    — Version log timeline
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
import type { CMProductDoc } from '../../api/products'

interface Props {
  item: CMProductDoc
  onRefresh: () => void
}

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
    healthDot = <span className={`inline-block w-2 h-2 rounded-full ${color} mr-1`} title={title} />
  }
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</dt>
      <dd className={`text-sm font-medium tabular-nums flex items-center ${highlight ? 'text-cm-green' : 'text-gray-700'}`}>
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
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 font-medium">{badge}</span>
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

function ProfitGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded bg-amber-50 border border-amber-100 px-4 py-3">
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">{children}</dl>
    </div>
  )
}

function TierGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded bg-green-50 border border-green-100 px-4 py-3">
      <dl className="grid grid-cols-3 gap-4">{children}</dl>
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

// ── Edit form ─────────────────────────────────────────────────────────────────

function EditForm({
  draft,
  setDraft,
  onSave,
  onCancel,
  saving,
}: {
  draft: CMProductDoc
  setDraft: React.Dispatch<React.SetStateAction<CMProductDoc>>
  onSave: () => void
  onCancel: () => void
  saving: boolean
}) {
  const set = (f: string, v: unknown) => setDraft((p) => ({ ...p, [f]: v }))

  return (
    <div className="space-y-6">
      <SubSection title="Supplier">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        </div>
      </SubSection>

      <SubSection title="Cost Inputs" badge="editable">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <CMField label="Purchase Price ex VAT">
            <NumInput value={draft.cm_purchase_price_ex_vat} onChange={(v) => set('cm_purchase_price_ex_vat', v)} />
          </CMField>
          <CMField label="VAT Rate %">
            <NumInput value={draft.cm_vat_rate_percent} onChange={(v) => set('cm_vat_rate_percent', v)} placeholder="23" max="100" />
          </CMField>
          <CMField label="Shipping %">
            <NumInput value={draft.cm_shipping_percent} onChange={(v) => set('cm_shipping_percent', v)} placeholder="0" />
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
            <NumInput value={draft.cm_delivery_installation_fee} onChange={(v) => set('cm_delivery_installation_fee', v)} />
          </CMField>
        </div>
      </SubSection>

      <SubSection title="RRP" badge="editable">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <CMField label="Target Margin %">
            <NumInput value={draft.cm_target_margin_percent} onChange={(v) => set('cm_target_margin_percent', v)} placeholder="30" max="100" />
          </CMField>
          <CMField label="RRP ex VAT">
            <NumInput value={draft.cm_rrp_ex_vat} onChange={(v) => set('cm_rrp_ex_vat', v)} />
          </CMField>
        </div>
      </SubSection>

      <SubSection title="Offer Pricing" badge="Tier 1 editable">
        <div className="grid grid-cols-3 gap-4">
          <CMField label="Tier 1 inc VAT">
            <NumInput value={draft.cm_offer_tier1_inc_vat} onChange={(v) => set('cm_offer_tier1_inc_vat', v)} />
          </CMField>
          <CMField label="Tier 2 inc VAT">
            <NumInput value={draft.cm_offer_tier2_inc_vat} onChange={(v) => set('cm_offer_tier2_inc_vat', v)} />
          </CMField>
          <CMField label="Tier 3 inc VAT">
            <NumInput value={draft.cm_offer_tier3_inc_vat} onChange={(v) => set('cm_offer_tier3_inc_vat', v)} />
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

// ── Price history types ───────────────────────────────────────────────────────

interface PriceHistoryEntry {
  date: string
  by: string
  changes: Array<{ field: string; old: string; new: string }>
}

// ── Main component ────────────────────────────────────────────────────────────

export function ProductSuppliersPricingTab({ item, onRefresh }: Props) {
  const { can } = usePermissions()
  const canEdit =
    (can('canEditProduct') || can('canAdmin')) &&
    (can('canPurchasing') || can('canSeePricing') || can('canAdmin'))

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<CMProductDoc>(item)
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
          <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}
        <EditForm draft={draft} setDraft={setDraft} onSave={handleSave} onCancel={() => setEditing(false)} saving={saving} />
        <p className="text-[11px] text-gray-400">
          Computed Cost and Profitability are recalculated automatically when saved.
        </p>
      </div>
    )
  }

  const rrpOverride = item.cm_rrp_manual_override === 1
  const profit = (item.cm_offer_tier1_ex_vat ?? 0) - (item.cm_cost_ex_vat_calculated ?? 0)
  const tier1Ex = item.cm_offer_tier1_ex_vat ?? 0
  const costEx = item.cm_cost_ex_vat_calculated ?? 0
  const marginPct = tier1Ex > 0 ? ((tier1Ex - costEx) / tier1Ex) * 100 : null
  const markupPct = costEx > 0 ? ((tier1Ex - costEx) / costEx) * 100 : null

  return (
    <div className="space-y-6">
      {canEdit && (
        <div className="flex justify-end">
          <CMButton variant="ghost" onClick={startEdit}>✏️ Edit</CMButton>
        </div>
      )}

      {/* 1. Supplier */}
      <CMSection title="Supplier">
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <ReadField label="Supplier Name" value={item.cm_supplier_name} />
          <ReadField label="Supplier Code" value={item.cm_supplier_code} mono />
          <ReadField label="Product Type" value={item.cm_product_type} />
        </dl>
      </CMSection>

      {/* 2. Cost Inputs */}
      <CMSection title="Cost Inputs">
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <ReadMoney label="Purchase Price ex VAT" value={item.cm_purchase_price_ex_vat} />
          <ReadField label="VAT Rate %" value={item.cm_vat_rate_percent != null ? `${item.cm_vat_rate_percent}%` : null} />
          <ReadPercent label="Shipping %" value={item.cm_shipping_percent} />
          <ReadMoney label="Shipping Fee" value={item.cm_shipping_fee} />
          <ReadMoney label="Handling Fee" value={item.cm_handling_fee} />
          <ReadMoney label="Other Landed" value={item.cm_other_landed} />
          <ReadMoney label="Delivery & Installation" value={item.cm_delivery_installation_fee} />
        </dl>
      </CMSection>

      {/* 3. Computed Cost */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Computed Cost</h4>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 font-medium">auto-computed</span>
        </div>
        <CalcGrid>
          <ReadMoney label="Landed Additions Total ex VAT" value={item.cm_landed_additions_total_ex_vat} />
          <ReadMoney label="Cost ex VAT (calculated)" value={item.cm_cost_ex_vat_calculated} highlight />
        </CalcGrid>
      </div>

      {/* 4. RRP */}
      <CMSection title="RRP">
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <ReadField label="Target Margin %" value={item.cm_target_margin_percent != null ? `${item.cm_target_margin_percent}%` : null} />
          <div className="flex flex-col gap-0.5">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">RRP ex VAT</dt>
            <dd className="text-sm font-medium tabular-nums text-gray-700 flex items-center gap-1.5">
              {item.cm_rrp_ex_vat != null && item.cm_rrp_ex_vat !== 0 ? fmtMoneyExact(item.cm_rrp_ex_vat) : '—'}
              {rrpOverride && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-medium">manual override</span>
              )}
            </dd>
          </div>
          <ReadMoney label="RRP inc VAT" value={item.cm_rrp_inc_vat} formatter={fmtMoneyWhole} highlight />
        </dl>
      </CMSection>

      {/* 5. Offer Pricing — 3 tiers */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Offer Pricing</h4>
        </div>
        <TierGrid>
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-200 pb-1">Tier 1 (Standard)</span>
            <ReadMoney label="inc VAT" value={item.cm_offer_tier1_inc_vat} formatter={fmtMoneyWhole} highlight />
            <ReadMoney label="ex VAT" value={item.cm_offer_tier1_ex_vat} />
            <ReadPercent label="Discount %" value={item.cm_offer_tier1_discount_pct} />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-200 pb-1">Tier 2</span>
            <ReadMoney label="inc VAT" value={item.cm_offer_tier2_inc_vat} formatter={fmtMoneyWhole} />
            <ReadMoney label="ex VAT" value={item.cm_offer_tier2_ex_vat} />
            <ReadPercent label="Discount %" value={item.cm_offer_tier2_discount_pct} />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-200 pb-1">Tier 3</span>
            <ReadMoney label="inc VAT" value={item.cm_offer_tier3_inc_vat} formatter={fmtMoneyWhole} />
            <ReadMoney label="ex VAT" value={item.cm_offer_tier3_ex_vat} />
            <ReadPercent label="Discount %" value={item.cm_offer_tier3_discount_pct} />
          </div>
        </TierGrid>
      </div>

      {/* 6. Profitability */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Profitability</h4>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-600 font-medium">based on Tier 1</span>
        </div>
        <ProfitGrid>
          <ReadMoney label="Profit ex VAT" value={profit > 0 ? profit : null} formatter={fmtMoneyExact} highlight={profit > 0} />
          <ReadPercent label="Margin %" value={marginPct} highlight marginHealth />
          <ReadPercent label="Markup %" value={markupPct} />
        </ProfitGrid>
      </div>

      {/* 7. Price History */}
      {(historyLoading || priceHistory.length > 0) && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Price History</h4>
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
