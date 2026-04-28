/**
 * ProjectList — Interior Design / Fit-Out project list.
 *
 * Route: /projects
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import {
  PageHeader, FilterRow, DataTable, DetailSection, Btn, inputCls, selectCls,
  type Column,
} from '../../components/shared/ui'
import { fmtMoney, fmtDate } from '../../utils/fmt'

interface ProjectRow {
  name: string
  project_name?: string
  customer_name?: string
  project_type?: string
  status?: string
  start_date?: string
  expected_completion?: string
  total_value?: number
}

const STATUS_COLOR: Record<string, string> = {
  'Planning':    'bg-blue-100 text-blue-700',
  'In Progress': 'bg-amber-100 text-amber-700',
  'On Hold':     'bg-gray-100 text-gray-500',
  'Completed':   'bg-green-100 text-green-700',
  'Cancelled':   'bg-red-100 text-red-600',
}

const COLUMNS: Column<ProjectRow>[] = [
  {
    key: 'name',
    label: 'ID',
    render: (v) => <span className="font-mono text-[11px]">{v as string}</span>,
  },
  {
    key: 'project_name',
    label: 'Project Name',
    render: (v) => <span className="font-medium text-sm">{(v as string) || '—'}</span>,
  },
  {
    key: 'customer_name',
    label: 'Customer',
    render: (v) => <span className="text-sm">{(v as string) || '—'}</span>,
  },
  {
    key: 'project_type',
    label: 'Type',
    render: (v) => <span className="text-sm">{(v as string) || '—'}</span>,
  },
  {
    key: 'status',
    label: 'Status',
    render: (v) => (
      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${STATUS_COLOR[v as string] ?? 'bg-gray-100 text-gray-500'}`}>
        {(v as string) || '—'}
      </span>
    ),
  },
  {
    key: 'start_date',
    label: 'Start',
    render: (v) => <span className="text-sm">{v ? fmtDate(v as string) : '—'}</span>,
  },
  {
    key: 'expected_completion',
    label: 'Target',
    render: (v) => <span className="text-sm">{v ? fmtDate(v as string) : '—'}</span>,
  },
  {
    key: 'total_value',
    label: 'Value',
    align: 'right',
    render: (v) => <span className="tabular-nums text-sm">{v ? fmtMoney(v as number) : '—'}</span>,
  },
]

const STATUS_FILTER_OPTIONS = [
  { value: '',            label: 'All Statuses' },
  { value: 'Planning',    label: 'Planning' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'On Hold',     label: 'On Hold' },
  { value: 'Completed',   label: 'Completed' },
  { value: 'Cancelled',   label: 'Cancelled' },
]

export function ProjectList() {
  const navigate = useNavigate()

  const [rows, setRows]       = useState<ProjectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus]   = useState('')
  const [search, setSearch]   = useState('')

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      try {
        const res = await frappe.call<ProjectRow[]>('casamoderna_dms.project_api.get_project_list', { status })
        setRows(Array.isArray(res) ? res : [])
      } catch { /* silent */ }
      setLoading(false)
    })()
  }, [status])

  const filtered = rows.filter((r) =>
    !search ||
    [r.project_name, r.customer_name, r.name].some(
      (f) => (f ?? '').toLowerCase().includes(search.toLowerCase()),
    ),
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Projects"
        subtitle="Interior design &amp; fit-out projects"
        actions={<Btn onClick={() => navigate('/projects/new')}>+ New Project</Btn>}
      />

      <FilterRow>
        <input
          type="text"
          className={inputCls}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search project, customer…"
        />
        <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_FILTER_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      </FilterRow>

      <DetailSection title={`Projects (${filtered.length})`}>
        <DataTable
          columns={COLUMNS}
          rows={filtered}
          keyField="name"
          loading={loading}
          emptyMessage="No projects found."
          onRowClick={(r) => navigate(`/projects/${encodeURIComponent(r.name)}`)}
        />
      </DetailSection>
    </div>
  )
}
