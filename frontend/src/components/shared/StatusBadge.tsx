/** StatusBadge — renders a coloured pill for ERPNext docstatus / workflow status */

interface StatusBadgeProps {
  status?: string | null
  docstatus?: number | null
  workflowState?: string | null
}

const STATUS_COLOURS: Record<string, string> = {
  Draft:        'bg-gray-100 text-gray-700',
  Submitted:    'bg-blue-100 text-blue-700',
  Cancelled:    'bg-red-100 text-red-700',
  Open:         'bg-yellow-100 text-yellow-700',
  Ordered:      'bg-blue-100 text-blue-700',
  'To Deliver and Bill': 'bg-indigo-100 text-indigo-700',
  'To Deliver': 'bg-indigo-100 text-indigo-700',
  'To Bill':    'bg-orange-100 text-orange-700',
  Completed:    'bg-green-100 text-green-700',
  Closed:       'bg-gray-200 text-gray-600',
  Expired:      'bg-red-100 text-red-600',
  Lost:         'bg-red-100 text-red-600',
  Unpaid:       'bg-amber-100 text-amber-700',
  'Partly Paid': 'bg-yellow-100 text-yellow-800',
  Paid:         'bg-green-100 text-green-700',
  Overdue:      'bg-red-100 text-red-700',
  'Return Issued': 'bg-purple-100 text-purple-700',
  Confirmed:    'bg-green-100 text-green-700',
  Pending:      'bg-amber-100 text-amber-700',
  Active:       'bg-green-100 text-green-700',
  Inactive:     'bg-red-100 text-red-700',
}

function resolveLabel(docstatus: number | null | undefined, status: string | null | undefined): string {
  if (docstatus === 2) return 'Cancelled'
  if (status) return status
  if (docstatus === 0) return 'Draft'
  if (docstatus === 1) return 'Submitted'
  return '—'
}

export function StatusBadge({ status, docstatus, workflowState }: StatusBadgeProps) {
  const label = resolveLabel(docstatus, workflowState ?? status)
  const colours = STATUS_COLOURS[label] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${colours}`}>
      {label}
    </span>
  )
}
