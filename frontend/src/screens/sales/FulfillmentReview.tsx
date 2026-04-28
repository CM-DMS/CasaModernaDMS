import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import { PageHeader, ErrorBox } from '../../components/shared/ui'
import { fmtMoney } from '../../utils/fmt'
import { usePermissions } from '../../auth/PermissionsProvider'

const ACTIONS = [
  { value: 'stock', label: 'In Stock' },
  { value: 'to_order', label: 'To Order' },
  { value: 'to_order_placed', label: 'Order Placed' },
  { value: 'service', label: 'Service' },
] as const

type ActionValue = 'stock' | 'to_order' | 'to_order_placed' | 'service' | ''

interface FulfillLine {
  so_detail: string
  item_name: string
  description?: string
  qty: number
  uom: string
  available_qty?: number
  supplier?: string
  cfg_summary?: string
  line_type?: string
  cm_fulfill_action?: ActionValue
  cm_fulfill_notes?: string
  cm_fulfill_by?: string
  cm_fulfill_on?: string
}

interface SOSummary {
  name: string
  customer_name: string
  delivery_date?: string
  grand_total?: number
  cm_fulfill_status?: string
  cm_fulfill_locked?: 0 | 1
  docstatus?: number
}

interface FulfillData {
  so: SOSummary
  lines: FulfillLine[]
}

function fmtDelivery(isoDate?: string) {
  if (!isoDate) return '—'
  const [y, m] = isoDate.split('-')
  const month = new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-GB', { month: 'long' })
  return `End of ${month} ${y}`
}

function ActionBadge({ action }: { action?: ActionValue }) {
  if (!action) return <span className="text-gray-400 text-xs">—</span>
  const colors: Record<string, string> = {
    stock: 'bg-green-100 text-green-700',
    to_order: 'bg-amber-100 text-amber-800',
    to_order_placed: 'bg-blue-100 text-blue-700',
    service: 'bg-purple-100 text-purple-700',
  }
  const label = ACTIONS.find((a) => a.value === action)?.label || action
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${colors[action] ?? 'bg-gray-100 text-gray-500'}`}>
      {label}
    </span>
  )
}

interface LineCardProps {
  line: FulfillLine
  action: ActionValue
  notes: string
  onAction: (a: ActionValue) => void
  onNotes: (n: string) => void
  readOnly: boolean
}

function LineCard({ line, action, notes, onAction, onNotes, readOnly }: LineCardProps) {
  const [open, setOpen] = useState(false)
  const hasFreetextWarning = action === 'to_order' && line.line_type === 'FREETEXT'

  return (
    <div className="rounded border border-gray-200 bg-white">
      <button
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="mt-0.5 text-gray-400 text-xs select-none">{open ? '▾' : '▸'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-900">{line.item_name}</span>
            <ActionBadge action={action || line.cm_fulfill_action} />
            {hasFreetextWarning && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700">
                ⚠ Free Text
              </span>
            )}
          </div>
          {line.description && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{line.description}</p>
          )}
        </div>
        <div className="text-xs text-gray-500 whitespace-nowrap">
          {line.qty} {line.uom}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100">
          {/* Context info */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-2">
            <div className="text-gray-500">
              <span className="font-medium">Available:</span> {line.available_qty ?? '—'}
            </div>
            {line.supplier && (
              <div className="text-gray-500 col-span-2">
                <span className="font-medium">Supplier:</span> {line.supplier}
              </div>
            )}
            {line.cfg_summary && (
              <div className="text-gray-500 col-span-2">
                <span className="font-medium">Config:</span> {line.cfg_summary}
              </div>
            )}
            {line.line_type && (
              <div className="text-gray-500">
                <span className="font-medium">Type:</span> {line.line_type}
              </div>
            )}
          </div>

          {hasFreetextWarning && (
            <div className="rounded bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              This is a free-text item with no item master. Ensure a Purchase Order is raised manually.
            </div>
          )}

          {/* Action buttons */}
          {!readOnly && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Action</p>
              <div className="flex gap-2 flex-wrap">
                {ACTIONS.map((a) => (
                  <button
                    key={a.value}
                    onClick={() => onAction(a.value)}
                    className={`px-3 py-1 rounded text-xs font-semibold border transition-colors ${
                      (action || line.cm_fulfill_action) === a.value
                        ? 'bg-cm-green text-white border-cm-green'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {!readOnly && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Notes</p>
              <textarea
                rows={2}
                value={notes || line.cm_fulfill_notes || ''}
                onChange={(e) => onNotes(e.target.value)}
                placeholder="Optional notes…"
                className="w-full border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 focus:outline-none focus:border-indigo-300 resize-y"
              />
            </div>
          )}

          {readOnly && (line.cm_fulfill_notes || notes) && (
            <div className="text-xs text-gray-500 italic">{notes || line.cm_fulfill_notes}</div>
          )}
        </div>
      )}
    </div>
  )
}

