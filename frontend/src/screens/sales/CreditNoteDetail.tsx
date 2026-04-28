import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { PageHeader, DetailSection, DetailGrid, DetailField } from '../../components/shared/ui'
import { CM } from '../../components/ui/CMClassNames'
import { usePermissions } from '../../auth/PermissionsProvider'
import { frappe } from '../../api/frappe'
import { fmtDate, fmtMoney } from '../../utils/fmt'

interface CreditNoteDoc {
  name: string
  customer: string
  customer_name: string
  posting_date: string
  currency: string
  return_against: string
  docstatus: number
  status: string
  grand_total: number
  total_taxes_and_charges: number
  net_total: number
  outstanding_amount: number
  items: { name: string; item_code: string; item_name: string; qty: number; rate: number; amount: number }[]
  terms?: string
}

function DocStatusBadge({ docstatus, status }: { docstatus: number; status: string }) {
  const label = status || ['Draft', 'Submitted', 'Cancelled'][docstatus] || 'Unknown'
  const cls = docstatus === 0 ? 'bg-amber-100 text-amber-800' : docstatus === 1 ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-700'
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
}

export function CreditNoteDetail() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { can }  = usePermissions()
  const [doc, setDoc]         = useState<CreditNoteDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    frappe.getDoc<CreditNoteDoc>('Sales Invoice', decodeURIComponent(id))
      .then(setDoc)
      .catch((err: Error) => setError(err.message || 'Failed to load credit note'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="flex items-center justify-center py-24"><div className="h-8 w-8 rounded-full border-4 border-cm-green border-t-transparent animate-spin" /></div>

  if (error) return (
    <div>
      <PageHeader title="Credit Note" actions={<button onClick={() => navigate('/sales/credit-notes')} className={CM.btn.secondary}>← Back</button>} />
      <div className="mx-6 mt-4 rounded bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
    </div>
  )

  if (!doc) return null
  const isDraft = doc.docstatus === 0
  const printUrl = `/printview?doctype=Sales%20Invoice&name=${encodeURIComponent(doc.name)}&trigger_print=1`

  return (
    <div>
      <PageHeader
        title={doc.name}
        subtitle={doc.customer_name}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <DocStatusBadge docstatus={doc.docstatus} status={doc.status} />
            <a href={printUrl} target="_blank" rel="noopener noreferrer" className={CM.btn.secondary}>🖨 Print</a>
            {isDraft && can('canSales') && (
              <button onClick={() => navigate(`/sales/credit-notes/${encodeURIComponent(doc.name)}/edit`)} className={CM.btn.primary}>✏️ Edit</button>
            )}
            <button onClick={() => navigate('/sales/credit-notes')} className={CM.btn.secondary}>← Back</button>
          </div>
        }
      />

      <div className="mx-6 mt-6 grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-5">
          <DetailSection title="Header">
            <DetailGrid>
              <DetailField label="Reference"      value={doc.name} />
              <DetailField label="Customer"       value={doc.customer_name} />
              <DetailField label="Date"           value={fmtDate(doc.posting_date)} />
              <DetailField label="Currency"       value={doc.currency} />
              <DetailField label="Return Against" value={doc.return_against || '—'} />
            </DetailGrid>
          </DetailSection>

          <DetailSection title={`Items (${(doc.items || []).length})`}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className={CM.table.th}>Item Code</th>
                    <th className={CM.table.th}>Description</th>
                    <th className={CM.table.thRight}>Qty</th>
                    <th className={CM.table.thRight}>Rate</th>
                    <th className={CM.table.thRight}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(doc.items || []).map((item) => (
                    <tr key={item.name} className={CM.table.tr}>
                      <td className={`${CM.table.td} font-mono text-[11px]`}>{item.item_code}</td>
                      <td className={CM.table.td}>{item.item_name}</td>
                      <td className={CM.table.tdRight}>{item.qty}</td>
                      <td className={CM.table.tdRight}>{fmtMoney(item.rate)}</td>
                      <td className={CM.table.tdRight}>{fmtMoney(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DetailSection>

          {doc.terms && (
            <DetailSection title="Terms">
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{doc.terms}</p>
            </DetailSection>
          )}
        </div>

        <div className="space-y-5">
          <DetailSection title="Totals">
            <div className="space-y-1">
              <div className="flex justify-between text-sm py-1 border-b border-gray-100"><span className="text-gray-500">Net Total</span><span className="tabular-nums">{fmtMoney(doc.net_total)}</span></div>
              <div className="flex justify-between text-sm py-1 border-b border-gray-100"><span className="text-gray-500">Taxes</span><span className="tabular-nums">{fmtMoney(doc.total_taxes_and_charges)}</span></div>
              <div className="flex justify-between text-sm py-1.5 font-semibold"><span>Grand Total</span><span className="tabular-nums">{fmtMoney(doc.grand_total)}</span></div>
              {doc.outstanding_amount !== 0 && (
                <div className="flex justify-between text-sm py-1 text-red-600"><span>Outstanding</span><span className="tabular-nums">{fmtMoney(doc.outstanding_amount)}</span></div>
              )}
            </div>
          </DetailSection>
        </div>
      </div>
    </div>
  )
}
