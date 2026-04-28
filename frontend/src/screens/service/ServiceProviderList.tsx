/**
 * ServiceProviderList — browse CM Service Providers.
 *
 * Route: /service/providers
 */
import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import {
  PageHeader, FilterRow, DataTable, Btn, inputCls, selectCls,
  type Column,
} from '../../components/shared/ui'
import { usePermissions } from '../../auth/PermissionsProvider'

interface ProviderRow {
  name: string
  provider_name?: string
  service_type?: string
  mobile?: string
  email?: string
  territory?: string
  vat_number?: string
  active?: number | boolean
  modified?: string
}

const SERVICE_TYPES = ['Installation', 'Repair', 'Maintenance', 'Delivery', 'Other']

function ActiveBadge({ active }: { active?: number | boolean }) {
  return active ? (
    <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-800">Active</span>
  ) : (
    <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-600">Inactive</span>
  )
}

const COLUMNS: Column<ProviderRow>[] = [
  {
    key: 'provider_name',
    label: 'Provider',
    render: (v) => <span className="font-medium">{(v as string) || '—'}</span>,
  },
  {
    key: 'service_type',
    label: 'Service Type',
    render: (v) => <span className="text-sm">{(v as string) || '—'}</span>,
  },
  {
    key: 'mobile',
    label: 'Mobile',
    render: (v) => <span className="text-sm">{(v as string) || '—'}</span>,
  },
  {
    key: 'email',
    label: 'Email',
    render: (v) => <span className="text-sm">{(v as string) || '—'}</span>,
  },
  {
    key: 'territory',
    label: 'Territory',
    render: (v) => <span className="text-sm">{(v as string) || '—'}</span>,
  },
  {
    key: 'active',
    label: 'Status',
    render: (v) => <ActiveBadge active={v as number} />,
  },
]

const LIST_FIELDS = ['name', 'provider_name', 'service_type', 'mobile', 'email', 'territory', 'vat_number', 'address', 'active', 'modified']

export function ServiceProviderList() {
  const navigate = useNavigate()
  const { can }  = usePermissions()

  const [q, setQ]                         = useState('')
  const [serviceType, setServiceType]     = useState('')
  const [rows, setRows]                   = useState<ProviderRow[]>([])
  const [loading, setLoading]             = useState(false)
  const [error, setError]                 = useState('')

  const runSearch = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const filters: [string, string, string][] = []
      if (q)           filters.push(['provider_name', 'like', `%${q}%`])
      if (serviceType) filters.push(['service_type', '=', serviceType])

      const data = await frappe.getList<ProviderRow>('CM Service Provider', {
        fields: LIST_FIELDS,
        filters,
        order_by: 'provider_name asc',
        limit: 200,
      })
      setRows(Array.isArray(data) ? data : [])
    } catch (e: unknown) {
      setError((e as Error).message || 'Search failed')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [q, serviceType])

  useEffect(() => { runSearch() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <PageHeader
        title="Service Providers"
        subtitle="Subcontractors, installers and technicians"
        actions={
          can('canService') ? (
            <Btn onClick={() => navigate('/service/providers/new')}>+ New Provider</Btn>
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
          placeholder="Provider name…"
        />
        <select className={selectCls} value={serviceType} onChange={(e) => setServiceType(e.target.value)}>
          <option value="">All Types</option>
          {SERVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
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
        emptyMessage="No providers found."
        onRowClick={(row) => navigate(`/service/providers/${encodeURIComponent(row.name)}`)}
      />
    </div>
  )
}
