/**
 * smartProductExcel.ts — builds a two-sheet "Calculator + Upload" Excel workbook
 * for CM Product (tabCM Product) bulk import/export.
 *
 * Sheet A  "Calculator"
 *   Human-readable headers grouped by section.
 *   Input columns hold product data.
 *   Computed columns (labeled ">> …") have Excel formulas so the user can
 *   verify what the server will compute on save.
 *
 * Sheet B  "Upload"
 *   Headers = exact CM Product field names (for Frappe Data Import).
 *   Every input cell references the matching Calculator cell.
 *   Does NOT include computed/read-only fields — only editable inputs.
 *   First column: cm_given_code (= Frappe `name`, used as ID for UPDATE).
 */
import * as XLSX from 'xlsx'

// ── Helpers ───────────────────────────────────────────────────────────────────

function colLetter(idx: number): string {
  let s = ''
  let n = idx
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  }
  return s
}

function cr(colIdx: number, row: number): string {
  return `${colLetter(colIdx)}${row}`
}

// ── Column definitions ────────────────────────────────────────────────────────

type ColType = 'input' | 'calc' | 'stock'

interface CalcColumn {
  /** Field name (from server) or internal calc id (prefixed with _) */
  id: string
  /** Human-readable header for Calculator sheet */
  label: string
  type: ColType
}

/**
 * All columns that appear in the Calculator sheet.
 * Input  → editable data cell
 * Calc   → Excel formula, NOT imported back to server
 * Stock  → static read-only stock figure from server, NOT imported
 */
const CALC_LAYOUT: CalcColumn[] = [
  // ── Identity ────────────────────────────────────────────────────────────
  { id: 'cm_given_code',             label: 'Product Code (ID)',       type: 'input' },
  { id: 'item_name',                 label: 'Supplier Product Name',   type: 'input' },
  { id: 'cm_given_name',             label: 'CM Name',                 type: 'input' },
  { id: 'cm_description_line_1',     label: 'Description Line 1',      type: 'input' },
  { id: 'cm_description_line_2',     label: 'Description Line 2',      type: 'input' },
  { id: 'image',                     label: 'Image URL',               type: 'input' },
  { id: 'item_group',                label: 'Product Group',           type: 'input' },
  { id: 'stock_uom',                 label: 'UOM',                     type: 'input' },
  { id: 'is_stock_item',             label: 'Stock Item (1/0)',        type: 'input' },
  { id: 'disabled',                  label: 'Disabled (1/0)',          type: 'input' },
  { id: 'cm_product_type',           label: 'Product Type',            type: 'input' },
  { id: 'cm_hidden_from_catalogue',  label: 'Hidden (1/0)',            type: 'input' },
  { id: 'cm_tiles_per_box',          label: 'Tiles/Box',               type: 'input' },
  { id: 'cm_sqm_per_box',            label: 'Sqm/Box',                 type: 'input' },
  // ── Supplier ─────────────────────────────────────────────────────────────
  { id: 'cm_supplier_name',          label: 'Supplier Name',           type: 'input' },
  { id: 'cm_supplier_code',          label: 'Supplier Code',           type: 'input' },
  // ── Cost Inputs ───────────────────────────────────────────────────────────
  { id: 'cm_purchase_price_ex_vat',  label: 'Purchase Price (ex VAT)', type: 'input' },
  { id: 'cm_shipping_percent',       label: 'Shipping %',              type: 'input' },
  { id: 'cm_shipping_fee',           label: 'Shipping Fee',            type: 'input' },
  { id: 'cm_handling_fee',           label: 'Handling Fee',            type: 'input' },
  { id: 'cm_other_landed',           label: 'Other Landed',            type: 'input' },
  { id: 'cm_delivery_installation_fee', label: 'Delivery & Install',   type: 'input' },
  // ── Cost Computed (Excel preview) ─────────────────────────────────────────
  { id: '_landed_total',             label: '>> Landed Total (ex VAT)', type: 'calc' },
  { id: '_cost_calc',                label: '>> Total Cost (ex VAT)',   type: 'calc' },
  // ── Pricing Inputs ────────────────────────────────────────────────────────
  { id: 'cm_vat_rate_percent',       label: 'VAT Rate %',              type: 'input' },
  { id: 'cm_target_margin_percent',  label: 'Target Margin %',         type: 'input' },
  { id: 'cm_rrp_ex_vat',             label: 'RRP (ex VAT)',            type: 'input' },
  { id: 'cm_rrp_manual_override',    label: 'RRP Manual Override (1/0)', type: 'input' },
  // ── RRP Computed ─────────────────────────────────────────────────────────
  { id: '_rrp_inc',                  label: '>> RRP (inc VAT)',         type: 'calc' },
  // ── Offer Tier Inputs ─────────────────────────────────────────────────────
  { id: 'cm_offer_tier1_inc_vat',    label: 'Tier 1 Offer (inc VAT)',  type: 'input' },
  { id: 'cm_offer_tier2_inc_vat',    label: 'Tier 2 Offer (inc VAT)',  type: 'input' },
  { id: 'cm_offer_tier3_inc_vat',    label: 'Tier 3 Offer (inc VAT)',  type: 'input' },
  // ── Tier Computed ────────────────────────────────────────────────────────
  { id: '_t1_ex',                    label: '>> T1 (ex VAT)',           type: 'calc' },
  { id: '_t1_disc',                  label: '>> T1 Discount %',         type: 'calc' },
  { id: '_t2_ex',                    label: '>> T2 (ex VAT)',           type: 'calc' },
  { id: '_t2_disc',                  label: '>> T2 Discount %',         type: 'calc' },
  { id: '_t3_ex',                    label: '>> T3 (ex VAT)',           type: 'calc' },
  { id: '_t3_disc',                  label: '>> T3 Discount %',         type: 'calc' },
  // ── Profitability Computed ────────────────────────────────────────────────
  { id: '_profit',                   label: '>> Profit (ex VAT)',       type: 'calc' },
  { id: '_margin',                   label: '>> Margin %',              type: 'calc' },
  { id: '_markup',                   label: '>> Markup %',              type: 'calc' },
  // ── Stock (read-only, not imported) ───────────────────────────────────────
  { id: 'free_stock',                label: 'Free Stock',               type: 'stock' },
]

