/**
 * TotalsPanel — read-only totals display for sales documents.
 * Rule: NO arithmetic — server-authoritative values only.
 */
import { fmtMoneyExact } from '../../utils/pricing'
import { CM } from '../ui/CMClassNames'

interface PaymentScheduleRow {
  due_date?: string
  payment_amount?: number
  outstanding?: number
  name?: string
}

interface TotalsPanelProps {
  doc: {
    net_total?: number
    total_taxes_and_charges?: number
    grand_total?: number
    outstanding_amount?: number
    cm_customer_b_share?: number
    cm_customer_b_name?: string
    payment_schedule?: PaymentScheduleRow[]
  }
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between items-baseline py-1 ${bold ? 'border-t border-gray-200 mt-1 pt-2' : ''}`}>
      <span className={`text-xs ${bold ? 'font-semibold text-gray-800' : 'text-gray-500'}`}>{label}</span>
      <span className={`text-xs tabular-nums ${bold ? 'font-bold text-gray-900' : 'text-gray-700'}`}>{value}</span>
    </div>
  )
}

const EUR = (v?: number | null) =>
  v != null && Number.isFinite(Number(v)) ? fmtMoneyExact(Number(v)) : '—'

export function TotalsPanel({ doc }: TotalsPanelProps) {
  const {
    net_total,
    total_taxes_and_charges,
    grand_total,
    outstanding_amount,
    cm_customer_b_share,
    cm_customer_b_name,
    payment_schedule,
  } = doc

  return (
    <div className={CM.section}>
      <div className={`${CM.sectionTitle} mb-2`}>Totals</div>

      <Row label="Net Total (ex. VAT)" value={EUR(net_total)} />
      <Row label="VAT" value={EUR(total_taxes_and_charges)} />
      <Row label="Grand Total (inc. VAT)" value={EUR(grand_total)} bold />

      {outstanding_amount != null && Number(outstanding_amount) > 0 && (
        <Row label="Outstanding" value={EUR(outstanding_amount)} />
      )}

      {cm_customer_b_share != null && Number(cm_customer_b_share) > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <div className={CM.sectionTitle + ' mb-1'}>Customer B Split</div>
          <Row
            label={cm_customer_b_name || 'Customer B'}
            value={EUR(cm_customer_b_share)}
          />
        </div>
      )}

      {payment_schedule && payment_schedule.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <div className={CM.sectionTitle + ' mb-1'}>Payment Schedule</div>
          {payment_schedule.map((row, i) => (
            <div key={row.name || i} className="flex justify-between items-baseline py-0.5">
              <span className="text-[11px] text-gray-500">{row.due_date || `Payment ${i + 1}`}</span>
              <span className="text-[11px] tabular-nums text-gray-700">
                {EUR(row.payment_amount)}
                {row.outstanding != null && Number(row.outstanding) > 0 && (
                  <span className="ml-1 text-amber-600">({EUR(row.outstanding)} due)</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
