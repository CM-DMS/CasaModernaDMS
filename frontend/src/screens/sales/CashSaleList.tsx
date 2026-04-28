import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import {
  PageHeader, FilterRow, FieldWrap, DataTable, ErrorBox, Btn,
  inputCls, type Column,
} from '../../components/shared/ui'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { fmtDate, fmtMoney } from '../../utils/fmt'
import { usePermissions } from '../../auth/PermissionsProvider'

interface CashSale {
  name: string
  customer_name?: string
  posting_date?: string
  grand_total?: number
  status?: string
  docstatus?: number
}

export function CashSaleList() {
  const navigate = useNavigate()
  const { can } = usePermissions()
  const [rows, setRows] = useState<CashSale[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const filters: any[] = [['is_pos', '=', 1]]
      if (q) filters.push(['customer_name', 'like', `%${q}%`])
      const data = await frappe.getList<CashSale>('Sales Invoice', {
        fields: ['name', 'customer_name', 'posting_date', 'grand_total', 'status', 'docstatus'],
        filters,
        order_by: 'posting_date desc',
        limit: 100,
      })
      setRows(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load cash sales')
    } finally {
      setLoading(false)
    }
  }, [q])

  useEffect(() => { void load() }, [load])

  const COLUMNS: Column<CashSale>[] = [
    {
      key: 'name',
      label: 'Reference',
      render: (v) => <span className="font-mono text-[12px] font-medium text-cm-green">{v as string}</span>,
    },
    {
      key: 'customer_name',
      label: 'Customer',
      render: (v) => <span className="font-medium">{v as string}</span>,
    },
    { key: 'posting_date', label: 'Date', render: (v) => fmtDate(v as string) },
    {
      key: 'grand_total',
      label: 'Total',
      align: 'right',
      render: (v) => <span className="tabular-nums font-medium">{fmtMoney(v as number)}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (v, row) => <StatusBadge status={v as string} docstatus={row.docstatus} />,
    },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        title="Cash Sales"
        subtitle={`${rows.length} results`}
        actions={
          can('canSales') ? (
            <button
              onClick={() => navigate('/sales/cash-sales/new')}
              className="px-4 py-1.5 rounded text-sm font-semibold bg-cm-green text-white hover:bg-cm-green/90 transition-colors"
            >
              + New Cash Sale
            </button>
          ) : undefined
        }
      />

      {error && <ErrorBox message={error} />}

      <FilterRow>
        <FieldWrap label="Search">
          <input
            className={inputCls + ' w-56'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void load()}
            placeholder="Customer name…"
          />
        </FieldWrap>
        <div className="flex items-end">
          <Btn onClick={() => void load()} disabled={loading}>{loading ? 'Searching…' : 'Search'}</Btn>
        </div>
      </FilterRow>

      <DataTable
        columns={COLUMNS}
        rows={rows}
        loading={loading}
        emptyMessage="No cash sales found."
        onRowClick={(row) => navigate(`/sales/cash-sales/${encodeURIComponent(row.name)}`)}
      />
    </div>
  )
}
