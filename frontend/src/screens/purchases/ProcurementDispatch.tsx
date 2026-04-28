/**
 * ProcurementDispatch — board view of open Sales Order lines awaiting sourcing.
 *
 * Lane 'order'  — item not in stock; a Purchase Order needs to be raised.
 * Lane 'stock'  — item has stock; allocate from existing inventory.
 *
 * Urgency is computed server-side from delivery_date − lead_time_days.
 * Route: /purchases/procurement-dispatch
 */
import { useState, useEffect, useCallback } from 'react'
import {
  PageHeader, FilterRow, DataTable, ErrorBox, Btn, FieldWrap,
  inputCls, type Column,
} from '../../components/shared/ui'
import {
  procurementDispatchApi,
  type DispatchItem,
  type CreatePoResult,
  type AllocateResult,
} from '../../api/procurementDispatch'

// ─── Urgency ─────────────────────────────────────────────────────────────────

const URGENCY_CLS: Record<string, string> = {
  overdue: 'text-red-600 font-semibold',
  urgent:  'text-amber-700 font-semibold',
  ok:      'text-gray-700',
}

function DaysToOrder({ value, urgency }: { value: number | null; urgency: DispatchItem['urgency'] }) {
  const cls = URGENCY_CLS[urgency] ?? URGENCY_CLS.ok
  let label: string
  if (value === null || value === undefined) {
    label = '—'
  } else if (value < 0) {
    label = `${Math.abs(value)}d overdue`
  } else if (value === 0) {
    label = 'Today'
  } else {
    label = `${value}d`
  }
  return <span className={cls}>{label}</span>
}

// ─── Lane filter ──────────────────────────────────────────────────────────────

const LANE_FILTERS = [
  { key: 'all',   label: 'All' },
  { key: 'order', label: 'To order' },
  { key: 'stock', label: 'Allocate from stock' },
] as const
type LaneFilter = (typeof LANE_FILTERS)[number]['key']

// ─── Modals ───────────────────────────────────────────────────────────────────

function Overlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

function OrderModal({
  row,
  onClose,
  onSuccess,
}: {
  row: DispatchItem
  onClose: () => void
  onSuccess: (result: CreatePoResult) => void
}) {
  const [supplier, setSupplier] = useState(row.supplier_name ?? '')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const handleSubmit = async () => {
    setSaving(true)
    setError(null)
    try {
      const result = await procurementDispatchApi.createPo(row.so_item_name, supplier)
      onSuccess(result)
    } catch (err) {
      setError((err as Error).message || 'Failed to create Purchase Order')
      setSaving(false)
    }
  }

  return (
    <Overlay onClose={onClose}>
      <h3 className="text-base font-semibold text-gray-800">Create Purchase Order</h3>
      <div className="space-y-1 text-sm text-gray-600">
        <div><span className="font-medium">Item:</span> {row.item_name || row.item_code}</div>
        <div><span className="font-medium">Qty:</span> {row.qty} {row.uom}</div>
        <div><span className="font-medium">Sales Order:</span> {row.sales_order}</div>
      </div>
      <FieldWrap label="Supplier *">
        <input
          className={inputCls}
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
          placeholder="Enter supplier name"
          disabled={saving}
        />
      </FieldWrap>
      {error && <ErrorBox message={error} />}
      <div className="flex justify-end gap-2 pt-1">
        <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancel</Btn>
        <Btn onClick={handleSubmit} disabled={saving || !supplier.trim()}>
          {saving ? 'Creating…' : 'Create PO'}
        </Btn>
      </div>
    </Overlay>
  )
}

function OrderSuccessModal({
  poName,
  poUrl,
  onClose,
}: {
  poName: string
  poUrl: string
  onClose: () => void
}) {
  return (
    <Overlay onClose={onClose}>
      <h3 className="text-base font-semibold text-gray-800">Purchase Order created</h3>
      <p className="text-sm text-gray-600">
        Draft PO <span className="font-mono font-medium">{poName}</span> has been created.
      </p>
      <div className="flex justify-end gap-2 pt-1">
        <Btn variant="ghost" onClick={onClose}>Close</Btn>
        <Btn
          onClick={() => {
            window.open(poUrl, '_blank', 'noopener,noreferrer')
            onClose()
          }}
        >
          Open PO
        </Btn>
      </div>
    </Overlay>
  )
}

