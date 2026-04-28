/**
 * CreditNoteCreate — picker that creates a return (credit note) from a submitted invoice.
 *
 * Entry points:
 *   - "+ New Credit Note" button on CreditNoteList
 *   - "Credit Note" action on a submitted Sales Invoice (state.source_invoice pre-fills search)
 *
 * After selecting an invoice it calls ERPNext's make_return_doc, saves the draft, then
 * navigates to the standard SalesInvoice editor at /sales/invoices/:name/edit.
 */
import { useState, useCallback, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import {
  PageHeader, BackLink, DataTable, ErrorBox,
  FilterRow, FieldWrap, Btn, inputCls, type Column,
} from '../../components/shared/ui'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { fmtDate, fmtMoney } from '../../utils/fmt'

interface InvoiceRow {
  name: string
  customer?: string
  customer_name?: string
  posting_date?: string
  grand_total?: number
  outstanding_amount?: number
  status?: string
  docstatus?: number
}

const COLUMNS: Column<InvoiceRow>[] = [
  {
    key: 'name',
    label: 'Invoice',
    render: (v) => <span className="font-mono text-[12px] font-medium text-cm-green">{v as string}</span>,
  },
  {
    key: 'customer_name',
    label: 'Customer',
    render: (v) => <span className="font-medium">{v as string}</span>,
  },
  { key: 'posting_date', label: 'Date', render: (v) => fmtDate(v as string) },
  {
    key: 'grand_total',
    label: 'Total',
    align: 'right',
    render: (v) => <span className="tabular-nums font-medium">{fmtMoney(v as number)}</span>,
  },
  {
    key: 'outstanding_amount',
    label: 'Outstanding',
    align: 'right',
    render: (v) => (
      <span className={`tabular-nums font-medium ${Number(v) > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
        {fmtMoney(v as number)}
      </span>
    ),
  },
  {
    key: 'status',
    label: 'Status',
    render: (v, row) => <StatusBadge status={v as string} docstatus={row.docstatus} />,
  },
]

export function CreditNoteCreate() {
  const navigate = useNavigate()
  const location = useLocation()

  const preselected = (location.state as { source_invoice?: string } | null)?.source_invoice ?? ''

  const [q, setQ] = useState(preselected)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [rows, setRows] = useState<InvoiceRow[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [creating, setCreating] = useState<string | null>(null)
  const [createError, setCreateError] = useState('')

  const runSearch = useCallback(async () => {
    setSearchLoading(true)
    setSearchError('')
    try {
      const filters: Array<[string, string, string, unknown]> = [
        ['docstatus', '=', '1', ''],
        ['is_return', '=', '0', ''],
      ]
      if (q) filters.push(['name', 'like', `%${q}%`, ''])
      if (fromDate) filters.push(['posting_date', '>=', fromDate, ''])
      if (toDate) filters.push(['posting_date', '<=', toDate, ''])

      const data = await frappe.getList<InvoiceRow>('Sales Invoice', {
        fields: ['name', 'customer', 'customer_name', 'posting_date', 'grand_total', 'outstanding_amount', 'status', 'docstatus'],
        filters,
        limit: 100,
        order_by: 'posting_date desc',
      })
      setRows(data)
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : 'Search failed')
      setRows([])
    } finally {
      setSearchLoading(false)
    }
  }, [q, fromDate, toDate])

  // Run on mount (handles preselected case)
  useEffect(() => { void runSearch() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelect = useCallback(async (row: InvoiceRow) => {
    if (creating) return
    setCreating(row.name)
    setCreateError('')
    try {
      const returnDoc = await frappe.call<Record<string, unknown>>(
        'erpnext.controllers.sales_and_purchase_return.make_return_doc',
        { doctype: 'Sales Invoice', source_name: row.name },
      )
      const saved = await frappe.saveDoc<{ name: string }>('Sales Invoice', returnDoc)
      if (!saved?.name) throw new Error('Credit note creation did not return a document name.')
      navigate(`/sales/invoices/${encodeURIComponent(saved.name)}/edit`)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create credit note')
    } finally {
      setCreating(null)
    }
  }, [creating, navigate])

  return (
    <div className="space-y-4">
      <BackLink label="Credit Notes" onClick={() => navigate('/sales/credit-notes')} />

      <PageHeader
        title="New Credit Note"
        actions={
          <Btn variant="ghost" onClick={() => navigate(-1)}>
            Cancel
          </Btn>
        }
      />

      <div className="rounded border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700">
        Select the submitted invoice you want to reverse. A credit note draft will be created for review.
      </div>

      {createError && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <span className="flex-1">{createError}</span>
          <button className="text-red-400 hover:text-red-700" onClick={() => setCreateError('')}>✕</button>
        </div>
      )}

      <FilterRow>
        <FieldWrap label="Search">
          <input
            className={inputCls + ' w-64'}
            placeholder="Invoice number or customer…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
          />
        </FieldWrap>
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
          <Btn onClick={() => void runSearch()} disabled={searchLoading}>
            {searchLoading ? 'Searching…' : 'Search'}
          </Btn>
        </div>
      </FilterRow>

      {searchError && <ErrorBox message={searchError} />}

      <DataTable
        columns={COLUMNS}
        rows={rows}
        loading={searchLoading}
        emptyMessage="No submitted invoices found."
        onRowClick={(row) => void handleSelect(row)}
      />

      {creating && (
        <p className="text-sm text-gray-500">
          Creating credit note for <span className="font-mono font-medium">{creating}</span>…
        </p>
      )}
    </div>
  )
}
