import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader, FilterRow, DataTable, ErrorBox, inputCls, type Column } from '../../components/shared/ui'
import { frappe } from '../../api/frappe'

interface UserRow {
  name: string
  full_name: string
  email: string
  enabled: number
  last_login: string
}

function EnabledBadge({ enabled }: { enabled: number }) {
  return enabled ? (
    <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-800">Enabled</span>
  ) : (
    <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700">Disabled</span>
  )
}

const COLUMNS: Column<UserRow>[] = [
  {
    key: 'email',
    label: 'Email / Username',
    render: (v) => <span className="font-medium">{String(v) || '—'}</span>,
  },
  { key: 'full_name', label: 'Full Name' },
  {
    key: 'enabled',
    label: 'Status',
    render: (v) => <EnabledBadge enabled={Number(v)} />,
  },
  {
    key: 'last_login',
    label: 'Last Login',
    render: (v) => v ? String(v).slice(0, 16).replace('T', ' ') : '—',
  },
]

export function UserList() {
  const navigate = useNavigate()
  const [q, setQ]               = useState('')
  const [rows, setRows]         = useState<UserRow[]>([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const runSearch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const filters: unknown[] = [
        ['name', '!=', 'Guest'],
        ['name', '!=', 'Administrator'],
      ]
      if (q.trim()) filters.push(['name', 'like', `%${q.trim()}%`])
      const data = await frappe.getList<UserRow>('User', {
        fields: ['name', 'full_name', 'email', 'enabled', 'last_login'],
        filters: filters as [string, string, string][],
        limit: 200,
        order_by: 'full_name asc',
      })
      setRows(Array.isArray(data) ? data : [])
    } catch (err: unknown) {
      setError((err as Error).message || 'Search failed')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [q])

  useEffect(() => { runSearch() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <PageHeader title="Users & Roles" subtitle="Manage user accounts and ERPNext role assignments" />

      <FilterRow>
        <input
          className={inputCls + ' w-64'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && runSearch()}
          placeholder="Email or name…"
        />
        <button onClick={runSearch} disabled={loading} className="px-3 py-1.5 rounded text-xs font-semibold bg-cm-green text-white hover:bg-cm-green-dark disabled:opacity-50">
          {loading ? 'Searching…' : 'Search'}
        </button>
      </FilterRow>

      {error && <ErrorBox message={error} />}

      <DataTable
        columns={COLUMNS}
        rows={rows}
        loading={loading}
        emptyMessage="No users found."
        keyField="name"
        onRowClick={(row) => navigate('/admin/users/' + encodeURIComponent(row.name))}
      />
    </div>
  )
}
