/**
 * smartProductExcel.ts — builds a two-sheet "Calculator + Upload" Excel workbook.
 *
 * Sheet A  "Calculator"
 *   Human-readable headers, grouped logically with Excel formula columns.
 *
 * Sheet B  "Upload"
 *   Headers = exact ERPNext field names (for Data Import).
 *   Every cell references the matching input cell in Calculator.
 */
import * as XLSX from 'xlsx'

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── Sheet A column definitions ────────────────────────────────────────────────

interface CalcColumn {
  id: string
  label: string
  type: 'input' | 'calc' | 'stock'
}

const CALC_LAYOUT: CalcColumn[] = [
  // Identity
  { id: 'item_code',                  label: 'Item Code',        type: 'input' },
  { id: 'item_name',                  label: 'Item Name',        type: 'input' },
  { id: 'cm_given_name',              label: 'Given Name',       type: 'input' },
  { id: 'cm_description_line_1',      label: 'Description 1',    type: 'input' },
  { id: 'cm_description_line_2',      label: 'Description 2',    type: 'input' },
  { id: 'item_group',                 label: 'Item Group',       type: 'input' },
  { id: 'brand',                      label: 'Brand',            type: 'input' },
  { id: 'stock_uom',                  label: 'UOM',              type: 'input' },
  { id: 'is_stock_item',              label: 'Stock Item',       type: 'input' },
  { id: 'disabled',                   label: 'Disabled',         type: 'input' },
  { id: 'cm_product_type',            label: 'Product Type',     type: 'input' },
  { id: 'cm_hidden_from_catalogue',   label: 'Hidden',           type: 'input' },
  // Supplier
  { id: 'cm_supplier_code',           label: 'Supplier Code',    type: 'input' },
  { id: 'cm_supplier_name',           label: 'Supplier Name',    type: 'input' },
  { id: 'cm_supplier_item_code',      label: 'Supplier Item Code', type: 'input' },
  { id: 'cm_supplier_item_name',      label: 'Supplier Item Name', type: 'input' },
  { id: 'cm_supplier_variant_description', label: 'Supplier Variant', type: 'input' },
  { id: 'cm_supplier_currency',       label: 'Currency',         type: 'input' },
  { id: 'cm_supplier_pack',           label: 'Pack',             type: 'input' },
  { id: 'lead_time_days',             label: 'Lead Time (days)', type: 'input' },
  { id: 'image',                      label: 'Image URL',        type: 'input' },
  // Cost Ladder — inputs
  { id: 'cm_purchase_price_ex_vat',   label: 'Purchase Price',   type: 'input' },
  { id: 'cm_increase_before_percent', label: 'Inc Before %',     type: 'input' },
  { id: 'cm_discount_1_percent',      label: 'Disc 1 %',        type: 'input' },
  { id: 'cm_discount_2_percent',      label: 'Disc 2 %',        type: 'input' },
  { id: 'cm_discount_3_percent',      label: 'Disc 3 %',        type: 'input' },
  { id: 'cm_increase_after_percent',  label: 'Inc After %',      type: 'input' },
  // Cost Ladder — calculated
  { id: '_after_inc',   label: '>> After Increase', type: 'calc' },
  { id: '_after_d1',    label: '>> After Disc 1',   type: 'calc' },
  { id: '_after_d2',    label: '>> After Disc 2',   type: 'calc' },
  { id: '_after_d3',    label: '>> After Disc 3',   type: 'calc' },
  { id: '_cost',        label: '>> Cost Ex VAT',    type: 'calc' },
  // Landed — inputs
  { id: 'cm_shipping_percent',  label: 'Shipping %',    type: 'input' },
  { id: 'cm_shipping_fee',      label: 'Shipping Fee',   type: 'input' },
  { id: 'cm_handling_fee',      label: 'Handling Fee',   type: 'input' },
  { id: 'cm_other_landed',      label: 'Other Landed',   type: 'input' },
  // Landed — calculated
  { id: '_landed_total', label: '>> Landed Total', type: 'calc' },
  { id: '_cost_calc',    label: '>> Total Cost',    type: 'calc' },
  // Pricing — inputs
  { id: 'cm_rrp_ex_vat',              label: 'RRP Ex VAT',      type: 'input' },
  { id: 'cm_vat_rate_percent',        label: 'VAT %',           type: 'input' },
  { id: 'cm_discount_target_percent', label: 'Target Disc %',   type: 'input' },
  { id: 'cm_pricing_rounding_mode',   label: 'Rounding Mode',   type: 'input' },
  // Pricing — calculated
  { id: '_rrp_inc',    label: '>> RRP Inc VAT',       type: 'calc' },
  { id: '_offer_inc',  label: '>> Offer Inc VAT',     type: 'calc' },
  { id: '_offer_ex',   label: '>> Offer Ex VAT',      type: 'calc' },
  { id: '_eff_disc',   label: '>> Eff. Discount %',   type: 'calc' },
  // Pack
  { id: 'cm_tiles_per_box', label: 'Tiles/Box', type: 'input' },
  { id: 'cm_sqm_per_box',   label: 'SQM/Box',   type: 'input' },
  // Configurator / Product Coding
  { id: 'cm_product_code',  label: 'Product Code',  type: 'input' },
  { id: 'cm_family_code',   label: 'Family Code',   type: 'input' },
  { id: 'cm_finish_code',   label: 'Finish Code',   type: 'input' },
  { id: 'cm_role_name',     label: 'Role Name',     type: 'input' },
  { id: 'cm_variant',       label: 'Variant',       type: 'input' },
  { id: 'cm_dimensions',    label: 'Dimensions',    type: 'input' },
  { id: 'cm_weight_factor', label: 'Weight Factor', type: 'input' },
  // Profitability — calculated
  { id: '_profit', label: '>> Profit Ex VAT', type: 'calc' },
  { id: '_margin', label: '>> Margin %',      type: 'calc' },
  { id: '_markup', label: '>> Markup %',      type: 'calc' },
  // Stock (static, read-only)
  { id: 'total_actual_qty',    label: 'Stock On Hand', type: 'stock' },
  { id: 'total_reserved_qty',  label: 'Reserved',      type: 'stock' },
  { id: 'total_ordered_qty',   label: 'On Order',      type: 'stock' },
  { id: 'total_projected_qty', label: 'Projected',     type: 'stock' },
]

