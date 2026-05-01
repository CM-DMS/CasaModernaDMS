/**
 * Typeahead — controlled link-field input with async suggestions.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { CM } from '../ui/CMClassNames'

interface TypeaheadProps<T> {
  label?: string
  value: string
  displayValue?: string
  onSearch: (q: string) => Promise<T[]>
  getLabel: (row: T) => string
  getValue: (row: T) => string
  onChange: (value: string, row: T | null) => void
  placeholder?: string
  required?: boolean
  disabled?: boolean
  className?: string
  minSearchLength?: number
}

export function Typeahead<T>({
  label,
  value,
  displayValue,
  onSearch,
  getLabel,
  getValue,
  onChange,
  placeholder = 'Search…',
  required = false,
  disabled = false,
  className = '',
  minSearchLength = 1,
}: TypeaheadProps<T>) {
  const [inputText, setInputText] = useState(displayValue || value || '')
  const [options, setOptions] = useState<T[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setInputText(displayValue || value || '')
  }, [value, displayValue])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (!open || !inputRef.current) return
    const rect = inputRef.current.getBoundingClientRect()
    setDropdownStyle({
      position: 'fixed',
      top: rect.bottom + 2,
      left: rect.left,
      width: rect.width,
      zIndex: 9999,
    })
  }, [open, options])

  const search = useCallback(
    (q: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(async () => {
        if (q.length < minSearchLength) {
          setOptions([])
          setOpen(false)
          return
        }
        setLoading(true)
        try {
          const rows = await onSearch(q)
          setOptions(Array.isArray(rows) ? rows.slice(0, 15) : [])
          setOpen(true)
          setHighlight(0)
        } catch {
          setOptions([])
        } finally {
          setLoading(false)
        }
      }, 250)
    },
    [onSearch, minSearchLength],
  )

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value
    setInputText(q)
    if (!q && minSearchLength > 0) {
      onChange('', null)
      setOptions([])
      setOpen(false)
    } else {
      if (!q) onChange('', null)
      search(q)
    }
  }

  const select = (row: T) => {
    setInputText(getLabel(row))
    setOpen(false)
    onChange(getValue(row), row)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, options.length - 1))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (options[highlight]) select(options[highlight])
    }
    if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <label className={CM.label}>
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <input
        ref={inputRef}
        type="text"
        className={CM.input + (disabled ? ' cursor-not-allowed' : '')}
        value={inputText}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (minSearchLength === 0) search('')
          else if (options.length) setOpen(true)
        }}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
      />
      {loading && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 mt-2.5">
          <div className="h-3 w-3 rounded-full border-2 border-cm-green border-t-transparent animate-spin" />
        </div>
      )}
      {open &&
        options.length > 0 &&
        createPortal(
          <ul
            style={dropdownStyle}
            className="max-h-96 overflow-y-auto bg-white border border-gray-200 rounded shadow-lg text-sm"
          >
            {options.map((row, i) => (
              <li
                key={getValue(row)}
                onMouseDown={() => select(row)}
                className={`px-3 py-2 cursor-pointer truncate ${
                  i === highlight ? 'bg-cm-green text-white' : 'hover:bg-gray-50 text-gray-800'
                }`}
              >
                {getLabel(row)}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  )
}
