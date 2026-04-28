import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import {
  PageHeader, FilterRow, FieldWrap, DataTable, ErrorBox, Btn,
  inputCls, selectCls,
  type Column,
} from '../../components/shared/ui'
import { StatusBadge } from '../../components/shared/StatusBadge'

interface Customer {
  name: string
  customer_name: string
  customer_type: string
  cm_vat_no?: string
  cm_mobile?: string
  cm_email?: string
  disabled: number
}

const COLUMNS: Column<Customer>[] = [
  {
    key: 'customer_name',
    label: 'Name',
    render: (v) => <span className="font-medium text-gray-900">{v as string}</span>,
  },
  { key: 'name', label: 'Code' },
  { key: 'cm_vat_no', label: 'VAT No.' },
  { key: 'cm_mobile', label: 'Mobile' },
  { key: 'cm_email', label: 'Email' },
  { key: 'customer_type', label: 'Type' },
  {
    key: 'disabled',
    label: 'Status',
    render: (v) => <StatusBadge status={v ? 'Inactive' : 'Active'} />,
  },
]

export function CustomerList() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const q = searchParams.get('q') ?? ''
  const typeFilter = searchParams.get('type') ?? ''
  const showDisabled = searchParams.get('disabled') === '1'

  const [rows, setRows] = useState<Customer[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const filters: Array<[string, string, string, unknown]> = []
      if (q) filters.push(['customer_name', 'like', `%${q}%`, ''])
      if (typeFilter) filters.push(['customer_type', '=', typeFilter, ''])
      if (!showDisabled) filters.push(['disabled', '=', 0, ''])

      const data = await frappe.getList<Customer>('Customer', {
        fields: ['name', 'customer_name', 'customer_type', 'cm_vat_no', 'cm_mobile', 'cm_email', 'disabled'],
        filters: filters.length ? filters : undefined,
        limit: 100,
        order_by: 'customer_name asc',
      })
      setRows(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load customers')
    } finally {
      setLoading(false)
    }
  }, [q, typeFilter, showDisabled])

  useEffect(() => { void load() }, [load])

  const update = (key: string, value: string) => {
    const p = new URLSearchParams(searchParams)
    if (value) p.set(key, value)
    else p.delete(key)
    setSearchParams(p)
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Customers" subtitle={`${rows.length} results`} />

      <FilterRow>
        <FieldWrap label="Search">
          <input
            className={inputCls + ' w-64'}
            value={q}
            onChange={(e) => update('q', e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void load()}
            placeholder="Name, code, VAT, mobile…"
          />
        </FieldWrap>
        <FieldWrap label="Type">
          <select className={selectCls + ' w-40'} value={typeFilter} onChange={(e) => update('type', e.target.value)}>
            <option value="">All types</option>
            <option value="Company">Company</option>
            <option value="Individual">Individual</option>
          </select>
        </FieldWrap>
        <div className="flex items-end">
          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showDisabled}
              onChange={(e) => update('disabled', e.target.checked ? '1' : '')}
              className="accent-cm-green"
            />
            Include inactive
          </label>
        </div>
        <div className="flex items-end">
          <Btn onClick={() => void load()} disabled={loading}>
            {loading ? 'Searching…' : 'Search'}
          </Btn>
        </div>
      </FilterRow>

      {error && <ErrorBox message={error} />}

      <DataTable
        columns={COLUMNS}
        rows={rows}
        loading={loading}
        emptyMessage="No customers match your search."
        onRowClick={(row) => navigate(`/customers/${encodeURIComponent(row.name)}`)}
      />
    </div>
  )
}
