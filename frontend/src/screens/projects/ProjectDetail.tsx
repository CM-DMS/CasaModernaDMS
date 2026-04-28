/**
 * ProjectDetail — view a CM Project with profitability panel.
 *
 * Route: /projects/:id
 */
import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import {
  PageHeader, DetailSection, DataTable, BackLink, Btn,
  type Column,
} from '../../components/shared/ui'
import { fmtMoney, fmtDate } from '../../utils/fmt'

interface SalesOrderRow {
  name: string
  transaction_date?: string
  status?: string
  billing_status?: string
  grand_total?: number
}

interface ProjectDoc {
  name: string
  project_name?: string
  customer_name?: string
  project_type?: string
  status?: string
  computed_total_value?: number
  linked_orders_detail?: SalesOrderRow[]
  description?: string
}

interface ProfitData {
  revenue?: number
  cogs?: number
  gross_profit?: number
  gp_pct?: number
}

const STATUS_COLOR: Record<string, string> = {
  'Planning':    'bg-blue-100 text-blue-700',
  'In Progress': 'bg-amber-100 text-amber-700',
  'On Hold':     'bg-gray-100 text-gray-500',
  'Completed':   'bg-green-100 text-green-700',
  'Cancelled':   'bg-red-100 text-red-600',
}

const SO_COLS: Column<SalesOrderRow>[] = [
  {
    key: 'name',
    label: 'Order',
    render: (v) => <span className="font-mono text-[11px]">{v as string}</span>,
  },
  {
    key: 'transaction_date',
    label: 'Date',
    render: (v) => <span className="text-sm">{v ? fmtDate(v as string) : '—'}</span>,
  },
  {
    key: 'status',
    label: 'Status',
    render: (v) => <span className="text-sm">{(v as string) || '—'}</span>,
  },
  {
    key: 'billing_status',
    label: 'Billing',
    render: (v) => <span className="text-sm">{(v as string) || '—'}</span>,
  },
  {
    key: 'grand_total',
    label: 'Value',
    align: 'right',
    render: (v) => <span className="tabular-nums text-sm">{v ? fmtMoney(v as number) : '—'}</span>,
  },
]

function ProfitBar({ gp_pct }: { gp_pct: number }) {
  const color = gp_pct >= 30 ? 'bg-green-500' : gp_pct >= 15 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(gp_pct, 100)}%` }} />
      </div>
      <span className="text-sm font-bold tabular-nums w-12 text-right">{gp_pct}%</span>
    </div>
  )
}

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [project, setProject] = useState<ProjectDoc | null>(null)
  const [profit, setProfit]   = useState<ProfitData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const [p, prof] = await Promise.all([
          frappe.call<ProjectDoc>('casamoderna_dms.project_api.get_project', { name: id }),
          frappe.call<ProfitData>('casamoderna_dms.project_api.get_project_profitability', { name: id }),
        ])
        setProject(p ?? null)
        setProfit(prof ?? null)
      } catch { /* silent */ }
      setLoading(false)
    })()
  }, [id])

  if (loading) return <div className="p-8 text-sm text-gray-400 animate-pulse">Loading…</div>
  if (!project) return <div className="p-8 text-sm text-red-500">Project not found.</div>

  return (
    <div className="space-y-5">
      <PageHeader
        title={project.project_name ?? id!}
        subtitle={`${project.project_type || 'Project'} · ${project.customer_name ?? ''}`}
        actions={
          <div className="flex gap-2 items-center">
            <span className={`text-[10px] font-bold px-2 py-1 rounded ${STATUS_COLOR[project.status ?? ''] ?? 'bg-gray-100 text-gray-500'}`}>
              {project.status}
            </span>
            <Btn onClick={() => navigate(`/projects/${encodeURIComponent(id!)}/edit`)}>Edit</Btn>
          </div>
        }
      />

      {/* KPI chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Project Value',       val: fmtMoney(project.computed_total_value ?? 0) },
          { label: 'Revenue (invoiced)',  val: profit ? fmtMoney(profit.revenue ?? 0) : '—' },
          { label: 'Gross Profit',        val: profit ? fmtMoney(profit.gross_profit ?? 0) : '—' },
          { label: 'GP Margin',           val: profit ? `${profit.gp_pct}%` : '—' },
        ].map(({ label, val }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-lg px-4 py-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{label}</div>
            <div className="text-xl font-bold text-gray-900 tabular-nums">{val}</div>
          </div>
        ))}
      </div>

      {profit && profit.gp_pct !== undefined && (
        <DetailSection title="Profitability">
          <ProfitBar gp_pct={profit.gp_pct} />
          <div className="grid grid-cols-3 gap-4 mt-3 text-sm">
            <div><span className="text-gray-400">Revenue: </span><strong>{fmtMoney(profit.revenue ?? 0)}</strong></div>
            <div><span className="text-gray-400">COGS: </span><strong>{fmtMoney(profit.cogs ?? 0)}</strong></div>
            <div>
              <span className="text-gray-400">Gross Profit: </span>
              <strong className={(profit.gross_profit ?? 0) >= 0 ? 'text-green-700' : 'text-red-600'}>
                {fmtMoney(profit.gross_profit ?? 0)}
              </strong>
            </div>
          </div>
        </DetailSection>
      )}

      <DetailSection title="Linked Sales Orders">
        <DataTable
          columns={SO_COLS}
          rows={project.linked_orders_detail ?? []}
          keyField="name"
          emptyMessage="No linked Sales Orders yet. Edit project to add them."
        />
      </DetailSection>

      {project.description && (
        <DetailSection title="Description">
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{project.description}</p>
        </DetailSection>
      )}

      <BackLink label="Back to Projects" onClick={() => navigate('/projects')} />
    </div>
  )
}
