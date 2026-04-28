/**
 * SalesDocToolbar — context-aware action bar for sales documents.
 * TypeScript port of V2 SalesDocToolbar.jsx.
 */
import type { Capabilities } from '../../workflow/documentWorkflow'
import {
  getNextActions,
  getDocumentStatusLabel,
  ACTION_IDS,
  type ActionId,
  type ActionVariant,
} from '../../workflow/documentWorkflow'
import { CM } from '../ui/CMClassNames'

const VARIANT_CLASS: Record<ActionVariant, string> = {
  primary: CM.btn.primary,
  secondary: CM.btn.secondary,
  danger: CM.btn.danger,
  ghost: CM.btn.ghost,
  warning: CM.btn.warning,
  success: CM.btn.success,
}

interface SalesDocToolbarProps {
  doctype: string
  docstatus: number
  workflow_state?: string | null
  status?: string | null
  capabilities?: Capabilities
  dirty?: boolean
  saving?: boolean
  name?: string | null
  onAction: (actionId: ActionId) => void
}

export function SalesDocToolbar({
  doctype,
  docstatus,
  workflow_state,
  status,
  capabilities,
  dirty,
  saving,
  name,
  onAction,
}: SalesDocToolbarProps) {
  const actions = getNextActions({ doctype, docstatus, workflow_state, status, capabilities })
  const statusLabel = getDocumentStatusLabel(docstatus, workflow_state)

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-200 flex-wrap">
      {/* Document name + status badge */}
      <div className="flex items-center gap-2 mr-2">
        {name && (
          <span className="text-sm font-semibold text-gray-800 font-mono">{name}</span>
        )}
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusLabel.colour}`}>
          {statusLabel.label}
        </span>
        {dirty && !saving && (
          <span className="text-[11px] text-amber-600 font-medium">● Unsaved</span>
        )}
        {saving && (
          <span className="text-[11px] text-gray-500">Saving…</span>
        )}
      </div>

      <div className="flex-1" />

      {/* Action buttons */}
      {actions.map((action) => {
        const cls = VARIANT_CLASS[action.variant] || CM.btn.secondary
        return (
          <button
            key={action.id}
            type="button"
            className={cls}
            disabled={saving}
            onClick={() => onAction(action.id)}
          >
            {action.label}
          </button>
        )
      })}
    </div>
  )
}
