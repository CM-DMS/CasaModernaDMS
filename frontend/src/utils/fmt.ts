/** Formatting utilities for V3 DMS frontend */

const EUR = new Intl.NumberFormat('en-MT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Format a number as €1,234.56 */
export function fmtMoney(value: number | string | null | undefined): string {
  const n = Number(value)
  if (isNaN(n)) return '—'
  return EUR.format(n)
}

/** Format an ISO date string as "28 Apr 2026" */
export function fmtDate(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Format delivery date as "End of Apr 2026" (last day of the month) */
export function fmtDeliveryMonth(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return fmtDate(value)
  return `End of ${d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`
}

/** Discount %: show to 3 decimal places, e.g. "12.500%" */
export function fmtDiscount(value: number | string | null | undefined): string {
  const n = Number(value)
  if (isNaN(n) || n === 0) return '0%'
  return `${n.toFixed(3)}%`
}
