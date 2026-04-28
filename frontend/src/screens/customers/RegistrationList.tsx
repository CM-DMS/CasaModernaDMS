/**
 * RegistrationList — two-tab view for staff managing customer onboarding.
 *
 * Tab 1 — Submissions: CM Customer Onboarding Request, filtered by status.
 * Tab 2 — Sent Links:  CM Registration Invitation records.
 *
 * Route: /customers/registrations
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import {
  PageHeader, DataTable, type Column,
} from '../../components/shared/ui'

// ── Submissions ───────────────────────────────────────────────────────────────

interface OnboardingRequest {
  name: string
  full_name: string
  email: string
  mobile: string
  customer_type: string
  status: string
  creation: string
}

const STATUS_BADGE: Record<string, string> = {
  New:       'bg-amber-100 text-amber-700',
  Reviewed:  'bg-blue-100 text-blue-700',
  Converted: 'bg-green-100 text-green-700',
  Rejected:  'bg-red-100 text-red-700',
}

const SUBMISSION_COLUMNS: Column<OnboardingRequest>[] = [
  {
    key: 'full_name',
    label: 'Name',
    render: (v) => <span className="font-medium text-gray-900">{v as string}</span>,
  },
  { key: 'email', label: 'Email' },
  { key: 'mobile', label: 'Mobile' },
  { key: 'customer_type', label: 'Type' },
  {
    key: 'status',
    label: 'Status',
    render: (v) => (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_BADGE[v as string] ?? 'bg-gray-100 text-gray-600'}`}>
        {v as string}
      </span>
    ),
  },
  {
    key: 'creation',
    label: 'Submitted',
    render: (v) => v ? new Date(v as string).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
  },
]

function SubmissionsTab() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<OnboardingRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('New')
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    const filters = filter ? [['status', '=', filter]] : []
    frappe.getList('CM Customer Onboarding Request', {
      fields: ['name', 'full_name', 'email', 'mobile', 'customer_type', 'status', 'creation'],
      filters,
      limit: 100,
      order_by: 'creation desc',
    })
      .then((data: unknown) => setRows(Array.isArray(data) ? data : []))
      .catch((err: Error) => setError(err.message || 'Failed to load registrations'))
      .finally(() => setLoading(false))
  }, [filter])

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-gray-200">
        {(['New', 'Reviewed', 'Converted', 'Rejected', ''] as const).map((val) => (
          <button
            key={val || 'all'}
            onClick={() => setFilter(val)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              filter === val
                ? 'border-cm-green text-cm-green'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {val || 'All'}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <DataTable
        columns={SUBMISSION_COLUMNS}
        rows={rows}
        keyField="name"
        loading={loading}
        emptyMessage="No registrations found."
        onRowClick={(row) => navigate(`/customers/registrations/${encodeURIComponent(row.name)}`)}
      />
    </div>
  )
}

// ── Sent Links ─────────────────────────────────────────────────────────────────

interface RegInvitation {
  name: string
  recipient: string
  method: string
  sender_user: string
  sent_at: string
  redeemed: number
  onboarding_request: string
}

const LINK_COLUMNS: Column<RegInvitation>[] = [
  {
    key: 'recipient',
    label: 'Recipient',
    render: (v) => <span className="font-medium text-gray-900">{v as string}</span>,
  },
  {
    key: 'method',
    label: 'Via',
    render: (v) => (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
        v === 'Email' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
      }`}>
        {v === 'Email' ? '✉ Email' : '📱 SMS'}
      </span>
    ),
  },
  { key: 'sender_user', label: 'Sent By' },
  {
    key: 'sent_at',
    label: 'Sent',
    render: (v) => v ? new Date(v as string).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
  },
  {
    key: 'redeemed',
    label: 'Status',
    render: (v) => (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
        v ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
      }`}>
        {v ? 'Redeemed' : 'Pending'}
      </span>
    ),
  },
  {
    key: 'onboarding_request',
    label: 'Registration',
    render: (v) => v || <span className="text-gray-400">—</span>,
  },
]

function SentLinksTab() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<RegInvitation[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'pending' | 'redeemed' | 'all'>('pending')
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    const filters =
      filter === 'pending' ? [['redeemed', '=', 0]] :
      filter === 'redeemed' ? [['redeemed', '=', 1]] :
      []
    frappe.getList('CM Registration Invitation', {
      fields: ['name', 'recipient', 'method', 'sender_user', 'sent_at', 'redeemed', 'onboarding_request'],
      filters,
      limit: 100,
      order_by: 'sent_at desc',
    })
      .then((data: unknown) => setRows(Array.isArray(data) ? data : []))
      .catch((err: Error) => setError(err.message || 'Failed to load sent links'))
      .finally(() => setLoading(false))
  }, [filter])

  const handleRowClick = (row: RegInvitation) => {
    if (row.onboarding_request) {
      navigate(`/customers/registrations/${encodeURIComponent(row.onboarding_request)}`)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-gray-200">
        {(['pending', 'redeemed', 'all'] as const).map((val) => (
          <button
            key={val}
            onClick={() => setFilter(val)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              filter === val
                ? 'border-cm-green text-cm-green'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {val.charAt(0).toUpperCase() + val.slice(1)}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <DataTable
        columns={LINK_COLUMNS}
        rows={rows}
        keyField="name"
        loading={loading}
        emptyMessage="No sent links found."
        onRowClick={handleRowClick}
      />
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export function RegistrationList() {
  const [tab, setTab] = useState<'submissions' | 'sent-links'>('submissions')

  return (
    <div className="space-y-4">
      <PageHeader title="Customer Registrations" />

      <div className="flex gap-1 border-b-2 border-gray-200">
        {([['submissions', 'Submissions'], ['sent-links', 'Sent Links']] as const).map(([val, label]) => (
          <button
            key={val}
            onClick={() => setTab(val)}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 -mb-0.5 transition-colors ${
              tab === val
                ? 'border-cm-green text-cm-green'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'submissions' && <SubmissionsTab />}
      {tab === 'sent-links' && <SentLinksTab />}
    </div>
  )
}