const _colIdx: Record<string, number> = {}
CALC_LAYOUT.forEach((col, i) => { _colIdx[col.id] = i })

function getFormula(id: string, row: number): string {
  const c = (fieldId: string) => cr(_colIdx[fieldId], row)
  switch (id) {
    case '_after_inc':
      return `ROUND(${c('cm_purchase_price_ex_vat')}*(1+${c('cm_increase_before_percent')}/100),2)`
    case '_after_d1':
      return `ROUND(${c('_after_inc')}*(1-${c('cm_discount_1_percent')}/100),2)`
    case '_after_d2':
      return `ROUND(${c('_after_d1')}*(1-${c('cm_discount_2_percent')}/100),2)`
    case '_after_d3':
      return `ROUND(${c('_after_d2')}*(1-${c('cm_discount_3_percent')}/100),2)`
    case '_cost':
      return `ROUND(${c('_after_d3')}*(1+${c('cm_increase_after_percent')}/100),2)`
    case '_landed_total':
      return `ROUND(${c('cm_purchase_price_ex_vat')}*${c('cm_shipping_percent')}/100+${c('cm_shipping_fee')}+${c('cm_handling_fee')}+${c('cm_other_landed')},2)`
    case '_cost_calc':
      return `ROUND(${c('_cost')}+${c('_landed_total')},2)`
    case '_rrp_inc':
      return `ROUND(${c('cm_rrp_ex_vat')}*(1+${c('cm_vat_rate_percent')}/100),2)`
    case '_offer_inc':
      return `IF(${c('cm_pricing_rounding_mode')}="tile_decimal_pricing",ROUND(${c('_rrp_inc')}*(1-${c('cm_discount_target_percent')}/100),2),ROUND(${c('_rrp_inc')}*(1-${c('cm_discount_target_percent')}/100),0))`
    case '_offer_ex':
      return `ROUND(${c('_offer_inc')}/(1+${c('cm_vat_rate_percent')}/100),2)`
    case '_eff_disc':
      return `IF(${c('_rrp_inc')}>0,ROUND((1-${c('_offer_inc')}/${c('_rrp_inc')})*100,3),0)`
    case '_profit':
      return `ROUND(${c('_offer_ex')}-${c('_cost_calc')},2)`
    case '_margin':
      return `IF(${c('_offer_ex')}>0,ROUND(${c('_profit')}/${c('_offer_ex')}*100,3),0)`
    case '_markup':
      return `IF(${c('_cost_calc')}>0,ROUND(${c('_profit')}/${c('_cost_calc')}*100,3),0)`
    default:
      return ''
  }
}

