/**
 * ProductCsvImportModal — in-app Excel / CSV bulk import for CM Product (V3).
 *
 * Flow:
 *   1. User picks INSERT or UPDATE mode.
 *   2. User selects (or drops) an Excel or CSV file — validated client-side.
 *   3. Modal creates a Frappe Data Import doc, attaches the file, starts the job.
 *   4. A link to the import job is shown so the user can track progress.
 *
 * Also provides:
 *   — Blank smart template download (Calculator + Upload sheets)
 *   — Full product export (round-trip: export → edit in Excel → import back)
 *   — Recent imports history panel
 *
 * Column identifier: cm_given_code (Frappe autoname field for CM Product).
 *   INSERT mode — leave cm_given_code blank; server auto-generates it.
 *   UPDATE mode — cm_given_code must match an existing product code.
 */
import { useState, useRef, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { frappe } from '../../api/frappe'
import { CM } from '../../components/ui/CMClassNames'
import { CMButton } from '../../components/ui/CMComponents'
import { downloadSmartWorkbook } from '../../utils/smartProductExcel'

// ── Constants ─────────────────────────────────────────────────────────────────

/** All editable CM Product fields that appear in the Upload sheet. */
const CM_PRODUCT_INPUT_FIELDS = [
  'cm_given_code',
  'item_name', 'cm_given_name', 'cm_description_line_1', 'cm_description_line_2',
  'item_group', 'stock_uom', 'is_stock_item', 'disabled', 'cm_product_type',
  'cm_hidden_from_catalogue', 'cm_tiles_per_box', 'cm_sqm_per_box',
  'cm_supplier_name', 'cm_supplier_code',
  'cm_purchase_price_ex_vat', 'cm_shipping_percent', 'cm_shipping_fee',
  'cm_handling_fee', 'cm_other_landed', 'cm_delivery_installation_fee',
  'cm_vat_rate_percent', 'cm_target_margin_percent',
  'cm_rrp_ex_vat', 'cm_rrp_manual_override',
  'cm_offer_tier1_inc_vat', 'cm_offer_tier2_inc_vat', 'cm_offer_tier3_inc_vat',
]

/** Server-computed fields included in the export (read-only, not imported). */
const CM_PRODUCT_COMPUTED_FIELDS = [
  'cm_landed_additions_total_ex_vat', 'cm_cost_ex_vat_calculated',
  'cm_rrp_inc_vat',
  'cm_offer_tier1_ex_vat', 'cm_offer_tier1_discount_pct',
  'cm_offer_tier2_ex_vat', 'cm_offer_tier2_discount_pct',
  'cm_offer_tier3_ex_vat', 'cm_offer_tier3_discount_pct',
  'cm_profit_ex_vat', 'cm_margin_percent', 'cm_markup_percent',
  'free_stock',
]

const ALL_KNOWN_COLUMNS = new Set([
  ...CM_PRODUCT_INPUT_FIELDS,
  ...CM_PRODUCT_COMPUTED_FIELDS,
  // server returns `name` which the Excel builder maps to cm_given_code
  'name',
])

const IMPORT_MODES = [
  {
    value: 'Insert New Records',
    label: 'INSERT — Add new products',
    hint: 'Creates new CM Products. Requires item_name, item_group, stock_uom. Leave cm_given_code blank — the server will auto-generate it.',
  },
  {
    value: 'Update Existing Records',
    label: 'UPDATE — Modify existing products',
    hint: 'Updates existing CM Products by cm_given_code. Only include the columns you want to change.',
  },
]

// ── SheetJS helpers ───────────────────────────────────────────────────────────

interface ParseResult {
  headers: string[]
  rows: unknown[][]
  rowCount: number
}

function parseSpreadsheet(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result as ArrayBuffer, { type: 'array' })
        // Prefer the "Upload" sheet from our smart workbook, else use the first sheet
        const sheetName = wb.SheetNames.includes('Upload')
          ? 'Upload'
          : wb.SheetNames[0]
        const ws = wb.Sheets[sheetName]
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]
        const headers = (data[0] ?? []).map(String)
        const rows = data.slice(1).filter((r) => (r as unknown[]).some((c) => c !== ''))
        resolve({ headers, rows, rowCount: rows.length })
      } catch (err) {
        reject(err)
      }
    }
    reader.readAsArrayBuffer(file)
  })
}

interface ValidationResult {
  errors: string[]
  warnings: string[]
  rowCount: number
}

