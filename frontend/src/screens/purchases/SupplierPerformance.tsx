/**
 * SupplierPerformance — Supplier delivery & quality performance scorecard.
 * Route: /purchases/supplier-performance
 */
import { useState } from 'react'
import { frappe } from '../../api/frappe'
import { usePermissions } from '../../auth/PermissionsProvider'
import { PageHeader, ErrorBox, Btn, inputCls } from '../../components/shared/ui'

const thisMonthFirst = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
const today = () => new Date().toISOString().slice(0, 10)

const GRADE_COLOR: Record<string, string> = {
  A: 'bg-green-100 text-green-700 border-green-200',
  B: 'bg-blue-100 text-blue-700 border-blue-200',
  C: 'bg-amber-100 text-amber-700 border-amber-200',
  D: 'bg-red-100 text-red-600 border-red-200',
}
const GRADE_TEXT: Record<string, string> = {
  A: 'text-green-700', B: 'text-blue-700', C: 'text-amber-700', D: 'text-red-600',
}

interface SupplierRow {
  supplier: string; supplier_name: string; order_count: number; grn_count: number
  on_time_rate: number; avg_delay_days: number; quality_issues: number; quality_rate: number
  performance_score: number; grade: string
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 90 ? 'bg-green-500' : score >= 75 ? 'bg-blue-500' : score >= 60 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2 min-w-[140px]">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[11px] font-bold tabular-nums w-8 text-right">{score}</span>
    </div>
  )
}

function RateBadge({ rate }: { rate: number }) {
  const color = rate >= 90 ? 'text-green-700' : rate >= 75 ? 'text-amber-700' : 'text-red-600'
  return <span className={`tabular-nums font-semibold ${color}`}>{rate}%</span>
}

export function SupplierPerformance() {
  const { can }           = usePermissions()
  const [from, setFrom]   = useState(thisMonthFirst())
  const [to, setTo]       = useState(today())
  const [rows, setRows]   = useState<SupplierRow[]>([])
  const [loading, setL]   = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!can('canPurchasing') && !can('canAdmin')) {
    return <div className="p-6 text-sm text-gray-500">Only purchasing staff can access this screen.</div>
  }

  async function run() {
    setL(true); setError(null)
    try {
      const res = await frappe.call<SupplierRow[]>(
        'casamoderna_dms.supplier_performance_api.get_supplier_performance',
        { date_from: from, date_to: to },
      )
      setRows(res ?? [])
    } catch (e: unknown) { setError((e as Error).message ?? 'Failed') }
    finally { setL(false) }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Supplier Performance" subtitle="Delivery, quality and overall score by supplier" />

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">From</label>
            <input type="date" className={inputCls} value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">To</label>
            <input type="date" className={inputCls} value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <Btn onClick={run} disabled={loading}>{loading ? 'Loading…' : 'Run'}</Btn>
        </div>
      </div>

      {error && <ErrorBox message={error} />}

      {rows.length > 0 && (
        <>
          {/* Grade summary */}
          <div className="grid grid-cols-4 gap-3">
            {(['A', 'B', 'C', 'D'] as const).map(g => {
              const count = rows.filter(r => r.grade === g).length
              return (
                <div key={g} className={`rounded-lg border px-4 py-3 text-center ${GRADE_COLOR[g]}`}>
                  <div className={`text-3xl font-black ${GRADE_TEXT[g]}`}>{g}</div>
                  <div className="text-sm text-gray-600 mt-0.5">{count} supplier{count !== 1 ? 's' : ''}</div>
                </div>
              )
            })}
          </div>

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-700">Supplier Scorecard ({rows.length} suppliers)</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-gray-200 text-[10px] uppercase tracking-wider text-gray-400">
                    <th className="text-left px-3 py-2">Rank</th>
                    <th className="text-left px-3 py-2">Supplier</th>
                    <th className="text-right px-3 py-2">Orders</th>
                    <th className="text-right px-3 py-2">GRNs</th>
                    <th className="text-right px-3 py-2">On-Time</th>
                    <th className="text-right px-3 py-2">Avg Delay</th>
                    <th className="text-right px-3 py-2">Quality Issues</th>
                    <th className="text-right px-3 py-2">Quality Rate</th>
                    <th className="text-center px-3 py-2">Score</th>
                    <th className="text-center px-3 py-2">Grade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((r, i) => (
                    <tr key={r.supplier} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-400 font-mono">#{i + 1}</td>
                      <td className="px-3 py-2">
                        <div className="font-semibold text-gray-800">{r.supplier_name}</div>
                        <div className="text-[10px] text-gray-400 font-mono">{r.supplier}</div>
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600">{r.order_count}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{r.grn_count}</td>
                      <td className="px-3 py-2 text-right"><RateBadge rate={r.on_time_rate} /></td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <span className={r.avg_delay_days > 0 ? 'text-amber-600' : 'text-gray-500'}>
                          {r.avg_delay_days > 0 ? `+${r.avg_delay_days}d` : r.avg_delay_days === 0 ? '—' : `${r.avg_delay_days}d`}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <span className={r.quality_issues > 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}>{r.quality_issues}</span>
                      </td>
                      <td className="px-3 py-2 text-right"><RateBadge rate={r.quality_rate} /></td>
                      <td className="px-3 py-2"><ScoreBar score={r.performance_score} /></td>
                      <td className="px-3 py-2 text-center">
                        <span className={`text-[11px] font-black px-2 py-0.5 rounded border ${GRADE_COLOR[r.grade] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                          {r.grade}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-gray-400 px-4 py-2">Score = 70% On-Time Rate + 30% Quality Rate. Grade: A≥90, B≥75, C≥60, D&lt;60.</p>
          </div>
        </>
      )}

      {!loading && rows.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-10">Select a date range and click Run to see supplier performance.</p>
      )}
    </div>
  )
}
