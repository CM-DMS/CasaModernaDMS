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
import { fmtDate, fmtMoney } from '../../utils/fmt'

interface PODoc {
  name: string
  supplier?: string
  supplier_name?: string
  transaction_date?: string
  schedule_date?: string
  status?: string
  docstatus?: number
  currency?: string
  cm_po_stage?: string
  per_received?: number
  per_billed?: number
  total?: number
  total_taxes_and_charges?: number
  grand_total?: number
  terms?: string
  cm_notes?: string
  cm_so_references?: string
  items?: POItem[]
}

interface POItem {
  name: string
  item_code: string
  item_name?: string
  qty: number
  received_qty?: number
  billed_qty?: number
  uom?: string
  rate: number
  amount: number
  schedule_date?: string
}

function PctBar({ value, label, color = 'bg-cm-green' }: { value?: number; label: string; color?: string }) {
  const pct = Math.min(100, Math.max(0, Number(value) || 0))
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px]">
        <span className="text-gray-400 font-semibold uppercase tracking-wider">{label}</span>
        <span className="text-gray-700 tabular-nums">{pct.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function StageBadge({ stage }: { stage?: string }) {
  if (stage === 'Pricing Inquiry')
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">Pricing Inquiry</span>
  if (stage === 'Confirmed')
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-700">Confirmed</span>
  return null
}

const itemColumns: Column<POItem>[] = [
  { key: 'item_code', label: 'Item Code' },
  {
    key: 'item_name',
    label: 'Description',
    render: (v) => <span className="text-gray-600 text-[12px]">{v as string}</span>,
  },
  { key: 'qty', label: 'Ordered', align: 'right' },
  {
    key: 'received_qty',
    label: 'Received',
    align: 'right',
    render: (v) => <span className="tabular-nums text-cm-green">{v as number ?? 0}</span>,
  },
  { key: 'uom', label: 'UOM' },
  { key: 'rate', label: 'Unit Price', align: 'right', render: (v) => fmtMoney(v as number) },
  { key: 'amount', label: 'Total', align: 'right', render: (v) => fmtMoney(v as number) },
  { key: 'schedule_date', label: 'Required By', render: (v) => fmtDate(v as string) || '—' },
]

export function PurchaseOrderDetail() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const { can } = usePermissions()
  const [doc, setDoc] = useState<PODoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    if (!name) return
    setLoading(true)
    frappe.getDoc<PODoc>('Purchase Order', name)
      .then(setDoc)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load purchase order'))
      .finally(() => setLoading(false))
  }, [name])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="py-12 text-center text-gray-400">Loading…</div>
  if (error) return <ErrorBox message={error} />
  if (!doc) return <ErrorBox message="Purchase Order not found." />

  let soRefs: string[] = []
  try { soRefs = doc.cm_so_references ? JSON.parse(doc.cm_so_references) as string[] : [] } catch { /* */ }

  const isSubmitted = doc.docstatus === 1

  return (
    <div className="space-y-4">
      <BackLink label="Purchase Orders" onClick={() => navigate('/purchases/orders')} />

      <PageHeader
        title={doc.name}
        subtitle={doc.supplier_name || doc.supplier}
        actions={
          <div className="flex items-center gap-3 flex-wrap">
            <StageBadge stage={doc.cm_po_stage} />
            <StatusBadge status={doc.status} docstatus={doc.docstatus} />
            {doc.docstatus === 0 && (can('canPurchasing') || can('canAdmin')) && (
              <button
                onClick={() => navigate(`/purchases/orders/${encodeURIComponent(doc.name)}/edit`)}
                className="px-3 py-1.5 rounded text-xs font-semibold border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Edit
              </button>
            )}
            <DocActions
              doctype="Purchase Order"
              name={doc.name}
              docstatus={doc.docstatus ?? 0}
              canSubmit={can('canPurchasing')}
              canCancel={can('canAdmin')}
              conversions={[
                ...(doc.docstatus === 1 && (can('canWarehouse') || can('canPurchasing'))
                  ? ['Purchase Receipt'] : []),
              ]}
              onComplete={load}
            />
          </div>
        }
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
          <DetailField label="Order Date" value={fmtDate(doc.transaction_date)} />
          <DetailField label="Required By" value={fmtDate(doc.schedule_date)} />
          <DetailField label="Currency" value={doc.currency} />
          <DetailField label="Stage" value={doc.cm_po_stage} />
        </DetailGrid>

        {soRefs.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">SO References</p>
            <div className="flex gap-2 flex-wrap">
              {soRefs.map((so) => (
                <Link key={so} to={`/sales/orders/${encodeURIComponent(so)}`}
                  className="text-xs text-cm-green font-mono font-semibold hover:underline">
                  {so}
                </Link>
              ))}
            </div>
          </div>
        )}
      </DetailSection>

      {isSubmitted && (
        <DetailSection title="Fulfilment">
          <div className="grid grid-cols-2 gap-6 max-w-sm">
            <PctBar value={doc.per_received} label="Received" color="bg-cm-green" />
            <PctBar value={doc.per_billed} label="Billed" color="bg-blue-400" />
          </div>
          <div className="mt-3 flex gap-3">
            <button onClick={() => navigate(`/purchases/grn?po=${encodeURIComponent(doc.name)}`)}
              className="text-xs text-cm-green font-semibold hover:underline">
              View GRNs →
            </button>
          </div>
        </DetailSection>
      )}

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
