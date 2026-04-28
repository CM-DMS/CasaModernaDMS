import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import {
  PageHeader, BackLink, DetailSection, DetailGrid, DetailField,
  DataTable, ErrorBox, type Column,
} from '../../components/shared/ui'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { fmtDate, fmtMoney } from '../../utils/fmt'

interface CustomerDoc {
  name: string
  customer_name: string
  customer_type: string
  customer_group?: string
  territory?: string
  disabled: number
  cm_vat_no?: string
  cm_mobile?: string
  cm_phone?: string
  cm_email?: string
  cm_id_card?: string
  cm_locality?: string
  website?: string
  default_currency?: string
  default_price_list?: string
  credit_limit?: number
  payment_terms?: string
  cm_sales_person?: string
  cm_notes?: string
  modified?: string
}

interface SalesDoc {
  name: string
  transaction_date?: string
  posting_date?: string
  grand_total?: number
  status?: string
  docstatus?: number
}

const soColumns: Column<SalesDoc>[] = [
  {
    key: 'name',
    label: 'Reference',
    render: (v, row) => (
      <Link to={`/sales/orders/${encodeURIComponent(row.name)}`} className="font-mono text-[12px] text-cm-green hover:underline">
        {row.name}
      </Link>
    ),
  },
  { key: 'transaction_date', label: 'Date', render: (v) => fmtDate(v as string) },
  { key: 'grand_total', label: 'Total', align: 'right', render: (v) => fmtMoney(v as number) },
  { key: 'status', label: 'Status', render: (v, row) => <StatusBadge status={v as string} docstatus={row.docstatus} /> },
]

const siColumns: Column<SalesDoc>[] = [
  {
    key: 'name',
    label: 'Reference',
    render: (v, row) => (
      <Link to={`/sales/invoices/${encodeURIComponent(row.name)}`} className="font-mono text-[12px] text-cm-green hover:underline">
        {row.name}
      </Link>
    ),
  },
  { key: 'posting_date', label: 'Date', render: (v) => fmtDate(v as string) },
  { key: 'grand_total', label: 'Total', align: 'right', render: (v) => fmtMoney(v as number) },
  { key: 'status', label: 'Status', render: (v, row) => <StatusBadge status={v as string} docstatus={row.docstatus} /> },
]

export function CustomerProfile() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()

  const [doc, setDoc] = useState<CustomerDoc | null>(null)
  const [salesOrders, setSalesOrders] = useState<SalesDoc[]>([])
  const [invoices, setInvoices] = useState<SalesDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!name) return
    setLoading(true)
    setError('')

    Promise.all([
      frappe.getDoc<CustomerDoc>('Customer', name),
      frappe.getList<SalesDoc>('Sales Order', {
        fields: ['name', 'transaction_date', 'grand_total', 'status', 'docstatus'],
        filters: [['customer', '=', name, '']],
        limit: 20,
        order_by: 'transaction_date desc',
      }).catch(() => []),
      frappe.getList<SalesDoc>('Sales Invoice', {
        fields: ['name', 'posting_date', 'grand_total', 'status', 'docstatus'],
        filters: [['customer', '=', name, '']],
        limit: 20,
        order_by: 'posting_date desc',
      }).catch(() => []),
    ])
      .then(([d, so, si]) => {
        setDoc(d)
        setSalesOrders(so)
        setInvoices(si)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load customer'))
      .finally(() => setLoading(false))
  }, [name])

  if (loading) return <div className="py-12 text-center text-gray-400">Loading…</div>
  if (error) return <ErrorBox message={error} />
  if (!doc) return <ErrorBox message="Customer not found." />

  return (
    <div className="space-y-4">
      <BackLink label="Customers" onClick={() => navigate('/customers')} />

      <PageHeader
        title={doc.customer_name}
        subtitle={doc.name}
        actions={
          <StatusBadge status={doc.disabled ? 'Inactive' : 'Active'} docstatus={undefined} />
        }
      />

      <DetailSection title="Details">
        <DetailGrid>
          <DetailField label="Customer Code" value={doc.name} />
          <DetailField label="Customer Type" value={doc.customer_type} />
          <DetailField label="Customer Group" value={doc.customer_group} />
          <DetailField label="Territory" value={doc.territory} />
          <DetailField label="VAT No." value={doc.cm_vat_no} />
          <DetailField label="ID Card" value={doc.cm_id_card} />
          <DetailField label="Locality" value={doc.cm_locality} />
          <DetailField label="Price List" value={doc.default_price_list} />
          <DetailField label="Payment Terms" value={doc.payment_terms} />
          <DetailField label="Credit Limit" value={doc.credit_limit ? fmtMoney(doc.credit_limit) : '—'} />
        </DetailGrid>
      </DetailSection>

      <DetailSection title="Contact">
        <DetailGrid>
          <DetailField label="Mobile" value={doc.cm_mobile} />
          <DetailField label="Phone" value={doc.cm_phone} />
          <DetailField label="Email" value={doc.cm_email} />
          <DetailField label="Salesperson" value={doc.cm_sales_person} />
          <DetailField label="Website" value={doc.website} />
        </DetailGrid>
        {doc.cm_notes && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-1">Notes</div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{doc.cm_notes}</p>
          </div>
        )}
      </DetailSection>

      <DetailSection title={`Sales Orders (last 20)`}>
        <DataTable
          columns={soColumns}
          rows={salesOrders}
          emptyMessage="No sales orders for this customer."
          onRowClick={(row) => navigate(`/sales/orders/${encodeURIComponent(row.name)}`)}
        />
      </DetailSection>

      <DetailSection title={`Sales Invoices (last 20)`}>
        <DataTable
          columns={siColumns}
          rows={invoices}
          emptyMessage="No invoices for this customer."
          onRowClick={(row) => navigate(`/sales/invoices/${encodeURIComponent(row.name)}`)}
        />
      </DetailSection>
    </div>
  )
}
