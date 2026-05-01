import type { ReactNode } from 'react'
import { CM } from './CMClassNames'

// ── CMSection ────────────────────────────────────────────────────────────────

interface CMSectionProps {
  title?: string
  tip?: string
  actions?: ReactNode
  children: ReactNode
}

export function CMSection({ title, actions, children }: CMSectionProps) {
  return (
    <div className={CM.section}>
      {(title || actions) && (
        <div className="flex items-center justify-between mb-3">
          {title && <div className={CM.sectionTitle}>{title}</div>}
          {actions && <div>{actions}</div>}
        </div>
      )}
      {children}
    </div>
  )
}

// ── CMField ──────────────────────────────────────────────────────────────────

interface CMFieldProps {
  label: string
  tip?: string
  children: ReactNode
}

export function CMField({ label, children }: CMFieldProps) {
  return (
    <div>
      <label className={CM.label}>{label}</label>
      {children}
    </div>
  )
}

// ── CMButton ─────────────────────────────────────────────────────────────────

interface CMButtonProps {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'warning' | 'success'
  onClick?: () => void
  disabled?: boolean
  type?: 'button' | 'submit'
  children: ReactNode
  className?: string
}

export function CMButton({
  variant = 'secondary',
  onClick,
  disabled,
  type = 'button',
  children,
  className = '',
}: CMButtonProps) {
  const cls = CM.btn[variant] || CM.btn.secondary
  return (
    <button type={type} className={`${cls} ${className}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

// ── Spinner ──────────────────────────────────────────────────────────────────

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="h-8 w-8 rounded-full border-4 border-cm-green border-t-transparent animate-spin" />
    </div>
  )
}

// ── ErrorBanner ──────────────────────────────────────────────────────────────

export function ErrorBanner({
  message,
  onDismiss,
}: {
  message: string
  onDismiss?: () => void
}) {
  return (
    <div className="mx-3 mt-2 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 flex items-start gap-2">
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button className="text-red-400 hover:text-red-700" onClick={onDismiss}>
          ✕
        </button>
      )}
    </div>
  )
}