async function validateFile(file: File, importMode: string): Promise<ValidationResult> {
  const errors: string[] = []
  const warnings: string[] = []
  let rowCount = 0
  try {
    const { headers, rows } = await parseSpreadsheet(file)
    rowCount = rows.length

    if (importMode === 'Insert New Records') {
      for (const col of ['item_name', 'item_group', 'stock_uom'] as const) {
        if (!headers.includes(col)) errors.push(`Missing required column: "${col}"`)
      }
    } else {
      if (!headers.includes('cm_given_code')) {
        errors.push('Missing required column: "cm_given_code" (needed to identify existing records for UPDATE)')
      }
    }

    for (const h of headers) {
      if (h && !ALL_KNOWN_COLUMNS.has(h)) {
        warnings.push(`Unrecognised column: "${h}" — check for typos`)
      }
    }

    const codeIdx = headers.indexOf('cm_given_code')
    if (importMode === 'Update Existing Records' && codeIdx !== -1) {
      const codes = rows.map((r) => String((r as unknown[])[codeIdx] ?? ''))
      const emptyCount = codes.filter((c) => !c).length
      if (emptyCount > 0)
        errors.push(`${emptyCount} row${emptyCount > 1 ? 's' : ''} with an empty cm_given_code`)
      const seen = new Set<string>()
      const dupes = new Set<string>()
      for (const c of codes) {
        if (c && seen.has(c)) dupes.add(c)
        seen.add(c)
      }
      if (dupes.size > 0) {
        const sample = [...dupes].slice(0, 3).join(', ')
        errors.push(`Duplicate cm_given_code: ${sample}${dupes.size > 3 ? ' …' : ''}`)
      }
    }
  } catch {
    errors.push('Could not parse file — is it a valid .xlsx, .xls, or .csv?')
  }
  return { errors, warnings, rowCount }
}

// ── Import history panel ──────────────────────────────────────────────────────

interface DataImportRow {
  name: string
  import_type: string
  status: string
  creation: string
}

