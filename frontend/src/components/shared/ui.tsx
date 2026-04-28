/** Reusable list-screen primitives: PageHeader, FilterRow, DataTable */
import type { ReactNode } from 'react'

// ── PageHeader ────────────────────────────────────────────────────────────────

interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: ReactNode
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}

// ── FilterRow ─────────────────────────────────────────────────────────────────

export function FilterRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-3 mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
      {children}
    </div>
  )
}

// ── Field label wrapper ───────────────────────────────────────────────────────

export function FieldWrap({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}

// ── Input / Select base styles ────────────────────────────────────────────────

export const inputCls =
  'px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-cm-green focus:border-transparent bg-white'

export const selectCls =
  'px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-cm-green focus:border-transparent bg-white'

// ── Btn ───────────────────────────────────────────────────────────────────────

interface BtnProps {
  onClick?: () => void
  disabled?: boolean
  variant?: 'primary' | 'ghost'
  children: ReactNode
}

export function Btn({ onClick, disabled, variant = 'primary', children }: BtnProps) {
  const base = 'px-3 py-1.5 text-sm font-medium rounded transition-colors disabled:opacity-50'
  const styles =
    variant === 'ghost'
      ? `${base} text-gray-700 border border-gray-300 hover:bg-gray-100`
      : `${base} bg-cm-green text-white hover:bg-cm-green-dark`
  return (
    <button className={styles} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

// ── ErrorBox ──────────────────────────────────────────────────────────────────

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  )
}

// ── DataTable ─────────────────────────────────────────────────────────────────

export interface Column<T> {
  key: keyof T | string
  label: string
  align?: 'left' | 'right' | 'center'
  render?: (value: unknown, row: T) => ReactNode
}

interface DataTableProps<T extends object> {
  columns: Column<T>[]
  rows: T[]
  loading?: boolean
  emptyMessage?: string
  onRowClick?: (row: T) => void
  keyField?: keyof T
}

export function DataTable<T extends object>({
  columns,
  rows,
  loading,
  emptyMessage = 'No records found.',
  onRowClick,
  keyField = 'name' as keyof T,
}: DataTableProps<T>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {columns.map((col) => (
              <th
                key={String(col.key)}
                className={`px-3 py-2.5 font-medium text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap ${
                  col.align === 'right'
                    ? 'text-right'
                    : col.align === 'center'
                    ? 'text-center'
                    : 'text-left'
                }`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-gray-400">
                Loading…
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-gray-400">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={String((row as Record<string, unknown>)[String(keyField)]) ?? i}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`border-b border-gray-100 last:border-0 ${
                  onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''
                }`}
              >
                {columns.map((col) => {
                  const val = (row as Record<string, unknown>)[String(col.key)]
                  return (
                    <td
                      key={String(col.key)}
                      className={`px-3 py-2.5 ${
                        col.align === 'right'
                          ? 'text-right'
                          : col.align === 'center'
                          ? 'text-center'
                          : ''
                      }`}
                    >
                      {col.render ? col.render(val, row) : (val as ReactNode) ?? '—'}
                    </td>
                  )
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

// ── DetailSection ─────────────────────────────────────────────────────────────

export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

// ── DetailGrid ────────────────────────────────────────────────────────────────

export function DetailGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">{children}</div>
}

// ── DetailField ───────────────────────────────────────────────────────────────

export function DetailField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-0.5">
        {label}
      </div>
      <div className="text-sm text-gray-900">{value ?? '—'}</div>
    </div>
  )
}

// ── BackLink ──────────────────────────────────────────────────────────────────

export function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="text-sm text-cm-green hover:underline flex items-center gap-1 mb-4"
      onClick={onClick}
    >
      ← {label}
    </button>
  )
}
