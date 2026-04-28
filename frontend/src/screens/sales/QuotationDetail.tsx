import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import {
  PageHeader, BackLink, DetailSection, DetailGrid, DetailField,
  DataTable, ErrorBox, type Column,
} from '../../components/shared/ui'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { fmtDate, fmtMoney, fmtDiscount } from '../../utils/fmt'

interface QuotationDoc {
  name: string
  customer_name?: string
  party_name?: string
  title?: string
  transaction_date?: string
  valid_till?: string
  status?: string
  docstatus?: number
  cm_sales_person?: string
  total?: number
  total_taxes_and_charges?: number
  grand_total?: number
  discount_amount?: number
  terms?: string
  cm_notes?: string
  items?: QuotationItem[]
}

interface QuotationItem {
  name: string
  item_code: string
  item_name?: string
  qty: number
  stock_uom?: string
  uom?: string
  rate: number
  discount_percentage?: number
  amount: number
  description?: string
}

const itemColumns: Column<QuotationItem>[] = [
  { key: 'item_code', label: 'Item' },
  {
    key: 'item_name',
    label: 'Description',
    render: (v) => <span className="text-gray-600 text-[12px]">{v as string}</span>,
  },
  { key: 'qty', label: 'Qty', align: 'right' },
  { key: 'uom', label: 'UOM' },
  { key: 'rate', label: 'Unit Price', align: 'right', render: (v) => fmtMoney(v as number) },
  {
    key: 'discount_percentage',
    label: 'Disc%',
    align: 'right',
    render: (v) => fmtDiscount(v as number),
  },
  { key: 'amount', label: 'Total', align: 'right', render: (v) => fmtMoney(v as number) },
]

export function QuotationDetail() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const [doc, setDoc] = useState<QuotationDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!name) return
    setLoading(true)
    frappe.getDoc<QuotationDoc>('Quotation', name)
      .then(setDoc)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load quotation'))
      .finally(() => setLoading(false))
  }, [name])

  if (loading) return <div className="py-12 text-center text-gray-400">Loading…</div>
  if (error) return <ErrorBox message={error} />
  if (!doc) return <ErrorBox message="Quotation not found." />

  const customer = doc.customer_name || doc.party_name

  return (
    <div className="space-y-4">
      <BackLink label="Quotations" onClick={() => navigate('/sales/quotations')} />

      <PageHeader
        title={doc.name}
        subtitle={doc.title || customer}
        actions={<StatusBadge status={doc.status} docstatus={doc.docstatus} />}
      />

      <DetailSection title="Details">
        <DetailGrid>
          <DetailField label="Customer" value={
            customer ? (
              <Link to={`/customers/${encodeURIComponent(customer)}`} className="text-cm-green hover:underline">
                {customer}
              </Link>
            ) : '—'
          } />
          <DetailField label="Date" value={fmtDate(doc.transaction_date)} />
          <DetailField label="Valid Till" value={fmtDate(doc.valid_till)} />
          <DetailField label="Salesperson" value={doc.cm_sales_person} />
        </DetailGrid>
      </DetailSection>

      <DetailSection title="Line Items">
        <DataTable
          columns={itemColumns}
          rows={doc.items ?? []}
          emptyMessage="No items."
        />
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