function ImportHistory() {
  const [imports, setImports] = useState<DataImportRow[] | null>(null)

  useEffect(() => {
    frappe
      .getList<DataImportRow>('Data Import', {
        fields: ['name', 'import_type', 'status', 'creation'],
        filters: [['reference_doctype', '=', 'CM Product']],
        order_by: 'creation desc',
        limit: 5,
      })
      .then((rows) => setImports(rows ?? []))
      .catch(() => setImports([]))
  }, [])

  if (imports === null) {
    return <div className="text-xs text-gray-400 text-center py-2">Loading…</div>
  }
  if (imports.length === 0) {
    return (
      <div className="text-xs text-gray-400 text-center py-2">No previous imports found.</div>
    )
  }

  const statusStyle: Record<string, string> = {
    Success: 'text-green-700 bg-green-50 border-green-200',
    'Partial Success': 'text-yellow-700 bg-yellow-50 border-yellow-200',
    Failed: 'text-red-700 bg-red-50 border-red-200',
  }

  return (
    <ul className="space-y-1.5">
      {imports.map((imp) => {
        const style = statusStyle[imp.status] ?? 'text-gray-600 bg-gray-50 border-gray-200'
        const date = new Date(imp.creation).toLocaleString('en-GB', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
        return (
          <li key={imp.name}>
            <a
              href={`/app/data-import/${encodeURIComponent(imp.name)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2 text-xs hover:border-indigo-200 hover:bg-indigo-50 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style}`}
                >
                  {imp.status ?? 'Pending'}
                </span>
                <span className="truncate text-gray-700 font-medium">{imp.name}</span>
              </div>
              <span className="shrink-0 text-[11px] text-gray-400">{date}</span>
            </a>
          </li>
        )
      })}
    </ul>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'validating' | 'ready' | 'uploading' | 'done' | 'error'

export function ProductCsvImportModal({ onClose }: { onClose: () => void }) {
  const [importType, setImportType] = useState('Insert New Records')
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [importName, setImportName] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [exportBusy, setExportBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  /** Download a blank smart template (Calculator + Upload sheets, no data rows). */
  function downloadTemplate() {
    downloadSmartWorkbook([], 'cm_products_template.xlsx')
  }

  /** Export all current CM Products to the smart workbook (round-trip). */
  async function handleExport() {
    setExportBusy(true)
    try {
      const items = await frappe.call<Record<string, unknown>[]>(
        'casamoderna_dms.api.products_export.get_unified_product_data',
      )
      const date = new Date().toISOString().slice(0, 10)
      downloadSmartWorkbook(items ?? [], `cm_products_export_${date}.xlsx`)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExportBusy(false)
    }
  }

  async function acceptFile(f: File | undefined) {
    if (!f) return
    setFile(f)
    setValidation(null)
    setErrorMsg(null)
    setPhase('validating')
    const result = await validateFile(f, importType)
    setValidation(result)
    setPhase('ready')
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    void acceptFile(e.target.files?.[0])
  }
  function onDragOver(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(true)
  }
  function onDragLeave() {
    setDragOver(false)
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    void acceptFile(e.dataTransfer.files?.[0])
  }

  // Re-validate when import mode changes
  useEffect(() => {
    if (!file || phase === 'idle' || phase === 'uploading' || phase === 'done') return
    setValidation(null)
    setPhase('validating')
    void validateFile(file, importType).then((result) => {
      setValidation(result)
      setPhase('ready')
    })
  }, [importType]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file || (validation?.errors?.length ?? 0) > 0) return
    setPhase('uploading')
    setErrorMsg(null)
    try {
      // 1. Create Data Import doc
      const importDoc = await frappe.saveDoc<{ name: string }>('Data Import', {
        reference_doctype: 'CM Product',
        import_type: importType,
      })
      // 2. Upload the file (prefer Upload sheet — the modal reads that sheet for validation,
      //    and Frappe Data Import will use the first sheet of the file, so we need to extract
      //    the Upload sheet into a plain file when uploading)
      const uploadFile = await extractUploadSheet(file)
      await frappe.uploadFile(uploadFile, {
        doctype: 'Data Import',
        docname: importDoc.name,
        fieldname: 'import_file',
        isPrivate: true,
      })
      // 3. Start the import job
      await frappe.call('frappe.core.doctype.data_import.data_import.form_start_import', {
        data_import: importDoc.name,
      })
      setImportName(importDoc.name)
      setPhase('done')
    } catch (err) {
      setErrorMsg(
        (err as { userMessage?: string; message?: string }).userMessage ||
          (err instanceof Error ? err.message : 'Import failed. Check that your file uses the correct column headers and all referenced Item Groups / UOMs already exist in the system.'),
      )
      setPhase('error')
    }
  }

  const busy = phase === 'uploading'
  const hasErrors = (validation?.errors?.length ?? 0) > 0
  const hasWarnings = (validation?.warnings?.length ?? 0) > 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="font-semibold text-gray-900">Bulk Import / Export Products (Excel)</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Download a template or export current products, edit in Excel, then upload back.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Templates & Export */}
          <div>
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
              Step 1 — Get the file
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={downloadTemplate}
                className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-3 text-center hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
              >
                <span className="text-xl">📋</span>
                <span className="text-[12px] font-semibold text-gray-700">Blank Template</span>
                <span className="text-[11px] text-gray-400">Calculator + Upload sheets</span>
              </button>
              <button
                type="button"
                onClick={() => void handleExport()}
                disabled={exportBusy}
                className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-indigo-300 bg-indigo-50 px-3 py-3 text-center hover:border-indigo-400 hover:bg-indigo-100 transition-colors disabled:opacity-50"
              >
                <span className="text-xl">{exportBusy ? '⏳' : '📤'}</span>
                <span className="text-[12px] font-semibold text-indigo-700">
                  {exportBusy ? 'Exporting…' : 'Export All Products'}
                </span>
                <span className="text-[11px] text-indigo-400">Edit then upload back</span>
              </button>
            </div>
            <div className="mt-2 rounded bg-blue-50 border border-blue-100 px-3 py-2 text-[11px] text-blue-700 space-y-0.5">
              <p><strong>Calculator sheet</strong> — fill in your data; formula columns preview computed values.</p>
              <p><strong>Upload sheet</strong> — links back to Calculator; this is what gets imported. Do not edit it directly.</p>
            </div>
          </div>

          {/* Import mode */}
          <div>
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
              Step 2 — Choose import mode
            </div>
            <div className="space-y-2">
              {IMPORT_MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => setImportType(mode.value)}
                  className={`w-full text-left rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                    importType === mode.value
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium text-gray-900">{mode.label}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">{mode.hint}</div>
                </button>
              ))}
            </div>
          </div>

          {/* File drop zone */}
          {phase !== 'done' && (
            <div>
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                Step 3 — Upload your file
              </div>
              <div
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => !file && fileRef.current?.click()}
                className={[
                  'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors select-none',
                  file
                    ? 'cursor-default border-indigo-300 bg-indigo-50'
                    : 'cursor-pointer hover:border-gray-300 hover:bg-gray-50',
                  dragOver ? 'border-indigo-400 bg-indigo-50' : file ? '' : 'border-gray-200 bg-gray-50',
                ].join(' ')}
              >
                {file ? (
                  <>
                    <span className="text-2xl">📄</span>
                    <div className="text-sm font-medium text-indigo-700 truncate max-w-full px-2">
                      {file.name}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      {(file.size / 1024).toFixed(1)} KB
                      {validation?.rowCount != null &&
                        ` · ${validation.rowCount} data row${validation.rowCount === 1 ? '' : 's'}`}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setFile(null)
                        setValidation(null)
                        setPhase('idle')
                        if (fileRef.current) fileRef.current.value = ''
                      }}
                      className="text-[11px] text-red-500 hover:text-red-700 underline"
                    >
                      Remove
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-2xl">📂</span>
                    <div className="text-sm font-medium text-gray-600">
                      Drop Excel or CSV here or{' '}
                      <span className="text-indigo-600 underline">click to browse</span>
                    </div>
                    <div className="text-[11px] text-gray-400">.xlsx, .xls, .csv</div>
                  </>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={onInputChange}
              />
            </div>
          )}

          {/* Validation feedback */}
          {phase === 'validating' && (
            <div className="flex items-center gap-2 text-xs text-gray-500 px-1">
              <div className="h-3 w-3 rounded-full border-2 border-gray-400 border-t-transparent animate-spin shrink-0" />
              Validating file…
            </div>
          )}
          {phase === 'ready' && validation && (
            <div className="space-y-1.5">
              {validation.errors.map((msg, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
                >
                  <span className="shrink-0 mt-0.5">✖</span> {msg}
                </div>
              ))}
              {validation.warnings.map((msg, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-700"
                >
                  <span className="shrink-0 mt-0.5">⚠</span> {msg}
                </div>
              ))}
              {!hasErrors && !hasWarnings && (
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
                  <span>✔</span> File looks good — {validation.rowCount} row
                  {validation.rowCount === 1 ? '' : 's'} ready to import
                </div>
              )}
              {!hasErrors && hasWarnings && (
                <div className="text-[11px] text-gray-500 px-1">
                  Warnings won't block the import — verify the column names are correct.
                </div>
              )}
            </div>
          )}

          {phase === 'uploading' && (
            <div className="flex items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3">
              <div className="h-4 w-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin shrink-0" />
              <div className="text-sm text-indigo-700">Uploading and starting import job…</div>
            </div>
          )}

          {phase === 'done' && importName && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-4 space-y-2">
              <div className="flex items-center gap-2 text-green-800 font-semibold text-sm">
                <span>✅</span> Import job started
              </div>
              <p className="text-xs text-green-700">
                Your file has been uploaded and the import is running. Open the link below to track
                progress and review any row-level errors.
              </p>
              <a
                href={`/app/data-import/${encodeURIComponent(importName)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 underline hover:text-indigo-900"
              >
                View import job: {importName} ↗
              </a>
            </div>
          )}

          {phase === 'error' && errorMsg && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <span className="font-semibold">Error: </span>
              {errorMsg}
            </div>
          )}

          {/* Recent imports */}
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Recent Imports
            </div>
            <ImportHistory />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-5 py-4">
          <a
            href="/app/data-import?reference_doctype=CM+Product"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-400 hover:text-indigo-600 hover:underline"
          >
            Open full Frappe import tool ↗
          </a>
          <div className="flex items-center gap-2">
            <CMButton variant="ghost" onClick={onClose}>
              {phase === 'done' ? 'Close' : 'Cancel'}
            </CMButton>
            {phase !== 'done' && (
              <CMButton
                onClick={(e) => void handleSubmit(e as unknown as React.FormEvent)}
                disabled={!file || busy || phase === 'validating' || hasErrors}
              >
                {busy ? 'Importing…' : 'Start Import'}
              </CMButton>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Helper: extract Upload sheet into a plain CSV/XLSX for Frappe Data Import ─
// Frappe Data Import reads the FIRST sheet of the uploaded file.
// Our smart workbook has Sheet 1 = Calculator (with helper formula columns).
// We extract Sheet 2 = Upload (input fields only) into a single-sheet workbook.

async function extractUploadSheet(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result as ArrayBuffer, { type: 'array' })

        // If the file already has an "Upload" sheet, extract it
        if (wb.SheetNames.includes('Upload')) {
          const ws = wb.Sheets['Upload']
          const newWb = XLSX.utils.book_new()
          XLSX.utils.book_append_sheet(newWb, ws, 'Upload')
          const buf = XLSX.write(newWb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
          const blob = new Blob([buf], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          })
          const ext = file.name.endsWith('.xlsx') ? '.xlsx' : '.xlsx'
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, ext), { type: blob.type }))
        } else {
          // Plain CSV / single-sheet file — use as-is
          resolve(file)
        }
      } catch {
        // Fallback: just use the original file
        resolve(file)
      }
    }
    reader.readAsArrayBuffer(file)
  })
}
