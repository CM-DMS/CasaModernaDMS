import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import {
  PageHeader, BackLink, DetailSection, DetailGrid, DetailField,
  DataTable, ErrorBox, type Column,
} from '../../components/shared/ui'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { fmtDate, fmtMoney } from '../../utils/fmt'

interface GRNDoc {
  name: string
  supplier?: string
  supplier_name?: string
  posting_date?: string
  status?: string
  docstatus?: number
  per_billed?: number
  total_qty?: number
  total?: number
  total_taxes_and_charges?: number
  grand_total?: number
  terms?: string
  items?: GRNItem[]
}

interface GRNItem {
  name: string
  item_code: string
  item_name?: string
  qty: number
  uom?: string
  rate: number
  amount: number
  purchase_order?: string
  batch_no?: string
  warehouse?: string
}

const itemColumns: Column<GRNItem>[] = [
  { key: 'item_code', label: 'Item Code' },
  {
    key: 'item_name',
    label: 'Description',
    render: (v) => <span className="text-gray-600 text-[12px]">{v as string}</span>,
  },
  { key: 'qty', label: 'Qty', align: 'right' },
  { key: 'uom', label: 'UOM' },
  { key: 'rate', label: 'Unit Price', align: 'right', render: (v) => fmtMoney(v as number) },
  { key: 'amount', label: 'Total', align: 'right', render: (v) => fmtMoney(v as number) },
  {
    key: 'purchase_order',
    label: 'PO',
    render: (v) =>
      v ? (
        <Link to={`/purchases/orders/${encodeURIComponent(v as string)}`}
          className="font-mono text-[11px] text-cm-green hover:underline">
          {v as string}
        </Link>
      ) : null,
  },
  { key: 'warehouse', label: 'Warehouse' },
  {
    key: 'batch_no',
    label: 'Batch',
    render: (v) => v ? <span className="font-mono text-[11px] text-gray-500">{v as string}</span> : null,
  },
]

export function GRNDetail() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const [doc, setDoc] = useState<GRNDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!name) return
    setLoading(true)
    frappe.getDoc<GRNDoc>('Purchase Receipt', name)
      .then(setDoc)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load GRN'))
      .finally(() => setLoading(false))
  }, [name])

  if (loading) return <div className="py-12 text-center text-gray-400">Loading…</div>
  if (error) return <ErrorBox message={error} />
  if (!doc) return <ErrorBox message="GRN not found." />

  return (
    <div className="space-y-4">
      <BackLink label="Purchase Receipts" onClick={() => navigate('/purchases/grn')} />

      <PageHeader
        title={doc.name}
        subtitle={doc.supplier_name || doc.supplier}
        actions={<StatusBadge status={doc.status} docstatus={doc.docstatus} />}
      />

      <DetailSection title="Details">
        <DetailGrid>
          <DetailField label="Supplier" value={
            doc.supplier ? (
              <Link to={`/suppliers/${encodeURIComponent(doc.supplier)}`} className="text-cm-green hover:underline">
                {doc.supplier_name || doc.supplier}
              </Link>
            ) : '—'
          } />
          <DetailField label="Date" value={fmtDate(doc.posting_date)} />
          <DetailField label="Billed %" value={doc.per_billed != null ? `${Number(doc.per_billed).toFixed(0)}%` : '—'} />
          <DetailField label="Total Qty" value={doc.total_qty != null ? Number(doc.total_qty).toFixed(2) : '—'} />
        </DetailGrid>
      </DetailSection>

      <DetailSection title="Items Received">
        <DataTable columns={itemColumns} rows={doc.items ?? []} emptyMessage="No items." />
        <div className="mt-3 flex justify-end">
          <div className="w-64 space-y-1 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Net Total</span>
              <span className="tabular-nums">{fmtMoney(doc.total)}</span>
            </div>
            {(doc.total_taxes_and_charges ?? 0) !== 0 && (
              <div className="flex justify-between text-gray-600">
                <span>VAT</span>
                <span className="tabular-nums">{fmtMoney(doc.total_taxes_and_charges)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold border-t border-gray-200 pt-1">
              <span>Grand Total</span>
              <span className="tabular-nums">{fmtMoney(doc.grand_total)}</span>
            </div>
          </div>
        </div>
      </DetailSection>

      {doc.terms && (
        <DetailSection title="Notes & Terms">
          <p className="text-sm text-gray-500 whitespace-pre-wrap">{doc.terms}</p>
        </DetailSection>
      )}
    </div>
  )
}
