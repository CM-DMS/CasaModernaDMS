/**
 * VoucherList — browse and filter CM Gift Vouchers.
 *
 * Route: /customers/vouchers
 */
import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import {
  PageHeader, FilterRow, DataTable, Btn, selectCls, inputCls,
  type Column,
} from '../../components/shared/ui'
import { fmtMoney, fmtDate } from '../../utils/fmt'
import { usePermissions } from '../../auth/PermissionsProvider'

interface VoucherRow {
  name: string
  voucher_code: string
  purchaser_name?: string
  recipient_name?: string
  voucher_value: number
  voucher_source: string
  valid_until: string
  status: string
}

const STATUS_STYLES: Record<string, string> = {
  Draft:                   'bg-gray-100 text-gray-600',
  'Pending Authorization': 'bg-amber-100 text-amber-700',
  Authorized:              'bg-blue-100 text-blue-700',
  Rejected:                'bg-red-100 text-red-700',
  Redeemed:                'bg-green-100 text-green-700',
}

const STATUS_OPTIONS = [
  { value: '',                       label: 'All Statuses' },
  { value: 'Draft',                  label: 'Draft' },
  { value: 'Pending Authorization',  label: 'Pending Authorization' },
  { value: 'Authorized',             label: 'Authorized' },
  { value: 'Rejected',               label: 'Rejected' },
  { value: 'Redeemed',               label: 'Redeemed' },
]

export function VoucherList() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { can } = usePermissions()

  const statusParam = searchParams.get('status') ?? ''
  const qParam = searchParams.get('q') ?? ''

  const [q, setQ] = useState(qParam)
  const [status, setStatus] = useState(statusParam)
  const [rows, setRows] = useState<VoucherRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await frappe.call<VoucherRow[]>(
        'casamoderna_dms.voucher_api.get_voucher_list',
        { status, q, limit: 100 },
      )
      setRows(Array.isArray(data) ? data : [])
    } catch (e: unknown) {
      setError((e as Error).message || 'Failed to load vouchers')
    } finally {
      setLoading(false)
    }
  }, [status, q])

  useEffect(() => { load() }, [load])

  const handleSearch = () => {
    setSearchParams({ status, q })
    load()
  }

  const COLUMNS: Column<VoucherRow>[] = [
    {
      key: 'voucher_code',
      label: 'Code',
      render: (v) => (
        <span className="font-mono text-[12px] font-bold text-cm-green tracking-widest">
          {v as string}
        </span>
      ),
    },
    {
      key: 'purchaser_name',
      label: 'Purchaser',
      render: (v) => <span className="text-sm">{(v as string) || '—'}</span>,
    },
    {
      key: 'recipient_name',
      label: 'Recipient',
      render: (v) => <span className="text-sm">{(v as string) || '—'}</span>,
    },
    {
      key: 'voucher_value',
      label: 'Value',
      align: 'right',
      render: (v) => <span className="font-semibold tabular-nums">{fmtMoney(v as number)}</span>,
    },
    {
      key: 'voucher_source',
      label: 'Source',
      render: (v) => <span className="text-sm text-gray-600">{v as string}</span>,
    },
    {
      key: 'valid_until',
      label: 'Valid Until',
      render: (v) => <span className="text-sm">{v ? fmtDate(v as string) : '—'}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (v) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${STATUS_STYLES[v as string] ?? 'bg-gray-100 text-gray-500'}`}>
          {v as string}
        </span>
      ),
    },
    {
      key: 'name',
      label: '',
      render: (_, row) => (
        <button
          className="text-[11px] text-cm-green hover:underline"
          onClick={(e) => {
            e.stopPropagation()
            navigate(`/customers/vouchers/${encodeURIComponent(row.name)}/print`)
          }}
        >
          🖨 Print
        </button>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        title="Gift Vouchers"
        subtitle="Manage and track customer gift vouchers"
        actions={
          <div className="flex gap-2">
            {can('canAuthorizeVouchers') && (
              <Btn variant="ghost" onClick={() => navigate('/customers/vouchers/approvals')}>
                Pending Approvals
              </Btn>
            )}
            {can('canVouchers') && (
              <Btn onClick={() => navigate('/customers/vouchers/new')}>+ New Voucher</Btn>
            )}
          </div>
        }
      />

      <FilterRow>
        <input
          type="text"
          placeholder="Search code or customer…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          className={inputCls}
        />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value) }}
          className={selectCls}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <Btn onClick={handleSearch}>Search</Btn>
      </FilterRow>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <DataTable
        columns={COLUMNS}
        rows={rows}
        keyField="name"
        loading={loading}
        emptyMessage="No vouchers found."
        onRowClick={(row) => navigate(`/customers/vouchers/${encodeURIComponent(row.name)}`)}
      />
    </div>
  )
}
