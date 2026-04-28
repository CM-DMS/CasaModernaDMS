import { useState } from 'react'
import { frappe } from '../../api/frappe'
import {
  PageHeader, DetailSection, FieldWrap, ErrorBox, Btn, inputCls,
} from '../../components/shared/ui'
import { fmtMoney } from '../../utils/fmt'

interface AgedRow {
  party: string
  party_name?: string
  Current: number
  '1-30': number
  '31-60': number
  '61-90': number
  '90+': number
  total: number
}

interface AgedReport {
  rows: AgedRow[]
  totals: Record<string, number>
  as_of: string
}

const BUCKETS = ['Current', '1-30', '31-60', '61-90', '90+'] as const

function BucketBadge({ days, amount }: { days: typeof BUCKETS[number]; amount: number }) {
  if (!amount) return <span className="text-gray-300">—</span>
  const color =
    days === 'Current' ? 'text-green-700 bg-green-50' :
    days === '1-30'    ? 'text-amber-700 bg-amber-50' :
    days === '31-60'   ? 'text-orange-700 bg-orange-50' :
                         'text-red-700 bg-red-50'
  return (
    <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded tabular-nums ${color}`}>
      {fmtMoney(amount)}
    </span>
  )
}

function AgedTable({ data, loading }: { data: AgedReport | null; loading: boolean }) {
  if (loading) return <div className="h-40 bg-gray-50 rounded animate-pulse" />
  if (!data) return <p className="text-sm text-gray-400 py-8 text-center">Set a date and click Run.</p>
  if (!data.rows?.length) return <p className="text-sm text-gray-400 py-8 text-center">No outstanding balances found.</p>

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-gray-200 text-[10px] uppercase tracking-wider text-gray-400">
            <th className="text-left px-3 py-2">Party</th>
            {BUCKETS.map((b) => <th key={b} className="text-right px-3 py-2">{b}</th>)}
            <th className="text-right px-3 py-2 font-bold">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {data.rows.map((r) => (
            <tr key={r.party} className="hover:bg-gray-50">
              <td className="px-3 py-2">
                <div className="font-semibold text-gray-800">{r.party_name || r.party}</div>
                <div className="text-[10px] text-gray-400 font-mono">{r.party}</div>
              </td>
              {BUCKETS.map((b) => (
                <td key={b} className="px-3 py-2 text-right">
                  <BucketBadge days={b} amount={r[b] ?? 0} />
                </td>
              ))}
              <td className="px-3 py-2 text-right font-bold tabular-nums">{fmtMoney(r.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
            <td className="px-3 py-2 text-sm text-gray-600">TOTAL</td>
            {BUCKETS.map((b) => (
              <td key={b} className="px-3 py-2 text-right tabular-nums text-sm">
                {fmtMoney(data.totals[b] ?? 0)}
              </td>
            ))}
            <td className="px-3 py-2 text-right tabular-nums text-sm">{fmtMoney(data.totals.total ?? 0)}</td>
          </tr>
        </tfoot>
      </table>
      <div className="text-[10px] text-gray-400 mt-2 px-3">As of: {data.as_of}</div>
    </div>
  )
}

export function AgedReceivables() {
  const today = new Date().toISOString().slice(0, 10)
  const [asOf, setAsOf] = useState(today)
  const [mode, setMode] = useState<'ar' | 'ap'>('ar')
  const [arData, setArData] = useState<AgedReport | null>(null)
  const [apData, setApData] = useState<AgedReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function run() {
    setLoading(true)
    setError('')
    try {
      const [ar, ap] = await Promise.all([
        frappe.call<AgedReport>('casamoderna_dms.aged_ar_ap_api.get_aged_receivables', { as_of_date: asOf }),
        frappe.call<AgedReport>('casamoderna_dms.aged_ar_ap_api.get_aged_payables', { as_of_date: asOf }),
      ])
      setArData(ar)
      setApData(ap)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load aged report')
    } finally {
      setLoading(false)
    }
  }

  const currentData = mode === 'ar' ? arData : apData
  const arTotal = arData?.totals?.total ?? 0
  const apTotal = apData?.totals?.total ?? 0

  return (
    <div className="space-y-5">
      <PageHeader title="Aged Debtors / Creditors" subtitle="Outstanding balances by ageing bucket" />

      <DetailSection title="Parameters">
        <div className="flex flex-wrap items-end gap-3">
          <FieldWrap label="As Of Date">
            <input type="date" className={inputCls} value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          </FieldWrap>
          <div className="flex items-end pb-px">
            <Btn onClick={() => void run()} disabled={loading}>
              {loading ? 'Loading…' : 'Run'}
            </Btn>
          </div>
        </div>
        {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
      </DetailSection>

      {(arData || apData) && (
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Total Debtors (AR)', val: arTotal, color: 'text-amber-600' },
            { label: 'Total Creditors (AP)', val: apTotal, color: 'text-red-600' },
          ].map(({ label, val, color }) => (
            <div key={label} className="bg-white border border-gray-200 rounded-lg px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{label}</div>
              <div className={`text-2xl font-bold tabular-nums ${color}`}>{fmtMoney(val)}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1 border-b border-gray-200">
        {[['ar', 'Aged Receivables (Debtors)'], ['ap', 'Aged Payables (Creditors)']] .map(([id, lbl]) => (
          <button key={id} onClick={() => setMode(id as 'ar' | 'ap')}
            className={`px-4 py-2 text-[12px] font-semibold border-b-2 transition-colors ${
              mode === id ? 'border-cm-green text-cm-green' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {lbl}
          </button>
        ))}
      </div>

      <DetailSection title={mode === 'ar' ? 'Aged Receivables' : 'Aged Payables'}>
        <AgedTable data={currentData} loading={loading} />
      </DetailSection>
    </div>
  )
}