export function FulfillmentReview() {
  const { soName } = useParams<{ soName: string }>()
  const navigate = useNavigate()
  const { can } = usePermissions()

  const [data, setData] = useState<FulfillData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState(false)

  const [actionsMap, setActionsMap] = useState<Record<string, ActionValue>>({})
  const [notesMap, setNotesMap] = useState<Record<string, string>>({})

  const load = useCallback(() => {
    if (!soName) return
    setLoading(true)
    frappe
      .call('casamoderna_dms.so_fulfillment.get_fulfillment_data', { so_name: soName })
      .then((res: any) => {
        const fd = res.message ?? res
        setData(fd as FulfillData)
        setActionsMap({})
        setNotesMap({})
      })
      .catch((e: any) => setError(e.message || 'Failed to load fulfilment data.'))
      .finally(() => setLoading(false))
  }, [soName])

  useEffect(() => { load() }, [load])

  if (!can('canAdmin') && !can('canPurchasing')) {
    return (
      <div className="p-6 text-sm text-gray-500">
        Only designated fulfilment reviewers can access this screen.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 rounded-full border-4 border-cm-green border-t-transparent animate-spin" />
      </div>
    )
  }

  if (error) return <ErrorBox message={error} />
  if (!data) return <ErrorBox message="Order not found." />

  const { so, lines } = data
  const isLocked = !!so.cm_fulfill_locked

  const getAction = (l: FulfillLine): ActionValue =>
    actionsMap[l.so_detail] ?? (l.cm_fulfill_action ?? '')
  const getNotes = (l: FulfillLine): string =>
    notesMap[l.so_detail] ?? (l.cm_fulfill_notes ?? '')

  const actionCounts = ACTIONS.map((a) => ({
    ...a,
    count: lines.filter((l) => getAction(l) === a.value).length,
  }))

  const unclassified = lines.filter((l) => !getAction(l)).length

  const handleSave = async () => {
    const updates = lines.map((l) => ({
      so_detail: l.so_detail,
      cm_fulfill_action: getAction(l),
      cm_fulfill_notes: getNotes(l),
    }))
    setSaving(true)
    setError('')
    try {
      await frappe.call('casamoderna_dms.so_fulfillment.save_fulfillment_review', {
        so_name: soName,
        line_updates: updates,
      })
      await load()
    } catch (e: any) {
      setError(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleComplete = async () => {
    if (unclassified > 0) {
      setError(`${unclassified} line(s) have no action set. Classify all lines before marking fulfilled.`)
      return
    }
    if (!window.confirm('Mark this order as Fulfilled?')) return
    // Save first
    const updates = lines.map((l) => ({
      so_detail: l.so_detail,
      cm_fulfill_action: getAction(l),
      cm_fulfill_notes: getNotes(l),
    }))
    setCompleting(true)
    setError('')
    try {
      await frappe.call('casamoderna_dms.so_fulfillment.save_fulfillment_review', {
        so_name: soName,
        line_updates: updates,
      })
      await frappe.call('casamoderna_dms.so_fulfillment.complete_fulfillment', {
        so_name: soName,
      })
      await load()
    } catch (e: any) {
      setError(e.message || 'Complete failed')
    } finally {
      setCompleting(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Fulfilment: ${so.name}`}
        subtitle={so.customer_name}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {!isLocked && (
              <>
                <button
                  onClick={() => void handleSave()}
                  disabled={saving || completing}
                  className="px-4 py-1.5 rounded text-sm font-semibold bg-cm-green text-white hover:bg-cm-green/90 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                {so.cm_fulfill_status !== 'fulfilled' && (
                  <button
                    onClick={() => void handleComplete()}
                    disabled={saving || completing}
                    className="px-4 py-1.5 rounded text-sm font-semibold border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    {completing ? 'Marking…' : 'Mark Fulfilled'}
                  </button>
                )}
              </>
            )}
            <button
              onClick={() => navigate(`/sales/orders/${encodeURIComponent(soName!)}`)}
              className="px-3 py-1.5 rounded text-xs font-semibold border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
            >
              ← Order
            </button>
          </div>
        }
      />

      {error && <ErrorBox message={error} />}

      {/* SO Summary strip */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
        <div>
          <span className="text-gray-500 text-xs">Delivery</span>
          <p className="font-medium text-gray-800">{fmtDelivery(so.delivery_date)}</p>
        </div>
        <div>
          <span className="text-gray-500 text-xs">Order Value</span>
          <p className="font-medium text-gray-800">{fmtMoney(so.grand_total)}</p>
        </div>
        <div>
          <span className="text-gray-500 text-xs">Status</span>
          <p className="font-medium text-gray-800 capitalize">{so.cm_fulfill_status || 'pending'}</p>
        </div>
      </div>

      {isLocked && (
        <div className="rounded bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-600">
          This order is locked and cannot be edited.
        </div>
      )}

      {/* Classification summary */}
      <div className="flex flex-wrap items-center gap-3">
        {actionCounts.map((a) =>
          a.count > 0 ? (
            <span key={a.value} className="text-xs font-semibold text-gray-600">
              {a.label}: <span className="font-bold">{a.count}</span>
            </span>
          ) : null
        )}
        {unclassified > 0 && (
          <span className="text-xs font-semibold text-amber-700">
            Unclassified: <span className="font-bold">{unclassified}</span>
          </span>
        )}
      </div>

      {/* Lines */}
      <div className="space-y-2">
        {lines.map((line) => (
          <LineCard
            key={line.so_detail}
            line={line}
            action={getAction(line)}
            notes={getNotes(line)}
            onAction={(a) => setActionsMap((m) => ({ ...m, [line.so_detail]: a }))}
            onNotes={(n) => setNotesMap((m) => ({ ...m, [line.so_detail]: n }))}
            readOnly={isLocked}
          />
        ))}
        {lines.length === 0 && (
          <div className="py-8 text-center text-sm text-gray-400">No lines found for this order.</div>
        )}
      </div>
    </div>
  )
}
