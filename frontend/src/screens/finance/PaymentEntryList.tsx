import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import {
  PageHeader, FilterRow, FieldWrap, DataTable, ErrorBox, Btn,
  inputCls, type Column,
} from '../../components/shared/ui'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { CM } from '../../components/ui/CMClassNames'
import { usePermissions } from '../../auth/PermissionsProvider'
import { fmtDate, fmtMoney } from '../../utils/fmt'

interface PaymentEntry {
  name: string
  party?: string
  party_name?: string
  paid_amount?: number
  mode_of_payment?: string
  reference_no?: string
  posting_date?: string
  docstatus?: number
}

const COLUMNS: Column<PaymentEntry>[] = [
  {
    key: 'name',
    label: 'Reference',
    render: (v) => <span className="font-mono text-[12px] font-medium text-cm-green">{v as string}</span>,
  },
  {
    key: 'party_name',
    label: 'Customer',
    render: (v) => <span className="font-medium">{v as string}</span>,
  },
  {
    key: 'paid_amount',
    label: 'Amount',
    align: 'right',
    render: (v) => <span className="tabular-nums font-medium">{fmtMoney(v as number)}</span>,
  },
  { key: 'mode_of_payment', label: 'Mode' },
  { key: 'reference_no', label: 'Reference No.' },
  { key: 'posting_date', label: 'Date', render: (v) => fmtDate(v as string) },
  {
    key: 'docstatus',
    label: 'Status',
    render: (v) => {
      const ds = v as number
      const status = ds === 1 ? 'Submitted' : ds === 0 ? 'Draft' : 'Cancelled'
      return <StatusBadge docstatus={ds} status={status} />
    },
  },
]

export function PaymentEntryList() {
  const navigate = useNavigate()
  const { can } = usePermissions()

  const [partyName, setPartyName] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [modeOfPayment, setModeOfPayment] = useState('')
  const [rows, setRows] = useState<PaymentEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const runSearch = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const filters: Array<[string, string, string, unknown]> = []
      // Only show receipts (money received from customers)
      filters.push(['payment_type', '=', 'Receive', ''])
      if (partyName) filters.push(['party_name', 'like', `%${partyName}%`, ''])
      if (fromDate) filters.push(['posting_date', '>=', fromDate, ''])
      if (toDate) filters.push(['posting_date', '<=', toDate, ''])
      if (modeOfPayment) filters.push(['mode_of_payment', '=', modeOfPayment, ''])

      const data = await frappe.getList<PaymentEntry>('Payment Entry', {
        fields: ['name', 'party', 'party_name', 'paid_amount', 'mode_of_payment', 'reference_no', 'posting_date', 'docstatus'],
        filters,
        limit: 100,
        order_by: 'posting_date desc',
      })
      setRows(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load receipts')
    } finally {
      setLoading(false)
    }
  }, [partyName, fromDate, toDate, modeOfPayment])

  useEffect(() => { void runSearch() }, [runSearch])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Receipts"
        subtitle={`${rows.length} results`}
        actions={
          can('canSales') || can('canFinance')
            ? <button className={CM.btn.primary} onClick={() => navigate('/sales/receipts/new')}>+ New Receipt</button>
            : undefined
        }
      />

      <FilterRow>
        <FieldWrap label="Customer">
          <input className={inputCls + ' w-48'} value={partyName}
            onChange={(e) => setPartyName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
            placeholder="Customer name…" />
        </FieldWrap>
        <FieldWrap label="Mode">
          <input className={inputCls + ' w-36'} value={modeOfPayment}
            onChange={(e) => setModeOfPayment(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
            placeholder="Cash / Bank…" />
        </FieldWrap>
        <FieldWrap label="From">
          <input type="date" className={inputCls} value={fromDate}
            onChange={(e) => setFromDate(e.target.value)} />
        </FieldWrap>
        <FieldWrap label="To">
          <input type="date" className={inputCls} value={toDate}
            onChange={(e) => setToDate(e.target.value)} />
        </FieldWrap>
        <div className="flex items-end">
          <Btn onClick={() => void runSearch()} disabled={loading}>
            {loading ? 'Searching…' : 'Search'}
          </Btn>
        </div>
      </FilterRow>

      {error && <ErrorBox message={error} />}

      <DataTable
        columns={COLUMNS}
        rows={rows}
        loading={loading}
        emptyMessage="No receipts match your search."
        onRowClick={(row) => navigate(`/sales/receipts/${encodeURIComponent(row.name)}`)}
      />
    </div>
  )
}
