/**
 * WarrantyList — browse CM Warranty records with expiry alert banner.
 *
 * Route: /service/warranties
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import {
  PageHeader, FilterRow, DataTable, DetailSection, Btn, inputCls, selectCls,
  type Column,
} from '../../components/shared/ui'
import { fmtDate } from '../../utils/fmt'

interface WarrantyRow {
  name: string
  customer_name?: string
  item_name?: string
  serial_no?: string
  purchase_date?: string
  warranty_expiry?: string
  warranty_status?: string
}

const STATUS_COLOR: Record<string, string> = {
  'Active':  'bg-green-100 text-green-700',
  'Expired': 'bg-gray-100 text-gray-500',
  'Claimed': 'bg-blue-100 text-blue-700',
  'Void':    'bg-red-100 text-red-600',
}

function daysUntil(dateStr: string): number | null {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000)
}

const COLUMNS: Column<WarrantyRow>[] = [
  {
    key: 'name',
    label: 'Ref',
    render: (v) => <span className="font-mono text-[11px]">{v as string}</span>,
  },
  {
    key: 'customer_name',
    label: 'Customer',
    render: (v) => <span className="text-sm font-medium">{(v as string) || '—'}</span>,
  },
  {
    key: 'item_name',
    label: 'Product',
    render: (v) => <span className="text-sm">{(v as string) || '—'}</span>,
  },
  {
    key: 'serial_no',
    label: 'Serial / Batch',
    render: (v) => <span className="text-sm text-gray-500">{(v as string) || '—'}</span>,
  },
  {
    key: 'purchase_date',
    label: 'Purchase Date',
    render: (v) => <span className="text-sm">{v ? fmtDate(v as string) : '—'}</span>,
  },
  {
    key: 'warranty_expiry',
    label: 'Expiry',
    render: (v) => {
      if (!v) return <span className="text-sm text-gray-400">—</span>
      const d = daysUntil(v as string)
      const cls =
        d === null ? 'text-gray-400' :
        d < 0      ? 'text-gray-400' :
        d <= 30    ? 'text-amber-600 font-semibold' :
        'text-gray-700'
      return (
        <span className={`text-sm ${cls}`}>
          {fmtDate(v as string)}
          {d !== null && d >= 0 && d <= 30 ? ` (${d}d)` : ''}
        </span>
      )
    },
  },
  {
    key: 'warranty_status',
    label: 'Status',
    render: (v) => (
      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${STATUS_COLOR[v as string] ?? 'bg-gray-100 text-gray-500'}`}>
        {(v as string) || '—'}
      </span>
    ),
  },
]

const STATUS_FILTER_OPTIONS = [
  { value: '',        label: 'All Statuses' },
  { value: 'Active',  label: 'Active' },
  { value: 'Expired', label: 'Expired' },
  { value: 'Claimed', label: 'Claimed' },
  { value: 'Void',    label: 'Void' },
]

export function WarrantyList() {
  const navigate  = useNavigate()

  const [rows, setRows]       = useState<WarrantyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expiring, setExpiring] = useState<WarrantyRow[]>([])
  const [status, setStatus]   = useState('')
  const [customer, setCustomer] = useState('')
  const [search, setSearch]   = useState('')

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      try {
        const [list, exp] = await Promise.all([
          frappe.call<WarrantyRow[]>('casamoderna_dms.warranty_api.get_warranty_list', {
            status, customer, limit: 200,
          }),
          frappe.call<WarrantyRow[]>('casamoderna_dms.warranty_api.get_expiring_warranties', { days_ahead: 30 }),
        ])
        setRows(Array.isArray(list) ? list : [])
        setExpiring(Array.isArray(exp) ? exp : [])
      } catch { /* silent */ }
      setLoading(false)
    })()
  }, [status, customer])

  const filtered = rows.filter((r) =>
    !search ||
    [r.customer_name, r.item_name, r.serial_no, r.name].some(
      (f) => (f ?? '').toLowerCase().includes(search.toLowerCase()),
    ),
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Warranties"
        subtitle="Product warranty registrations"
        actions={<Btn onClick={() => navigate('/service/warranties/new')}>+ New Warranty</Btn>}
      />

      {expiring.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
          <p className="text-sm font-semibold text-amber-800">
            ⚠️ {expiring.length} warrant{expiring.length !== 1 ? 'ies' : 'y'} expiring in the next 30 days
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            {expiring.slice(0, 5).map((w) => (
              <span key={w.name} className="text-[11px] bg-white border border-amber-200 rounded px-2 py-0.5 text-amber-700">
                {w.customer_name} — {w.item_name} ({w.warranty_expiry ? fmtDate(w.warranty_expiry) : '—'})
              </span>
            ))}
          </div>
        </div>
      )}

      <FilterRow>
        <input
          type="text"
          className={inputCls}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customer, product, serial…"
        />
        <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_FILTER_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      </FilterRow>

      <DetailSection title={`Warranties (${filtered.length})`}>
        <DataTable
          columns={COLUMNS}
          rows={filtered}
          keyField="name"
          loading={loading}
          emptyMessage="No warranties found."
          onRowClick={(r) => navigate(`/service/warranties/${encodeURIComponent(r.name)}`)}
        />
      </DetailSection>
    </div>
  )
}
