import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import {
  PageHeader, FilterRow, FieldWrap, DataTable, ErrorBox, Btn,
  inputCls, type Column,
} from '../../components/shared/ui'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { DeliveryNoteQtyModal, type DnDoc } from '../../components/sales/DeliveryNoteQtyModal'
import { fmtDate, fmtMoney } from '../../utils/fmt'

interface DeliveryRow {
  name: string
  customer_name?: string
  delivery_date?: string
  status?: string
  docstatus?: number
  per_delivered?: number
  grand_total?: number
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function DeliveryPrep() {
  const navigate = useNavigate()
  const [fromDate, setFromDate] = useState(today)
  const [toDate, setToDate] = useState(() => addDays(today(), 7))
  const [rows, setRows] = useState<DeliveryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeSo, setActiveSo] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await frappe.getList<DeliveryRow>('Sales Order', {
        fields: ['name', 'customer_name', 'delivery_date', 'status', 'docstatus', 'per_delivered', 'grand_total'],
        filters: [
          ['status', 'in', ['To Deliver and Bill', 'To Deliver']],
          ['delivery_date', '>=', fromDate],
          ['delivery_date', '<=', toDate],
        ] as any,
        order_by: 'delivery_date asc',
        limit: 200,
      })
      setRows(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load delivery schedule')
    } finally {
      setLoading(false)
    }
  }, [fromDate, toDate])

  useEffect(() => { void load() }, [load])

  const handleCreated = useCallback((doc: DnDoc) => {
    setActiveSo(null)
    navigate(`/sales/delivery-notes/${encodeURIComponent(doc.name)}/edit`)
  }, [navigate])

  const COLUMNS: Column<DeliveryRow>[] = [
    { key: 'delivery_date', label: 'Delivery Date', render: (v) => fmtDate(v as string) },
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
      key: 'per_delivered',
      label: 'Delivered',
      render: (v) => {
        const pct = Number(v) || 0
        return (
          <div className="flex items-center gap-2">
            <div className="w-24 h-2 rounded-full bg-gray-200 overflow-hidden">
              <div
                className="h-full bg-cm-green transition-all"
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
            <span className="text-[12px] text-gray-600">{pct.toFixed(0)}%</span>
          </div>
        )
      },
    },
    {
      key: 'status',
      label: 'Status',
      render: (v, row) => <StatusBadge status={v as string} docstatus={row.docstatus} />,
    },
    {
      key: 'grand_total',
      label: 'Total',
      align: 'right',
      render: (v) => <span className="tabular-nums">{fmtMoney(v as number)}</span>,
    },
    {
      key: 'name',
      label: '',
      render: (_v, row) => (
        <button
          onClick={(e) => { e.stopPropagation(); setActiveSo(row.name) }}
          className="px-3 py-1 rounded text-xs font-semibold border border-cm-green text-cm-green hover:bg-cm-green hover:text-white transition-colors"
        >
          Create DN →
        </button>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        title="Delivery Preparation"
        subtitle={`${rows.length} order${rows.length !== 1 ? 's' : ''} in range`}
      />

      {error && <ErrorBox message={error} />}

      <FilterRow>
        <FieldWrap label="From">
          <input
            type="date"
            className={inputCls}
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </FieldWrap>
        <FieldWrap label="To">
          <input
            type="date"
            className={inputCls}
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </FieldWrap>
        <div className="flex items-end">
          <Btn onClick={() => void load()} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</Btn>
        </div>
      </FilterRow>

      <DataTable
        columns={COLUMNS}
        rows={rows}
        loading={loading}
        emptyMessage="No deliveries due in this date range."
        onRowClick={(row) => navigate(`/sales/orders/${encodeURIComponent(row.name)}`)}
      />

      {activeSo && (
        <DeliveryNoteQtyModal
          soName={activeSo}
          onClose={() => setActiveSo(null)}
          onCreated={handleCreated}
        />
      )}
    </div>
  )
}
