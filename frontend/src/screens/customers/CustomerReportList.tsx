/**
 * CustomerReportList — browse and filter CM Customer Reports.
 *
 * Route: /customers/reports
 */
import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import {
  PageHeader, FilterRow, DataTable, Btn, selectCls, inputCls,
  type Column,
} from '../../components/shared/ui'
import { fmtDate } from '../../utils/fmt'

interface ReportRow {
  name: string
  customer: string
  customer_name?: string
  interaction_type: string
  category: string
  subject: string
  priority: string
  status: string
  assigned_to_name?: string
  opening_datetime?: string
}

const STATUS_STYLES: Record<string, string> = {
  'Open':        'bg-blue-100 text-blue-700',
  'In Progress': 'bg-amber-100 text-amber-700',
  'Resolved':    'bg-green-100 text-green-700',
  'Closed':      'bg-gray-100 text-gray-500',
}

const PRIORITY_STYLES: Record<string, string> = {
  'Low':    'bg-gray-50 text-gray-500 border-gray-200',
  'Normal': 'bg-blue-50 text-blue-600 border-blue-200',
  'High':   'bg-orange-50 text-orange-600 border-orange-200',
  'Urgent': 'bg-red-50 text-red-600 border-red-200',
}

const COLUMNS: Column<ReportRow>[] = [
  {
    key: 'name',
    label: 'Report #',
    render: (v) => <span className="font-mono text-[12px] font-semibold text-cm-green">{v as string}</span>,
  },
  {
    key: 'customer',
    label: 'Customer',
    render: (v, row) => (
      <div>
        <div className="font-medium text-sm">{row.customer_name || (v as string)}</div>
        <div className="text-xs text-gray-400">{v as string}</div>
      </div>
    ),
  },
  {
    key: 'interaction_type',
    label: 'Via',
    render: (v) => <span className="text-xs text-gray-600">{v as string}</span>,
  },
  {
    key: 'category',
    label: 'Category',
    render: (v) => <span className="text-sm">{v as string}</span>,
  },
  {
    key: 'subject',
    label: 'Subject',
    render: (v) => <span className="text-sm">{v as string}</span>,
  },
  {
    key: 'priority',
    label: 'Priority',
    render: (v) => (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${PRIORITY_STYLES[v as string] ?? PRIORITY_STYLES['Normal']}`}>
        {v as string}
      </span>
    ),
  },
  {
    key: 'status',
    label: 'Status',
    render: (v) => (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_STYLES[v as string] ?? 'bg-gray-100 text-gray-500'}`}>
        {v as string}
      </span>
    ),
  },
  {
    key: 'assigned_to_name',
    label: 'Assigned To',
    render: (v) => <span className="text-sm text-gray-600">{(v as string) || '—'}</span>,
  },
  {
    key: 'opening_datetime',
    label: 'Opened',
    render: (v) => <span className="text-xs text-gray-500">{v ? fmtDate((v as string).slice(0, 10)) : '—'}</span>,
  },
]

const STATUS_OPTIONS = [
  { value: '',            label: 'All Statuses' },
  { value: 'Open',        label: 'Open' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'Resolved',    label: 'Resolved' },
  { value: 'Closed',      label: 'Closed' },
]

const CATEGORY_OPTIONS = [
  { value: '',          label: 'All Categories' },
  { value: 'Complaint', label: 'Complaint' },
  { value: 'Remark',    label: 'Remark' },
  { value: 'Inquiry',   label: 'Inquiry' },
  { value: 'Feedback',  label: 'Feedback' },
  { value: 'Other',     label: 'Other' },
]

export function CustomerReportList() {
  const navigate = useNavigate()

  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const [rows, setRows] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const runSearch = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const args: Record<string, string | number> = { limit: 200 }
      if (status)   args.status   = status
      if (category) args.category = category
      if (q)        args.q        = q
      const data = await frappe.callGet<ReportRow[]>('casamoderna_dms.customer_reports.get_customer_report_list', args)
      setRows(Array.isArray(data) ? data : [])
    } catch (e: unknown) {
      setError((e as Error).message || 'Search failed')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [status, category, q])

  useEffect(() => { runSearch() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <PageHeader
        title="Customer Reports"
        subtitle="Log customer interactions, complaints and remarks"
        actions={<Btn onClick={() => navigate('/customers/reports/new')}>+ New Report</Btn>}
      />

      <FilterRow>
        <input
          type="text"
          placeholder="Search customer, subject…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && runSearch()}
          className={inputCls}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
          {STATUS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectCls}>
          {CATEGORY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
        <Btn onClick={runSearch}>Search</Btn>
      </FilterRow>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <DataTable
        columns={COLUMNS}
        rows={rows}
        keyField="name"
        loading={loading}
        emptyMessage="No reports match the current filters."
        onRowClick={(row) => navigate(`/customers/reports/${encodeURIComponent(row.name)}`)}
      />
    </div>
  )
}
