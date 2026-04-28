/**
 * ProductCsvImportModal — in-app Excel / CSV bulk import for the Item (Product) doctype (V3).
 *
 * Flow:
 *   1. User picks INSERT or UPDATE mode.
 *   2. User selects (or drops) an Excel or CSV file — validated client-side immediately.
 *   3. Modal creates an ERPNext Data Import doc, attaches the file, and starts the job.
 *   4. A link to the import job is shown so the user can track progress.
 *
 * Also provides:
 *   — Primary and Secondary product Excel template downloads (SheetJS)
 *   — Excel export of current products (round-trip support)
 *   — Recent imports history panel
 */
import { useState, useRef, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { frappe } from '../../api/frappe'
import { CM } from '../../components/ui/CMClassNames'
import { CMButton } from '../../components/ui/CMComponents'
import { downloadSmartWorkbook } from '../../utils/smartProductExcel'

// ── Field sets ────────────────────────────────────────────────────────────────

const PRIMARY_FIELDS = [
  'item_code', 'item_name', 'cm_given_name', 'cm_description_line_1', 'cm_description_line_2',
  'item_group', 'brand', 'stock_uom', 'is_stock_item', 'disabled', 'cm_product_type',
  'cm_hidden_from_catalogue', 'cm_supplier_code', 'cm_supplier_name', 'cm_supplier_item_code',
  'cm_supplier_item_name', 'cm_supplier_variant_description', 'cm_supplier_currency',
  'cm_supplier_pack', 'lead_time_days', 'image', 'cm_rrp_ex_vat', 'cm_vat_rate_percent',
  'cm_discount_target_percent', 'cm_pricing_rounding_mode', 'cm_purchase_price_ex_vat',
  'cm_increase_before_percent', 'cm_discount_1_percent', 'cm_discount_2_percent',
  'cm_discount_3_percent', 'cm_increase_after_percent', 'cm_shipping_percent', 'cm_shipping_fee',
  'cm_handling_fee', 'cm_other_landed', 'cm_tiles_per_box', 'cm_sqm_per_box',
  'cm_product_code', 'cm_family_code', 'cm_finish_code', 'cm_role_name', 'cm_variant',
  'cm_dimensions', 'cm_weight_factor',
]

const SECONDARY_FIELDS = [
  'item_code', 'item_name', 'item_group', 'stock_uom', 'cm_product_type',
  'cm_hidden_from_catalogue', 'cm_supplier_name', 'cm_supplier_item_code', 'cm_cost_ex_vat',
]

const COMPUTED_OUTPUT_FIELDS = [
  'cm_rrp_inc_vat', 'cm_final_offer_inc_vat', 'cm_final_offer_ex_vat', 'cm_discount_percent',
  'cm_cost_ex_vat_calculated', 'cm_landed_additions_total_ex_vat', 'cm_profit_ex_vat',
  'cm_margin_percent', 'cm_markup_percent', 'cm_supplier_list_price_ex_vat',
  'cm_after_increase_before_ex_vat', 'cm_after_discount_1_ex_vat', 'cm_after_discount_2_ex_vat',
  'cm_after_discount_3_ex_vat', 'cm_cost_ex_vat',
]

const STOCK_FIELDS = ['total_actual_qty', 'total_reserved_qty', 'total_ordered_qty', 'total_projected_qty']
const UNIFIED_EXPORT_FIELDS = [...PRIMARY_FIELDS, ...COMPUTED_OUTPUT_FIELDS, ...STOCK_FIELDS]
const REQUIRED_COLUMNS = ['item_code', 'item_name', 'item_group', 'stock_uom']
const ALL_KNOWN_COLUMNS = new Set(UNIFIED_EXPORT_FIELDS)

const IMPORT_MODES = [
  {
    value: 'Insert New Records',
    label: 'INSERT — Add new products',
    hint: 'Creates new Item records. Requires item_code, item_name, item_group, stock_uom.',
  },
  {
    value: 'Update Existing Records',
    label: 'UPDATE — Modify existing products',
    hint: 'Updates existing Items by item_code. Only include columns you want to change.',
  },
]

// ── SheetJS helpers ──────────────────────────────────────────────────────────

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
        const ws = wb.Sheets[wb.SheetNames[0]]
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

function downloadXLSX(aoaData: unknown[][], sheetName: string, filename: string): void {
  const ws = XLSX.utils.aoa_to_sheet(aoaData)
  if (aoaData[0]) {
    ws['!cols'] = (aoaData[0] as unknown[]).map((h) => ({
      wch: Math.max(String(h).length + 4, 14),
    }))
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, filename)
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
      for (const col of REQUIRED_COLUMNS) {
        if (!headers.includes(col)) errors.push(`Missing required column: "${col}"`)
      }
    } else {
      if (!headers.includes('item_code'))
        errors.push('Missing required column: "item_code" (needed to match existing records)')
    }
    for (const h of headers) {
      if (h && !ALL_KNOWN_COLUMNS.has(h)) warnings.push(`Unrecognised column: "${h}" — check for typos`)
    }
    const itemCodeIdx = headers.indexOf('item_code')
    if (itemCodeIdx !== -1) {
      const codes = rows.map((r) => String((r as unknown[])[itemCodeIdx] ?? ''))
      const emptyCount = codes.filter((c) => !c).length
      if (emptyCount > 0)
        errors.push(`${emptyCount} row${emptyCount > 1 ? 's' : ''} with an empty item_code`)
      const seen = new Set<string>()
      const dupes = new Set<string>()
      for (const c of codes) {
        if (c && seen.has(c)) dupes.add(c)
        seen.add(c)
      }
      if (dupes.size > 0) {
        const sample = [...dupes].slice(0, 3).join(', ')
        errors.push(`Duplicate item_code: ${sample}${dupes.size > 3 ? ' …' : ''}`)
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
        filters: [['reference_doctype', '=', 'Item']],
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

  function downloadTemplate(type: 'primary' | 'secondary') {
    if (type === 'primary') {
      downloadSmartWorkbook([], 'products_smart_template.xlsx')
      return
    }
    const exampleValues: Record<string, string> = {
      item_code: 'SKU-001', item_name: 'Example Product', item_group: 'Chairs',
      stock_uom: 'Nos', cm_product_type: 'Secondary', cm_hidden_from_catalogue: '0',
      cm_supplier_name: 'Acme Supplies', cm_supplier_item_code: 'ACME-001', cm_cost_ex_vat: '80.00',
    }
    const exampleRow = SECONDARY_FIELDS.map((f) => exampleValues[f] ?? '')
    downloadXLSX([SECONDARY_FIELDS, exampleRow], 'Products', 'products_import_template_secondary.xlsx')
  }

  async function handleExport() {
    setExportBusy(true)
    try {
      const items = await frappe.call<Record<string, unknown>[]>(
        'casamoderna_dms.api.products_export.get_unified_product_data',
      )
      const date = new Date().toISOString().slice(0, 10)
      downloadSmartWorkbook(items ?? [], `products_smart_export_${date}.xlsx`)
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
      const importDoc = await frappe.saveDoc<{ name: string }>('Data Import', {
        reference_doctype: 'Item',
        import_type: importType,
      })
      await frappe.uploadFile(file, {
        doctype: 'Data Import',
        docname: importDoc.name,
        fieldname: 'import_file',
        isPrivate: true,
      })
      await frappe.call('frappe.core.doctype.data_import.data_import.form_start_import', {
        data_import: importDoc.name,
      })
      setImportName(importDoc.name)
      setPhase('done')
    } catch (err) {
      setErrorMsg(
        (err as { userMessage?: string; message?: string }).userMessage ||
          (err instanceof Error ? err.message : 'Import failed. Check that your file uses the correct column headers, all required fields (item_code, item_name, item_group, stock_uom) are present, and referenced Item Groups / UOMs already exist in the system.'),
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
            <h2 className="font-semibold text-gray-900">Bulk Import Products (Excel / CSV)</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Upload an Excel (.xlsx) or CSV file to add or update products in the catalogue.
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
          {/* Import mode */}
          <div>
            <label className={CM.label}>
              Import Mode <span className="text-red-500">*</span>
            </label>
            <div className="mt-1 space-y-2">
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

          {/* Templates + Export */}
          <div>
            <div className="text-xs font-medium text-gray-600 mb-1.5">Templates &amp; Export</div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => downloadTemplate('primary')}
                className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-2 py-2.5 text-center hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
              >
                <span className="text-base">⬇</span>
                <span className="text-[11px] font-medium text-gray-700">Smart template</span>
                <span className="text-[10px] text-gray-400">Calculator + Upload</span>
              </button>
              <button
                type="button"
                onClick={() => downloadTemplate('secondary')}
                className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-2 py-2.5 text-center hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
              >
                <span className="text-base">⬇</span>
                <span className="text-[11px] font-medium text-gray-700">Secondary template</span>
                <span className="text-[10px] text-gray-400">
                  {SECONDARY_FIELDS.length} fields · xlsx
                </span>
              </button>
              <button
                type="button"
                onClick={() => void handleExport()}
                disabled={exportBusy}
                className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-indigo-300 bg-indigo-50 px-2 py-2.5 text-center hover:border-indigo-400 hover:bg-indigo-100 transition-colors disabled:opacity-50"
              >
                <span className="text-base">{exportBusy ? '⏳' : '⬆'}</span>
                <span className="text-[11px] font-medium text-indigo-700">Smart export</span>
                <span className="text-[10px] text-indigo-400">Calculator + Upload</span>
              </button>
            </div>
          </div>

          {/* File drop zone */}
          {phase !== 'done' && (
            <div>
              <label className={CM.label}>
                File (Excel or CSV) <span className="text-red-500">*</span>
              </label>
              <div
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => !file && fileRef.current?.click()}
                className={[
                  'mt-1 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors select-none',
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
                Your file has been uploaded and the import job is running in the background. Open the
                link below to track progress and review any errors.
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
            href="/app/data-import?reference_doctype=Item"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-400 hover:text-indigo-600 hover:underline"
          >
            Open full ERPNext import tool ↗
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