function AllocateModal({
  row,
  onClose,
  onSuccess,
}: {
  row: DispatchItem
  onClose: () => void
  onSuccess: (result: AllocateResult) => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const handleSubmit = async () => {
    setSaving(true)
    setError(null)
    try {
      const result = await procurementDispatchApi.allocate(row.so_item_name)
      onSuccess(result)
    } catch (err) {
      setError((err as Error).message || 'Failed to allocate stock')
      setSaving(false)
    }
  }

  return (
    <Overlay onClose={onClose}>
      <h3 className="text-base font-semibold text-gray-800">Allocate from stock</h3>
      <div className="space-y-1 text-sm text-gray-600">
        <div><span className="font-medium">Item:</span> {row.item_name || row.item_code}</div>
        <div><span className="font-medium">Qty:</span> {row.qty} {row.uom}</div>
        <div><span className="font-medium">Sales Order:</span> {row.sales_order}</div>
      </div>
      <p className="text-sm text-gray-500">
        A Stock Reservation Entry will be created and submitted against the best-stocked warehouse.
      </p>
      {error && <ErrorBox message={error} />}
      <div className="flex justify-end gap-2 pt-1">
        <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancel</Btn>
        <Btn onClick={handleSubmit} disabled={saving}>
          {saving ? 'Allocating…' : 'Confirm allocation'}
        </Btn>
      </div>
    </Overlay>
  )
}

function AllocateSuccessModal({
  sreName,
  warehouse,
  onClose,
}: {
  sreName: string
  warehouse: string
  onClose: () => void
}) {
  return (
    <Overlay onClose={onClose}>
      <h3 className="text-base font-semibold text-gray-800">Stock reserved</h3>
      <p className="text-sm text-gray-600">
        Stock Reservation <span className="font-mono font-medium">{sreName}</span> created
        from <span className="font-medium">{warehouse}</span>.
      </p>
      <div className="flex justify-end gap-2 pt-1">
        <Btn variant="ghost" onClick={onClose}>Close</Btn>
      </div>
    </Overlay>
  )
}

// ─── Modal state union ────────────────────────────────────────────────────────

type ModalState =
  | { type: 'order'; row: DispatchItem }
  | { type: 'allocate'; row: DispatchItem }
  | { type: 'orderSuccess'; poName: string; poUrl: string }
  | { type: 'allocateSuccess'; sreName: string; warehouse: string }
  | null

// ─── Main screen ──────────────────────────────────────────────────────────────

export function ProcurementDispatch() {
  const [rows,    setRows]    = useState<DispatchItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [filter,  setFilter]  = useState<LaneFilter>('all')
  const [modal,   setModal]   = useState<ModalState>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await procurementDispatchApi.list()
      // Overdue rows first, then ascending by delivery_date.
      data.sort((a, b) => {
        if (a.urgency === 'overdue' && b.urgency !== 'overdue') return -1
        if (b.urgency === 'overdue' && a.urgency !== 'overdue') return 1
        return (a.delivery_date ?? '').localeCompare(b.delivery_date ?? '')
      })
      setRows(data)
    } catch (err) {
      setError((err as Error).message || 'Failed to load procurement data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const visible = filter === 'all' ? rows : rows.filter((r) => r.lane === filter)

  const handleOrderSuccess = (result: CreatePoResult) => {
    setModal({ type: 'orderSuccess', poName: result.po_name, poUrl: result.po_url })
    load()
  }

  const handleAllocateSuccess = (result: AllocateResult) => {
    setModal({ type: 'allocateSuccess', sreName: result.sre_name, warehouse: result.warehouse })
    load()
  }

  const columns: Column<DispatchItem>[] = [
    {
      key: 'delivery_date',
      label: 'Delivery month',
      render: (v) =>
        v
          ? new Date(v as string).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
          : '—',
    },
    { key: 'sales_order',   label: 'Sales Order' },
    { key: 'item_code',     label: 'Item code'   },
    { key: 'item_name',     label: 'Item'        },
    {
      key: 'qty',
      label: 'Qty',
      render: (v, r) => `${v} ${r.uom ?? ''}`.trim(),
    },
    {
      key: 'supplier_name',
      label: 'Supplier',
      render: (v) => (v as string) || '—',
    },
    {
      key: 'lead_time_days',
      label: 'Lead time',
      render: (v) => (v !== null && v !== undefined ? `${v}d` : '—'),
    },
    {
      key: 'days_to_order',
      label: 'Order by',
      render: (v, r) => (
        <DaysToOrder value={v as number | null} urgency={r.urgency} />
      ),
    },
    {
      key: 'lane',
      label: '',
      render: (_, row) =>
        row.lane === 'stock' ? (
          <Btn variant="secondary" onClick={() => setModal({ type: 'allocate', row })}>
            Allocate from stock
          </Btn>
        ) : (
          <Btn onClick={() => setModal({ type: 'order', row })}>
            Order
          </Btn>
        ),
    },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        title="Items to Source"
        actions={
          <Btn variant="secondary" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </Btn>
        }
      />

      <FilterRow>
        {LANE_FILTERS.map((f) => (
          <Btn
            key={f.key}
            variant={filter === f.key ? 'primary' : 'secondary'}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Btn>
        ))}
      </FilterRow>

      {error && <ErrorBox message={error} />}

      <DataTable<DispatchItem>
        columns={columns}
        rows={visible}
        loading={loading}
        emptyMessage="No open Sales Order lines found."
        keyField="so_item_name"
      />

      {modal?.type === 'order' && (
        <OrderModal row={modal.row} onClose={() => setModal(null)} onSuccess={handleOrderSuccess} />
      )}
      {modal?.type === 'orderSuccess' && (
        <OrderSuccessModal poName={modal.poName} poUrl={modal.poUrl} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'allocate' && (
        <AllocateModal row={modal.row} onClose={() => setModal(null)} onSuccess={handleAllocateSuccess} />
      )}
      {modal?.type === 'allocateSuccess' && (
        <AllocateSuccessModal sreName={modal.sreName} warehouse={modal.warehouse} onClose={() => setModal(null)} />
      )}
    </div>
  )
}
