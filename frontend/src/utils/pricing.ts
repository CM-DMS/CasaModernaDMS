/**
 * Casa Moderna DMS — Canonical Pricing Utilities.
 *
 * Policy:
 *   - Source of truth is cm_rrp_ex_vat — always ex-VAT.
 *   - Default VAT rate is 18% unless an item rule overrides.
 *   - DO NOT perform arithmetic on document totals (grand_total etc.) — server-authoritative.
 */

export const DEFAULT_VAT_RATE_PCT = 18

export function applyDiscount(exVatBase: number, discountPct: number): number {
  if (!Number.isFinite(exVatBase) || !Number.isFinite(discountPct)) return 0
  return exVatBase * (1 - discountPct / 100)
}

export function applyVatAndCeil(exVat: number, vatRatePct = DEFAULT_VAT_RATE_PCT): number {
  if (!Number.isFinite(exVat)) return 0
  return Math.ceil(exVat * (1 + vatRatePct / 100))
}

export function normaliseRrpIncVat(rrpExVat: number, vatRatePct = DEFAULT_VAT_RATE_PCT): number {
  if (!Number.isFinite(rrpExVat)) return 0
  const vatFactor = 1 + vatRatePct / 100
  const raw3dp = Math.round(rrpExVat * vatFactor * 1000) / 1000
  return Math.round(raw3dp * 100) / 100
}

/** Return true when the item uses 2dp (tile/SQM) pricing rather than whole-euro rounding. */
export function isTileDecimalPricing(stockUom: string | null | undefined): boolean {
  return (stockUom ?? '').toUpperCase() === 'SQM'
}

export function customerFacingPrice(
  rrpExVat: number,
  discountPct = 0,
  vatRatePct = DEFAULT_VAT_RATE_PCT,
  stockUom?: string | null,
): number {
  if (!Number.isFinite(rrpExVat)) return 0
  const rrpIncVat2dp = normaliseRrpIncVat(rrpExVat, vatRatePct)
  const raw = rrpIncVat2dp * (1 - discountPct / 100)
  if (isTileDecimalPricing(stockUom)) {
    // Tiles: round to nearest cent (2dp)
    return Math.round(raw * 100) / 100
  }
  return Math.ceil(raw)
}

// ── Display formatters ───────────────────────────────────────────────────────

export function fmtMoneyExact(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return `€${n.toFixed(2)}`
}

export function fmtMoneySmart(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const r = Math.round(n * 100) / 100
  return r % 1 === 0 ? `€${r}` : `€${r.toFixed(2)}`
}

export function fmtMoneyWhole(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return `€${Math.ceil(n)}`
}

/** Format a stored offer/RRP price: 2dp for SQM items, whole-euro for all others. */
export function fmtMoneyOffer(n: number, stockUom?: string | null): string {
  if (!Number.isFinite(n)) return '—'
  if (isTileDecimalPricing(stockUom)) return fmtMoneySmart(n)
  return fmtMoneyWhole(n)
}

export function fmtDiscountUI(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(Number(pct))) return '—'
  return `${parseFloat(Number(pct).toFixed(3))}%`
}

export function parsePrice(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// ── Delivery date helpers ────────────────────────────────────────────────────

export function fmtDeliveryMonth(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d.getTime())) return '—'
  return `End of ${d.toLocaleString('en-GB', { month: 'long', year: 'numeric' })}`
}

export function toYearMonth(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  return dateStr.slice(0, 7)
}

export function lastDayOfMonth(yearMonth: string): string {
  if (!yearMonth) return ''
  const [y, m] = yearMonth.split('-').map(Number)
  const last = new Date(y, m, 0)
  return `${y}-${String(m).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return '—'
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    return `${dd}/${mm}/${d.getFullYear()}`
  } catch {
    return '—'
  }
}
