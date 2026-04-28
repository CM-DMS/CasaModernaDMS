/**
 * JobCardList — browse and filter CM Job Cards.
 *
 * Route: /service/job-cards
 */
import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import {
  PageHeader, FilterRow, DataTable, Btn, inputCls, selectCls,
  type Column,
} from '../../components/shared/ui'
import { fmtDate } from '../../utils/fmt'
import { usePermissions } from '../../auth/PermissionsProvider'

interface JobCardRow {
  name: string
  customer: string
  customer_name?: string
  job_type?: string
  assigned_to?: string
  scheduled_date?: string
  status: string
  modified?: string
}

const STATUS_STYLES: Record<string, string> = {
  'Open':        'bg-blue-100 text-blue-800',
  'In Progress': 'bg-amber-100 text-amber-800',
  'Completed':   'bg-green-100 text-green-800',
  'Cancelled':   'bg-red-100 text-red-800',
}

const STATUS_OPTIONS = ['', 'Open', 'In Progress', 'Completed', 'Cancelled']

const COLUMNS: Column<JobCardRow>[] = [
  {
    key: 'name',
    label: 'Reference',
    render: (v) => <span className="font-mono text-[12px] font-medium text-cm-green">{v as string}</span>,
  },
  {
    key: 'customer',
    label: 'Customer',
    render: (v, row) => <span className="font-medium">{row.customer_name || (v as string) || '—'}</span>,
  },
  {
    key: 'job_type',
    label: 'Type',
    render: (v) => <span className="text-sm">{(v as string) || '—'}</span>,
  },
  {
    key: 'assigned_to',
    label: 'Assigned To',
    render: (v) => <span className="text-sm text-gray-600">{(v as string) || '—'}</span>,
  },
  {
    key: 'scheduled_date',
    label: 'Scheduled',
    render: (v) => <span className="text-sm">{v ? fmtDate(v as string) : '—'}</span>,
  },
  {
    key: 'status',
    label: 'Status',
    render: (v) => (
      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_STYLES[v as string] ?? 'bg-gray-100 text-gray-700'}`}>
        {(v as string) || '—'}
      </span>
    ),
  },
]

export function JobCardList() {
  const navigate = useNavigate()
  const { can }  = usePermissions()

  const [q, setQ]               = useState('')
  const [status, setStatus]     = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate]     = useState('')
  const [rows, setRows]         = useState<JobCardRow[]>([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const runSearch = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const filters: [string, string, string][] = []
      if (status)   filters.push(['status', '=', status])
      if (fromDate) filters.push(['scheduled_date', '>=', fromDate])
      if (toDate)   filters.push(['scheduled_date', '<=', toDate])

      const LIST_FIELDS = ['name', 'customer', 'customer_name', 'job_type', 'status', 'assigned_to', 'scheduled_date', 'modified']

      let data: JobCardRow[]
      if (q) {
        data = await frappe.call<JobCardRow[]>('frappe.client.get_list', {
          doctype: 'CM Job Card',
          fields: LIST_FIELDS,
          filters,
          or_filters: [
            ['name', 'like', `%${q}%`],
            ['customer_name', 'like', `%${q}%`],
            ['customer', 'like', `%${q}%`],
          ],
          limit_page_length: 100,
          order_by: 'modified desc',
        }) ?? []
      } else {
        data = await frappe.getList<JobCardRow>('CM Job Card', {
          fields: LIST_FIELDS,
          filters,
          limit: 100,
          order_by: 'modified desc',
        }) ?? []
      }
      setRows(Array.isArray(data) ? data : [])
    } catch (e: unknown) {
      setError((e as Error).message || 'Search failed')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [q, status, fromDate, toDate])

  useEffect(() => { runSearch() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <PageHeader
        title="Job Cards"
        subtitle="Service delivery and installation jobs"
        actions={
          can('canService') ? (
            <Btn onClick={() => navigate('/service/job-cards/new')}>+ New Job Card</Btn>
          ) : undefined
        }
      />

      <FilterRow>
        <input
          type="text"
          className={inputCls}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && runSearch()}
          placeholder="Reference, customer…"
        />
        <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.filter(Boolean).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="date" className={inputCls} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <input type="date" className={inputCls} value={toDate}   onChange={(e) => setToDate(e.target.value)} />
        <Btn onClick={runSearch}>Search</Btn>
      </FilterRow>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <DataTable
        columns={COLUMNS}
        rows={rows}
        keyField="name"
        loading={loading}
        emptyMessage="No job cards found."
        onRowClick={(row) => navigate(`/service/job-cards/${encodeURIComponent(row.name)}`)}
      />
    </div>
  )
}
