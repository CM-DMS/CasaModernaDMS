import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import {
  PageHeader, BackLink, DetailSection, DetailGrid, DetailField,
  DataTable, ErrorBox, type Column,
} from '../../components/shared/ui'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { fmtDate, fmtMoney } from '../../utils/fmt'

interface DeliveryNoteDoc {
  name: string
  customer?: string
  customer_name?: string
  posting_date?: string
  status?: string
  docstatus?: number
  lr_no?: string
  lr_date?: string
  vehicle_no?: string
  cm_sales_person?: string
  total?: number
  total_taxes_and_charges?: number
  grand_total?: number
  terms?: string
  cm_notes?: string
  items?: DeliveryNoteItem[]
}

interface DeliveryNoteItem {
  name: string
  item_code: string
  item_name?: string
  qty: number
  uom?: string
  rate: number
  amount: number
  against_sales_order?: string
  against_sales_invoice?: string
  batch_no?: string
}

const itemColumns: Column<DeliveryNoteItem>[] = [
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
    key: 'against_sales_order',
    label: 'SO',
    render: (v) =>
      v ? (
        <Link to={`/sales/orders/${encodeURIComponent(v as string)}`} className="font-mono text-[11px] text-cm-green hover:underline">
          {v as string}
        </Link>
      ) : null,
  },
]

export function DeliveryNoteDetail() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const [doc, setDoc] = useState<DeliveryNoteDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!name) return
    setLoading(true)
    frappe.getDoc<DeliveryNoteDoc>('Delivery Note', name)
      .then(setDoc)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load delivery note'))
      .finally(() => setLoading(false))
  }, [name])

  if (loading) return <div className="py-12 text-center text-gray-400">Loading…</div>
  if (error) return <ErrorBox message={error} />
  if (!doc) return <ErrorBox message="Delivery Note not found." />

  return (
    <div className="space-y-4">
      <BackLink label="Delivery Notes" onClick={() => navigate('/sales/delivery-notes')} />

      <PageHeader
        title={doc.name}
        subtitle={doc.customer_name}
        actions={<StatusBadge status={doc.status} docstatus={doc.docstatus} />}
      />

      <DetailSection title="Details">
        <DetailGrid>
          <DetailField label="Customer" value={
            doc.customer ? (
              <Link to={`/customers/${encodeURIComponent(doc.customer)}`} className="text-cm-green hover:underline">
                {doc.customer_name || doc.customer}
              </Link>
            ) : '—'
          } />
          <DetailField label="Date" value={fmtDate(doc.posting_date)} />
          <DetailField label="Salesperson" value={doc.cm_sales_person} />
          <DetailField label="Driver / Ref." value={doc.lr_no} />
          <DetailField label="Driver Date" value={fmtDate(doc.lr_date)} />
          <DetailField label="Vehicle No." value={doc.vehicle_no} />
        </DetailGrid>
      </DetailSection>

      <DetailSection title="Line Items">
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

      {(doc.terms || doc.cm_notes) && (
        <DetailSection title="Notes & Terms">
          {doc.cm_notes && <p className="text-sm text-gray-700 mb-2 whitespace-pre-wrap">{doc.cm_notes}</p>}
          {doc.terms && <p className="text-sm text-gray-500 whitespace-pre-wrap">{doc.terms}</p>}
        </DetailSection>
      )}
    </div>
  )
}
