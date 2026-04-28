import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import {
  PageHeader, BackLink, DetailSection, DetailGrid, DetailField,
  DataTable, ErrorBox, type Column,
} from '../../components/shared/ui'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { DocActions } from '../../components/shared/DocActions'
import { usePermissions } from '../../auth/PermissionsProvider'
import { fmtDate, fmtMoney, fmtDiscount } from '../../utils/fmt'
import { CM } from '../../components/ui/CMClassNames'

interface SalesInvoiceDoc {
  name: string
  customer?: string
  customer_name?: string
  posting_date?: string
  due_date?: string
  status?: string
  docstatus?: number
  cm_sales_person?: string
  total?: number
  total_taxes_and_charges?: number
  grand_total?: number
  outstanding_amount?: number
  paid_amount?: number
  payment_terms_template?: string
  terms?: string
  cm_notes?: string
  items?: SalesInvoiceItem[]
}

interface SalesInvoiceItem {
  name: string
  item_code: string
  item_name?: string
  qty: number
  uom?: string
  rate: number
  discount_percentage?: number
  amount: number
  sales_order?: string
}

const itemColumns: Column<SalesInvoiceItem>[] = [
  { key: 'item_code', label: 'Item Code' },
  {
    key: 'item_name',
    label: 'Description',
    render: (v) => <span className="text-gray-600 text-[12px]">{v as string}</span>,
  },
  { key: 'qty', label: 'Qty', align: 'right' },
  { key: 'uom', label: 'UOM' },
  { key: 'rate', label: 'Unit Price', align: 'right', render: (v) => fmtMoney(v as number) },
  { key: 'discount_percentage', label: 'Disc%', align: 'right', render: (v) => fmtDiscount(v as number) },
  { key: 'amount', label: 'Total', align: 'right', render: (v) => fmtMoney(v as number) },
  {
    key: 'sales_order',
    label: 'SO',
    render: (v) =>
      v ? (
        <Link to={`/sales/orders/${encodeURIComponent(v as string)}`} className="font-mono text-[11px] text-cm-green hover:underline">
          {v as string}
        </Link>
      ) : null,
  },
]

export function SalesInvoiceDetail() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const { can } = usePermissions()
  const [doc, setDoc] = useState<SalesInvoiceDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    if (!name) return
    setLoading(true)
    frappe.getDoc<SalesInvoiceDoc>('Sales Invoice', name)
      .then(setDoc)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load invoice'))
      .finally(() => setLoading(false))
  }, [name])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="py-12 text-center text-gray-400">Loading…</div>
  if (error) return <ErrorBox message={error} />
  if (!doc) return <ErrorBox message="Sales Invoice not found." />

  const outstanding = Number(doc.outstanding_amount ?? 0)

  return (
    <div className="space-y-4">
      <BackLink label="Sales Invoices" onClick={() => navigate('/sales/invoices')} />

      <PageHeader
        title={doc.name}
        subtitle={doc.customer_name}
        actions={
          <div className="flex items-center gap-3 flex-wrap">
            <StatusBadge status={doc.status} docstatus={doc.docstatus} />
            {doc.docstatus === 0 && (can('canFinance') || can('canSales')) && (
              <button
                className={CM.btn.secondary}
                onClick={() => navigate(`/sales/invoices/${encodeURIComponent(doc.name)}/edit`)}
              >
                Edit
              </button>
            )}
            <DocActions
              doctype="Sales Invoice"
              name={doc.name}
              docstatus={doc.docstatus ?? 0}
              canSubmit={can('canFinance') || can('canSales')}
              canCancel={can('canAdmin')}
              onComplete={load}
            />
            {doc.docstatus === 1 && outstanding > 0 && (can('canFinance') || can('canSales')) && (
              <button
                className={CM.btn.primary}
                onClick={() =>
                  navigate('/sales/receipts/new', {
                    state: {
                      party: doc.customer,
                      party_name: doc.customer_name,
                      paid_amount: String(outstanding.toFixed(2)),
                      reference_invoice: doc.name,
                      payment_purpose: 'Invoice Settlement',
                    },
                  })
                }
              >
                Receive Payment
              </button>
            )}
          </div>
        }
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
          <DetailField label="Invoice Date" value={fmtDate(doc.posting_date)} />
          <DetailField label="Due Date" value={fmtDate(doc.due_date)} />
          <DetailField label="Salesperson" value={doc.cm_sales_person} />
          <DetailField label="Payment Terms" value={doc.payment_terms_template} />
          <DetailField label="Outstanding" value={
            <span className={outstanding > 0 ? 'text-amber-700 font-semibold' : 'text-green-700'}>
              {fmtMoney(outstanding)}
            </span>
          } />
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
            {outstanding > 0 && (
              <div className="flex justify-between text-amber-700 font-semibold">
                <span>Outstanding</span>
                <span className="tabular-nums">{fmtMoney(outstanding)}</span>
              </div>
            )}
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
