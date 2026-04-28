import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import { PageHeader, DataTable, ErrorBox, type Column } from '../../components/shared/ui'
import { fmtDate, fmtMoney } from '../../utils/fmt'
import { usePermissions } from '../../auth/PermissionsProvider'

interface PendingSO {
  name: string
  customer_name?: string
  transaction_date?: string
  grand_total?: number
  cm_sales_person?: string
}

export function PendingSalesOrders() {
  const navigate = useNavigate()
  const { can } = usePermissions()
  const [rows, setRows] = useState<PendingSO[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await frappe.getList<PendingSO>('Sales Order', {
        fields: ['name', 'customer_name', 'transaction_date', 'grand_total', 'cm_sales_person'],
        filters: [
          ['docstatus', '=', 1],
          ['workflow_state', '=', 'Pending'],
        ] as any,
        order_by: 'transaction_date asc',
        limit: 200,
      })
      setRows(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pending orders')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const handleConfirm = useCallback(async (e: React.MouseEvent, soName: string) => {
    e.stopPropagation()
    if (!window.confirm(`Confirm sales order ${soName}?`)) return
    setConfirming(soName)
    setError('')
    try {
      await frappe.call('casamoderna_dms.sales_order_confirm.confirm_pending_so', { sales_order: soName })
      setRows((prev) => prev.filter((r) => r.name !== soName))
    } catch (err: any) {
      setError(err.message || 'Failed to confirm order')
    } finally {
      setConfirming(null)
    }
  }, [])

  if (!can('canConfirmSO') && !can('canAdmin')) {
    return (
      <div className="space-y-4">
        <PageHeader title="Pending Sales Orders" />
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          You do not have permission to view or confirm pending sales orders.
        </div>
      </div>
    )
  }

  const totalValue = rows.reduce((s, r) => s + (r.grand_total ?? 0), 0)

  const COLUMNS: Column<PendingSO>[] = [
    { key: 'transaction_date', label: 'Date', render: (v) => fmtDate(v as string) },
    {
      key: 'name',
      label: 'Order #',
      render: (v) => <span className="font-mono text-[12px] font-medium text-cm-green">{v as string}</span>,
    },
    {
      key: 'customer_name',
      label: 'Customer',
      render: (v) => <span className="font-medium">{v as string}</span>,
    },
    {
      key: 'cm_sales_person',
      label: 'Salesperson',
      render: (v) => <span className="text-gray-500 text-[12px]">{(v as string) || '—'}</span>,
    },
    {
      key: 'grand_total',
      label: 'Total',
      align: 'right',
      render: (v) => <span className="tabular-nums font-medium">{fmtMoney(v as number)}</span>,
    },
    {
      key: 'name',
      label: '',
      render: (_v, row) => (
        <button
          onClick={(e) => void handleConfirm(e, row.name)}
          disabled={confirming === row.name}
          className="px-3 py-1 rounded text-xs font-semibold bg-cm-green text-white hover:bg-cm-green/90 disabled:opacity-50 transition-colors"
        >
          {confirming === row.name ? 'Confirming…' : 'Confirm ✓'}
        </button>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pending Sales Orders"
        subtitle={`${rows.length} order${rows.length !== 1 ? 's' : ''} awaiting confirmation`}
      />

      {error && <ErrorBox message={error} />}

      {rows.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs text-amber-700 font-medium uppercase tracking-wide">Pending Orders</p>
            <p className="mt-1 text-2xl font-bold text-amber-800">{rows.length}</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs text-amber-700 font-medium uppercase tracking-wide">Total Value</p>
            <p className="mt-1 text-2xl font-bold text-amber-800">{fmtMoney(totalValue)}</p>
          </div>
        </div>
      )}

      <DataTable
        columns={COLUMNS}
        rows={rows}
        loading={loading}
        emptyMessage="No pending sales orders."
        onRowClick={(row) => navigate(`/sales/orders/${encodeURIComponent(row.name)}`)}
      />
    </div>
  )
}