// Build field → column-index lookup once
const _colIdx: Record<string, number> = {}
CALC_LAYOUT.forEach((col, i) => { _colIdx[col.id] = i })

function getFormula(id: string, row: number): string {
  const c = (fieldId: string) => cr(_colIdx[fieldId], row)
  const VAT = c('cm_vat_rate_percent')
  const PURCHASE = c('cm_purchase_price_ex_vat')

  switch (id) {
    // Cost
    case '_landed_total':
      return `ROUND(${PURCHASE}*${c('cm_shipping_percent')}/100+${c('cm_shipping_fee')}+${c('cm_handling_fee')}+${c('cm_other_landed')}+${c('cm_delivery_installation_fee')},2)`
    case '_cost_calc':
      return `ROUND(${PURCHASE}+${c('_landed_total')},2)`
    // RRP
    case '_rrp_inc':
      return `ROUND(${c('cm_rrp_ex_vat')}*(1+${VAT}/100),2)`
    // Tier 1
    case '_t1_ex':
      return `ROUND(${c('cm_offer_tier1_inc_vat')}/(1+${VAT}/100),2)`
    case '_t1_disc':
      return `IF(${c('_rrp_inc')}>0,ROUND((1-${c('cm_offer_tier1_inc_vat')}/${c('_rrp_inc')})*100,3),0)`
    // Tier 2
    case '_t2_ex':
      return `ROUND(${c('cm_offer_tier2_inc_vat')}/(1+${VAT}/100),2)`
    case '_t2_disc':
      return `IF(${c('_rrp_inc')}>0,ROUND((1-${c('cm_offer_tier2_inc_vat')}/${c('_rrp_inc')})*100,3),0)`
    // Tier 3
    case '_t3_ex':
      return `ROUND(${c('cm_offer_tier3_inc_vat')}/(1+${VAT}/100),2)`
    case '_t3_disc':
      return `IF(${c('_rrp_inc')}>0,ROUND((1-${c('cm_offer_tier3_inc_vat')}/${c('_rrp_inc')})*100,3),0)`
    // Profitability
    case '_profit':
      return `ROUND(${c('_t1_ex')}-${c('_cost_calc')},2)`
    case '_margin':
      return `IF(${c('_t1_ex')}>0,ROUND(${c('_profit')}/${c('_t1_ex')}*100,3),0)`
    case '_markup':
      return `IF(${c('_cost_calc')}>0,ROUND(${c('_profit')}/${c('_cost_calc')}*100,3),0)`
    default:
      return ''
  }
}

// ── Upload sheet: editable input fields only ─────────────────────────────────
// These become the column headers that Frappe Data Import reads.
// cm_given_code is the Frappe autoname field — used as ID for UPDATE operations.