// ── Sheet B "Upload" field mapping ────────────────────────────────────────────

const UPLOAD_FIELDS = [
  'item_code', 'item_name', 'cm_given_name',
  'cm_description_line_1', 'cm_description_line_2',
  'item_group', 'brand', 'stock_uom', 'is_stock_item', 'disabled',
  'cm_product_type', 'cm_hidden_from_catalogue',
  'cm_supplier_code', 'cm_supplier_name', 'cm_supplier_item_code',
  'cm_supplier_item_name', 'cm_supplier_variant_description',
  'cm_supplier_currency', 'cm_supplier_pack', 'lead_time_days', 'image',
  'cm_rrp_ex_vat', 'cm_vat_rate_percent', 'cm_discount_target_percent',
  'cm_pricing_rounding_mode',
  'cm_purchase_price_ex_vat', 'cm_increase_before_percent',
  'cm_discount_1_percent', 'cm_discount_2_percent', 'cm_discount_3_percent',
  'cm_increase_after_percent',
  'cm_shipping_percent', 'cm_shipping_fee', 'cm_handling_fee', 'cm_other_landed',
  'cm_tiles_per_box', 'cm_sqm_per_box',
  'cm_product_code', 'cm_family_code', 'cm_finish_code', 'cm_role_name',
  'cm_variant', 'cm_dimensions', 'cm_weight_factor',
]

const UPLOAD_MAP = UPLOAD_FIELDS.map((field) => ({
  field,
  calcColLetter: colLetter(_colIdx[field]),
}))

// ── Workbook builder ──────────────────────────────────────────────────────────

export function buildSmartWorkbook(items: Record<string, unknown>[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  const dataRows = items.length > 0 ? items : null
  const rowCount = dataRows ? dataRows.length : 1

  // Sheet A: Calculator
  const wsCalc: XLSX.WorkSheet = {}
  const calcColCount = CALC_LAYOUT.length

  CALC_LAYOUT.forEach((col, ci) => {
    wsCalc[`${colLetter(ci)}1`] = { v: col.label, t: 's' }
  })

  for (let ri = 0; ri < rowCount; ri++) {
    const row = ri + 2
    const item = dataRows ? dataRows[ri] : null

    CALC_LAYOUT.forEach((col, ci) => {
      const cellRef = `${colLetter(ci)}${row}`
      if (col.type === 'calc') {
        wsCalc[cellRef] = { f: getFormula(col.id, row) }
      } else {
        const val = item ? (item[col.id] ?? '') : ''
        if (val === '' || val === null) {
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
    wch: Math.max(col.label.length + 2, col.type === 'calc' ? 16 : 14),
  }))

  XLSX.utils.book_append_sheet(wb, wsCalc, 'Calculator')

  // Sheet B: Upload
  const wsUpload: XLSX.WorkSheet = {}
  const uploadColCount = UPLOAD_MAP.length

  UPLOAD_MAP.forEach((entry, ci) => {
    wsUpload[`${colLetter(ci)}1`] = { v: entry.field, t: 's' }
  })

  for (let ri = 0; ri < rowCount; ri++) {
    const row = ri + 2
    UPLOAD_MAP.forEach((entry, ci) => {
      const cellRef = `${colLetter(ci)}${row}`
      wsUpload[cellRef] = { f: `Calculator!${entry.calcColLetter}${row}` }
    })
  }

  wsUpload['!ref'] = `A1:${colLetter(uploadColCount - 1)}${rowCount + 1}`
  wsUpload['!cols'] = UPLOAD_MAP.map((entry) => ({
    wch: Math.max(entry.field.length + 2, 14),
  }))

  XLSX.utils.book_append_sheet(wb, wsUpload, 'Upload')

  return wb
}

export function downloadSmartWorkbook(items: Record<string, unknown>[], filename: string): void {
  const wb = buildSmartWorkbook(items)
  XLSX.writeFile(wb, filename)
}
