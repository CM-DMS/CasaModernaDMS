/**
 * CustomerSelectorModal — search and pick a customer.
 * TypeScript port of V2 CustomerSelectorModal.jsx.
 * Uses frappe.getList directly (no separate customersApi in V3).
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { frappe } from '../../api/frappe'
import { CM } from '../ui/CMClassNames'

interface CustomerRow {
  name: string
  customer_name: string
  cm_mobile?: string
  cm_bill_locality?: string
  cm_bill_postcode?: string
  cm_vat_no?: string
}

const CUSTOMER_FIELDS = [
  'name',
  'customer_name',
  'cm_mobile',
  'cm_bill_locality',
  'cm_bill_postcode',
  'cm_vat_no',
]

function CustomerCard({
  customer,
  onSelect,
}: {
  customer: CustomerRow
  onSelect: (c: CustomerRow) => void
}) {
  const addr = [customer.cm_bill_locality, customer.cm_bill_postcode].filter(Boolean).join(', ')
  return (
    <button
      type="button"
      className="w-full text-left p-3 rounded border border-gray-200 hover:border-cm-green hover:bg-green-50 transition-colors"
      onClick={() => onSelect(customer)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900 truncate">{customer.customer_name}</div>
          <div className="text-[11px] text-gray-500 truncate">{customer.name}</div>
        </div>
        {customer.cm_mobile && (
          <div className="text-[11px] text-gray-500 flex-shrink-0">{customer.cm_mobile}</div>
        )}
      </div>
      {(addr || customer.cm_vat_no) && (
        <div className="mt-1 flex gap-3 text-[11px] text-gray-400">
          {addr && <span>{addr}</span>}
          {customer.cm_vat_no && <span>VAT: {customer.cm_vat_no}</span>}
        </div>
      )}
    </button>
  )
}

interface CustomerSelectorModalProps {
  isOpen: boolean
  onSelect: (customer: CustomerRow) => void
  onClose: () => void
}

export function CustomerSelectorModal({ isOpen, onSelect, onClose }: CustomerSelectorModalProps) {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<CustomerRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const doSearch = useCallback(async (searchQ: string) => {
    setLoading(true)
    setError(null)
    try {
      const filters: any[][] = []
      if (searchQ.trim()) {
        filters.push(['customer_name', 'like', `%${searchQ}%`])
      }
      const data = await frappe.getList('Customer', {
        fields: CUSTOMER_FIELDS,
        filters: filters.length ? filters : undefined,
        limit: 40,
        order_by: 'customer_name asc',
      })
      setRows(Array.isArray(data) ? data : [])
    } catch (err: any) {
      setError(err.message || 'Search failed')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) {
      setQ('')
      setRows([])
      setError(null)
      return
    }
    setTimeout(() => inputRef.current?.focus(), 50)
    doSearch('')
  }, [isOpen, doSearch])

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQ(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(val), 300)
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
      return
    }
    if (e.key === 'Enter' && rows.length > 0) {
      onSelect(rows[0])
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-700 flex-shrink-0">Select Customer</span>
          <input
            ref={inputRef}
            className={CM.input}
            value={q}
            onChange={handleInput}
            onKeyDown={handleKey}
            placeholder="Search by name, code, or VAT…"
            autoComplete="off"
          />
          <button className={CM.btn.ghost + ' flex-shrink-0'} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 rounded-full border-2 border-cm-green border-t-transparent animate-spin" />
            </div>
          )}
          {error && <div className="text-sm text-red-600 px-1">{error}</div>}
          {!loading && rows.length === 0 && !error && (
            <div className="text-sm text-gray-400 text-center py-6">No customers found.</div>
          )}
          {rows.map((c) => (
            <CustomerCard key={c.name} customer={c} onSelect={onSelect} />
          ))}
        </div>
      </div>
    </div>
  )
}