const UPLOAD_FIELDS = [
  'cm_given_code',            // identifier (leave blank for INSERT, required for UPDATE)
  'item_name',
  'cm_given_name',
  'cm_description_line_1',
  'cm_description_line_2',
  'image',
  'item_group',
  'stock_uom',
  'is_stock_item',
  'disabled',
  'cm_product_type',
  'cm_hidden_from_catalogue',
  'cm_tiles_per_box',
  'cm_sqm_per_box',
  'cm_supplier_name',
  'cm_supplier_code',
  'cm_purchase_price_ex_vat',
  'cm_shipping_percent',
  'cm_shipping_fee',
  'cm_handling_fee',
  'cm_other_landed',
  'cm_delivery_installation_fee',
  'cm_vat_rate_percent',
  'cm_target_margin_percent',
  'cm_rrp_ex_vat',
  'cm_rrp_manual_override',
  'cm_offer_tier1_inc_vat',
  'cm_offer_tier2_inc_vat',
  'cm_offer_tier3_inc_vat',
]

// For the export we receive `name` from the server (= cm_given_code).
// Remap so the row lookup works correctly.
function getCalcValue(item: Record<string, unknown>, fieldId: string): unknown {
  if (fieldId === 'cm_given_code') return item['name'] ?? ''
  return item[fieldId] ?? ''
}

// ── Workbook builder ──────────────────────────────────────────────────────────

export function buildSmartWorkbook(items: Record<string, unknown>[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  const dataRows = items.length > 0 ? items : null
  const rowCount = dataRows ? dataRows.length : 1  // at least 1 blank row for templates

  // ── Sheet A: Calculator ───────────────────────────────────────────────────
  const wsCalc: XLSX.WorkSheet = {}
  const calcColCount = CALC_LAYOUT.length

  // Header row
  CALC_LAYOUT.forEach((col, ci) => {
    wsCalc[`${colLetter(ci)}1`] = { v: col.label, t: 's' }
  })

  // Data rows
  for (let ri = 0; ri < rowCount; ri++) {
    const row = ri + 2   // Excel row 2 is first data row
    const item = dataRows ? dataRows[ri] : null

    CALC_LAYOUT.forEach((col, ci) => {
      const cellRef = `${colLetter(ci)}${row}`
      if (col.type === 'calc') {
        const formula = getFormula(col.id, row)
        wsCalc[cellRef] = formula ? { f: formula } : { v: '', t: 's' }
      } else {
        const val = item ? getCalcValue(item, col.id) : ''
        if (val === '' || val === null || val === undefined) {
          wsCalc[cellRef] = { v: '', t: 's' }
        } else if (typeof val === 'number') {
          wsCalc[cellRef] = { v: val, t: 'n' }
        } else {
          wsCalc[cellRef] = { v: String(val), t: 's' }
        }
      }
    })
  }

  wsCalc['!ref'] = `A1:${colLetter(calcColCount - 1)}${rowCount + 1}`
  wsCalc['!cols'] = CALC_LAYOUT.map((col) => ({
    wch: Math.max(col.label.length + 2, 14),
  }))

  XLSX.utils.book_append_sheet(wb, wsCalc, 'Calculator')

  // ── Sheet B: Upload ───────────────────────────────────────────────────────
  const wsUpload: XLSX.WorkSheet = {}
  const uploadColCount = UPLOAD_FIELDS.length

  // Header row
  UPLOAD_FIELDS.forEach((field, ci) => {
    wsUpload[`${colLetter(ci)}1`] = { v: field, t: 's' }
  })

  // Data rows: each cell references the corresponding Calculator cell
  for (let ri = 0; ri < rowCount; ri++) {
    const row = ri + 2
    UPLOAD_FIELDS.forEach((field, ci) => {
      const calcColIdx = _colIdx[field]
      if (calcColIdx !== undefined) {
        wsUpload[`${colLetter(ci)}${row}`] = {
          f: `Calculator!${colLetter(calcColIdx)}${row}`,
        }
      } else {
        wsUpload[`${colLetter(ci)}${row}`] = { v: '', t: 's' }
      }
    })
  }

  wsUpload['!ref'] = `A1:${colLetter(uploadColCount - 1)}${rowCount + 1}`
  wsUpload['!cols'] = UPLOAD_FIELDS.map((field) => ({
    wch: Math.max(field.length + 2, 14),
  }))

  XLSX.utils.book_append_sheet(wb, wsUpload, 'Upload')

  return wb
}

export function downloadSmartWorkbook(
  items: Record<string, unknown>[],
  filename: string,
): void {
  const wb = buildSmartWorkbook(items)
  XLSX.writeFile(wb, filename)
}
