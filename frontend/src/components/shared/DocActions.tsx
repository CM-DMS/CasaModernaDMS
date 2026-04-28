import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { submitDoc, cancelDoc, convertDoc, printDoc, routeForConverted } from '../../api/docActions'

interface Action {
  label: string
  icon?: string
  onClick: () => void
  variant?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
}

interface DocActionsProps {
  doctype: string
  name: string
  docstatus: number
  // Which conversion targets to show (checked by caller against permissions)
  conversions?: string[]
  canSubmit?: boolean
  canCancel?: boolean
  onComplete?: () => void // callback to reload parent after action
}

function ActionBtn({
  label, icon, onClick, variant = 'secondary', disabled, loading,
}: Action & { loading?: boolean }) {
  const cls = {
    primary: 'bg-cm-green text-white hover:bg-cm-green/90',
    secondary: 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50',
    danger:   'bg-red-50 border border-red-300 text-red-700 hover:bg-red-100',
  }[variant]
  return (
    <button type="button" disabled={disabled || loading}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-lg transition-all shadow-sm disabled:opacity-40 ${cls}`}>
      {loading
        ? <span className="h-3 w-3 border-2 border-current/30 border-t-current rounded-full animate-spin" />
        : icon && <span>{icon}</span>}
      {label}
    </button>
  )
}

export function DocActions({
  doctype, name, docstatus, conversions = [], canSubmit, canCancel, onComplete,
}: DocActionsProps) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key)
    setError('')
    try {
      await fn()
      onComplete?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(null)
    }
  }

  const isDraft     = docstatus === 0
  const isSubmitted = docstatus === 1
  const isCancelled = docstatus === 2

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Submit */}
      {isDraft && canSubmit && (
        <ActionBtn label="Submit" icon="✔" variant="primary" loading={busy === 'submit'}
          onClick={() => run('submit', () => submitDoc(doctype, name))} />
      )}

      {/* Conversion buttons */}
      {isSubmitted && conversions.map((target) => (
        <ActionBtn key={target} label={`→ ${target}`} variant="secondary" loading={busy === target}
          onClick={() => run(target, async () => {
            const newName = await convertDoc(doctype, target, name)
            const route = routeForConverted(target)
            if (route) navigate(`${route}${encodeURIComponent(newName)}`)
          })} />
      ))}

      {/* Print */}
      <ActionBtn label="Print" icon="🖨" variant="secondary"
        onClick={() => printDoc(doctype, name)} />

      {/* Cancel (admin) */}
      {isSubmitted && canCancel && (
        <ActionBtn label="Cancel" variant="danger" loading={busy === 'cancel'}
          onClick={() => {
            if (confirm(`Cancel ${name}?`)) void run('cancel', () => cancelDoc(doctype, name))
          }} />
      )}

      {error && (
        <span className="text-[11px] text-red-600 font-semibold">{error}</span>
      )}
    </div>
  )
}
