/**
 * AdvanceAllocationWidget — TypeScript port of V2 AdvanceAllocationWidget.jsx.
 *
 * Shows SO-deposit Payment Entries available to offset against a draft Sales
 * Invoice, and lets the user apply/adjust them.
 */
import { useState, useEffect, useCallback } from 'react'
import { frappe } from '../../api/frappe'

function fmt(n: unknown) {
  return `€${Number(n || 0).toLocaleString('en', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

interface AllocRow {
  reference_type: string
  reference_name: string
  reference_row: string
  advance_amount: number
  allocated_amount: string
  remarks: string
  ref_exchange_rate: number
  against_order?: string
}

interface AdvanceData {
  entries: any[]
  applied: any[]
  outstanding_amount: number
  total_advance: number
}

interface Props {
  siName: string
  onApplied: (result: unknown) => void
}

export function AdvanceAllocationWidget({ siName, onApplied }: Props) {
  const [data, setData] = useState<AdvanceData | null>(null)
  const [rows, setRows] = useState<AllocRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!siName) return
    setLoading(true)
    setError(null)
    frappe
      .call('casamoderna_dms.deposit_allocation_api.get_allocatable_advances', {
        si_name: siName,
      })
      .then((res: any) => {
        const d: AdvanceData = res?.message ?? res
        setData(d)

        const applied = d.applied || []
        const entries = d.entries || []

        if (applied.length > 0) {
          setRows(
            applied.map((a: any) => ({
              reference_type: a.reference_type || 'Payment Entry',
              reference_name: a.reference_name,
              reference_row: a.reference_row || '',
              advance_amount: a.advance_amount,
              allocated_amount: String(a.allocated_amount),
              remarks: a.remarks || '',
              ref_exchange_rate: 1,
            })),
          )
        } else if (entries.length > 0) {
          const outstanding = d.outstanding_amount || 0
          let remaining = outstanding
          setRows(
            entries.map((e: any) => {
              const avail = Number(e.amount || 0)
              const alloc = Math.min(avail, Math.max(0, remaining))
              remaining -= alloc
              return {
                reference_type: e.reference_type || 'Payment Entry',
                reference_name: e.reference_name,
                reference_row: e.reference_row || '',
                advance_amount: avail,
                allocated_amount: String(alloc),
                remarks: e.remarks || '',
                ref_exchange_rate: Number(e.exchange_rate || e.ref_exchange_rate || 1),
                against_order: e.against_order || '',
              }
            }),
          )
        } else {
          setRows([])
        }
      })
      .catch((err: any) => {
        setError(err?.message || 'Failed to load advances')
      })
      .finally(() => setLoading(false))
  }, [siName])

  useEffect(() => {
    load()
  }, [load])

  const handleApply = async () => {
    setSaving(true)
    setError(null)
    try {
      const allocations = rows
        .map((r) => ({ ...r, allocated_amount: Number(r.allocated_amount) || 0 }))
        .filter((r) => r.allocated_amount > 0)

      const res: any = await frappe.call(
        'casamoderna_dms.deposit_allocation_api.set_si_advances',
        {
          si_name: siName,
          allocations_json: JSON.stringify(allocations),
        },
      )
      const result = res?.message ?? res
      onApplied(result)
      load()
    } catch (err: any) {
      setError(err?.message || 'Failed to apply advances')
    } finally {
      setSaving(false)
    }
  }

  const handleClear = async () => {
    setSaving(true)
    setError(null)
    try {
      const res: any = await frappe.call(
        'casamoderna_dms.deposit_allocation_api.set_si_advances',
        { si_name: siName, allocations_json: '[]' },
      )
      const result = res?.message ?? res
      onApplied(result)
      load()
    } catch (err: any) {
      setError(err?.message || 'Failed to clear advances')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="text-[11px] text-gray-400 py-1">Loading received deposits…</div>
  }

  if (!loading && data && (data.entries || []).length === 0 && (data.applied || []).length === 0) {
    return (
      <div className="text-[11px] text-gray-400 py-1">No deposits on linked Sales Order.</div>
    )
  }

  if (!data && !loading) return null

  const totalAllocated = rows.reduce((s, r) => s + (Number(r.allocated_amount) || 0), 0)
  const hasApplied = (data?.applied || []).length > 0
  const hasChanges = rows.some((r) => Number(r.allocated_amount) > 0)

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={`${row.reference_name}-${i}`} className="bg-emerald-50 rounded p-2 space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-[11px] font-medium text-emerald-800 truncate max-w-[60%]">
              {row.reference_name}
            </span>
            {row.against_order && (
              <span className="text-[10px] text-gray-400 truncate">{row.against_order}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 w-24 shrink-0">
              Available: {fmt(row.advance_amount)}
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              max={row.advance_amount}
              className="flex-1 border border-emerald-200 rounded px-2 py-0.5 text-[12px] tabular-nums focus:outline-none focus:ring-1 focus:ring-emerald-400"
              value={row.allocated_amount}
              onChange={(e) => {
                const updated = [...rows]
                updated[i] = { ...row, allocated_amount: e.target.value }
                setRows(updated)
              }}
              disabled={saving}
            />
            {row.remarks && (
              <span className="text-[10px] text-gray-400 truncate max-w-[30%]">{row.remarks}</span>
            )}
          </div>
        </div>
      ))}

      {totalAllocated > 0 && (
        <div className="flex justify-between items-center pt-1 border-t border-emerald-100">
          <span className="text-[11px] text-emerald-700 font-medium">Total applied</span>
          <span className="text-[12px] font-semibold tabular-nums text-emerald-700">
            {fmt(totalAllocated)}
          </span>
        </div>
      )}

      {error && <p className="text-[11px] text-red-600">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-medium py-1.5 rounded disabled:opacity-50 transition-colors"
          onClick={handleApply}
          disabled={saving || !hasChanges}
        >
          {saving ? 'Applying…' : hasApplied ? 'Update Allocation' : 'Apply Deposit'}
        </button>
        {hasApplied && (
          <button
            className="px-3 border border-gray-200 hover:bg-gray-50 text-[12px] text-gray-500 rounded disabled:opacity-50 transition-colors"
            onClick={handleClear}
            disabled={saving}
            title="Remove all advance allocations"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}
