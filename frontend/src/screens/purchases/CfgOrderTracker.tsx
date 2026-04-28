/**
 * CfgOrderTracker — Purchasing management for configured (CFG) product orders.
 * Shows all CM Custom Lines with SO context, PO coverage and fulfillment status.
 * Route: /purchases/cfg-tracker
 */
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import { usePermissions } from '../../auth/PermissionsProvider'
import { PageHeader, FilterRow, DataTable, ErrorBox, Btn, inputCls, selectCls, type Column } from '../../components/shared/ui'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { fmtDate } from '../../utils/fmt'

interface CfgLine {
  name: string; so_name: string; customer_name: string; parent_doctype: string
  transaction_date: string; delivery_date: string; so_docstatus: number
  line_type: string; configurator_type: string; config_summary: string; description: string
  tier_name: string; offer_incl_vat: number; cfg_status: string
  po_coverage: boolean; so_status: string
}

const SO_STATUS_OPTIONS = [
  { value: '',                    label: 'All statuses' },
  { value: 'Draft',               label: 'Draft' },
  { value: 'To Deliver and Bill', label: 'On Hold' },
  { value: 'To Deliver',          label: 'To Deliver' },
  { value: 'To Bill',             label: 'To Bill' },
  { value: 'Completed',           label: 'Completed' },
]
const LINE_TYPE_OPTIONS = [
  { value: '',           label: 'All types' },
  { value: 'CONFIGURED', label: 'Configured (CFG)' },
  { value: 'FREETEXT',   label: 'Free Text' },
]

function PoCoverage({ covered }: { covered: boolean }) {
  return covered
    ? <span className="text-[11px] text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">✓ PO raised</span>
    : <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">⚠ Not ordered</span>
}

const COLUMNS: Column<CfgLine>[] = [
  {
    key: 'name', label: 'CFG Ref',
    render: (v, row) => (
      <div>
        <span className="font-mono text-[12px] text-cm-green font-semibold">{v as string}</span>
        <div className="text-[10px] text-gray-400 mt-0.5">
          <span className={`inline-block rounded px-1 py-0 ${row.line_type === 'CONFIGURED' ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-500'}`}>
            {row.line_type}
          </span>
        </div>
      </div>
    ),
  },
  {
    key: 'customer_name', label: 'Customer',
    render: v => <span className="text-sm">{v as string}</span>,
  },
  {
    key: 'so_name', label: 'Document',
    render: (v, row) => (
      <div>
        <span className="font-mono text-[12px] text-gray-700">{v as string}</span>
        <div className="flex items-center gap-1 mt-0.5">
          <span className={`text-[10px] rounded px-1 py-0 ${row.parent_doctype === 'Sales Order' ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>
            {row.parent_doctype === 'Sales Order' ? 'SO' : 'QT'}
          </span>
          <span className="text-[11px] text-gray-400">{fmtDate(row.transaction_date)}</span>
        </div>
      </div>
    ),
  },
  {
    key: 'delivery_date', label: 'Delivery',
    render: v => <span className="text-sm text-gray-600">{fmtDate(v as string)}</span>,
  },
  {
    key: 'config_summary', label: 'Description',
    render: (v, row) => (
      <div className="max-w-xs">
        <div className="text-sm font-medium text-gray-800 leading-snug">{(v as string) || row.description || '—'}</div>
        {row.configurator_type && <div className="text-[10px] text-indigo-500 mt-0.5">{row.configurator_type}</div>}
      </div>
    ),
  },
  {
    key: 'tier_name', label: 'Tier',
    render: v => v
      ? <span className="text-[11px] bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5">{v as string}</span>
      : <span className="text-gray-300">—</span>,
  },
  {
    key: 'offer_incl_vat', label: 'Offer (inc VAT)', align: 'right',
    render: v => <span className="text-sm font-semibold text-gray-800">{(v as number) > 0 ? `€${(v as number).toFixed(2)}` : '—'}</span>,
  },
  {
    key: 'cfg_status', label: 'Status',
    render: (v, row) => <StatusBadge docstatus={row.so_docstatus} status={v as string} />,
  },
  {
    key: 'po_coverage', label: 'PO',
    render: v => <PoCoverage covered={v as boolean} />,
  },
]

export function CfgOrderTracker() {
  const navigate   = useNavigate()
  const { can }    = usePermissions()
  const [rows, setRows]         = useState<CfgLine[]>([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [q, setQ]               = useState('')
  const [lineType, setLineType] = useState('')
  const [soStatus, setSoStatus] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate]     = useState('')

  if (!can('canPurchasing') && !can('canAdmin')) {
    return (
      <div className="p-6 text-sm text-gray-500">Only purchasing staff can access this screen.</div>
    )
  }

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await frappe.call<CfgLine[]>(
        'casamoderna_dms.cfg_purchasing_api.get_cfg_order_lines',
        { q, line_type: lineType, so_status: soStatus, from_date: fromDate, to_date: toDate, include_quotations: true, limit: 300 },
      )
      setRows(res ?? [])
    } catch (e: unknown) { setError((e as Error).message ?? 'Failed') }
    finally { setLoading(false) }
  }, [q, lineType, soStatus, fromDate, toDate])

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const unordered = rows.filter(r => !r.po_coverage).length

  return (
    <div className="space-y-4">
      <PageHeader title="CFG Order Tracker" subtitle="Custom / configured product lines across all orders" />

      <FilterRow>
        <input className={inputCls} value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load()}
          placeholder="Customer, SO#, description…" />
        <select className={selectCls} value={lineType} onChange={e => { setLineType(e.target.value); }}>
          {LINE_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className={selectCls} value={soStatus} onChange={e => setSoStatus(e.target.value)}>
          {SO_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input type="date" className={inputCls} value={fromDate} onChange={e => setFromDate(e.target.value)} />
        <input type="date" className={inputCls} value={toDate} onChange={e => setToDate(e.target.value)} />
        <Btn onClick={load} disabled={loading}>Search</Btn>
      </FilterRow>

      {error && <ErrorBox message={error} />}

      {!loading && rows.length > 0 && (
        <div className="flex items-center gap-4 text-sm text-gray-500 px-1">
          <span>{rows.length} line{rows.length !== 1 ? 's' : ''}</span>
          {unordered > 0 && (
            <span className="text-amber-700 font-medium">⚠ {unordered} not yet ordered</span>
          )}
        </div>
      )}

      <DataTable
        columns={COLUMNS}
        rows={rows}
        loading={loading}
        emptyMessage="No CFG lines found."
        onRowClick={row => navigate(`/sales/orders/${encodeURIComponent(row.so_name)}/fulfillment`)}
      />
    </div>
  )
}
