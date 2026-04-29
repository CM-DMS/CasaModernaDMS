/**
 * ItemsTable — editable / read-only items grid for all sales documents.
 * TypeScript port of V2 ItemsTable.jsx.
 *
 * Rule: amounts (amount, net_amount) are NEVER calculated here.
 * They are filled from the server response after each save.
 *
 * rate IS the inc-VAT price (inclusive tax template).
 */
import { frappe } from '../../api/frappe'
import { fmtMoneyExact, fmtDiscountUI } from '../../utils/pricing'
import { Typeahead } from './Typeahead'
import { CM } from '../ui/CMClassNames'

// ── Helpers ──────────────────────────────────────────────────────────────────

const EUR = (v: number | null | undefined) =>
  v != null && v !== 0 ? fmtMoneyExact(Number(v)) : '—'
const QTY = (v: number | null | undefined) => (v != null ? Number(v).toFixed(2) : '—')
const DISC = (v: number | null | undefined) =>
  v != null && Number(v) > 0 ? fmtDiscountUI(Number(v)) : '—'

const VAT_FACTOR = (row: ItemRow) => 1 + (Number(row.cm_vat_rate_percent) || 18) / 100

const offerIncVat = (row: ItemRow) =>
  Number(row.rate) || Number(row.cm_final_offer_inc_vat) || 0

const lineTotalIncVat = (row: ItemRow): number | null => {
  const qty = Number(row.qty || 1)
  if (qty <= 0) return null
  const offer = offerIncVat(row)
  return offer > 0 ? offer * qty : null
}

const offerExVat = (row: ItemRow): number | null => {
  const incVat = offerIncVat(row)
  if (!incVat) return null
  return incVat / VAT_FACTOR(row)
}

const lineTotalExVat = (row: ItemRow): number | null => {
  const qty = Number(row.qty || 1)
  if (qty <= 0) return null
  const offer = offerExVat(row)
  return offer ? offer * qty : null
}

const PLACEHOLDER_CODES = new Set([
  'CM-FREETEXT',
  'CM-DELIVERY',
  'CM-DELIVERY_GOZO',
  'CM-LIFTER',
  'CM-INSTALLATION',
])
const isPlaceholder = (code?: string) => !!code && PLACEHOLDER_CODES.has(code)
const isSeparator = (code?: string) => code === 'CM-SEPARATOR'
const isConfigured = (code?: string) => !!code && (code === 'CM-SOFA' || code === 'CM-WARDROBE')

const IMG_BASE = (import.meta as any).env?.BASE_URL?.replace(/\/$/, '') || ''

// ── Sub-components ────────────────────────────────────────────────────────────

function CfgBadge({ cfgRef }: { cfgRef?: string }) {
  if (cfgRef) {
    return (
      <span className="inline-flex items-center gap-1 mb-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-indigo-50 text-indigo-600 border border-indigo-200 uppercase tracking-wide">
        <span className="opacity-60">ref</span> {cfgRef}
      </span>
    )
  }
  return (
    <span className="inline-block mb-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-gray-100 text-gray-400 uppercase tracking-wide">
      Configured · save for code
    </span>
  )
}

function SofaImageStrip({
  row,
  sofaConfigMap,
}: {
  row: ItemRow
  sofaConfigMap?: Record<string, { sofa_image_url?: string }>
}) {
  let imgUrl =
    (row as any).__sofaImageUrl ||
    (row.cm_custom_line_ref && sofaConfigMap?.[row.cm_custom_line_ref]?.sofa_image_url) ||
    null
  if (!imgUrl) return null
  if (IMG_BASE && !imgUrl.startsWith(IMG_BASE)) imgUrl = IMG_BASE + imgUrl
  return (
    <div className="mt-1.5">
      <img
        src={imgUrl}
        alt="Sofa top-view diagram"
        className="max-h-24 max-w-[200px] object-contain border border-gray-200 rounded"
      />
    </div>
  )
}

function ItemCell({
  itemName,
  itemCode,
  description,
}: {
  itemName?: string
  itemCode?: string
  description?: string
}) {
  const lines = (description || '').split('\n').map((l) => l.trim()).filter(Boolean)
  return (
    <>
      <div className="font-medium">{itemName || itemCode}</div>
      {lines[0] && <div className="text-[11px] text-gray-400 mt-0.5">{lines[0]}</div>}
      {lines[1] && <div className="text-[11px] text-gray-300 mt-0.5">{lines[1]}</div>}
    </>
  )
}

function DescriptionDisplay({ description }: { description?: string }) {
  if (!description) return null
  const lines = description.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length <= 2) return null
  return (
    <div className="mt-1 text-[11px] text-gray-400 whitespace-pre-wrap leading-snug">
      {lines.slice(2).join('\n')}
    </div>
  )
}

function SeparatorRow({
  row,
  idx,
  readOnly,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  COLS,
}: {
  row: ItemRow
  idx: number
  readOnly?: boolean
  onChange?: (idx: number, patch: Partial<ItemRow>) => void
  onRemove?: (idx: number) => void
  onMoveUp?: (idx: number) => void
  onMoveDown?: (idx: number) => void
  isFirst: boolean
  isLast: boolean
  COLS: number
}) {
  return (
    <tr className="bg-green-50 border-y border-green-200">
      <td colSpan={COLS} className="px-3 py-1.5">
        <div className="flex items-center gap-2">
          {!readOnly && (
            <div className="flex flex-col gap-0.5 shrink-0">
              <button
                type="button"
                onClick={() => onMoveUp?.(idx)}
                disabled={isFirst}
                className="text-green-500 hover:text-green-700 disabled:opacity-20 leading-none text-[10px] px-0.5"
                title="Move up"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => onMoveDown?.(idx)}
                disabled={isLast}
                className="text-green-500 hover:text-green-700 disabled:opacity-20 leading-none text-[10px] px-0.5"
                title="Move down"
              >
                ▼
              </button>
            </div>
          )}
          <span className="text-[9px] font-bold text-green-700 uppercase tracking-widest shrink-0 select-none">
            Section
          </span>
          {readOnly ? (
            <span className="font-semibold text-green-800 text-xs">{row.item_name || ''}</span>
          ) : (
            <input
              type="text"
              value={row.item_name || ''}
              onChange={(e) => onChange?.(idx, { item_name: e.target.value })}
              placeholder="Section label (e.g. Living Room, Master Bedroom…)"
              className="flex-1 text-xs font-semibold text-green-800 bg-transparent border-0 border-b border-green-300 focus:border-green-600 focus:outline-none px-0 py-0.5 placeholder:text-green-400 placeholder:font-normal"
            />
          )}
          {!readOnly && (
            <button
              type="button"
              onClick={() => onRemove?.(idx)}
              className="shrink-0 text-red-300 hover:text-red-500 transition-colors p-1 ml-auto"
              title="Remove separator"
            >
              ✕
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

function ReadOnlyRow({
  row,
  rowNum,
  sofaConfigMap,
  showIncVat,
}: {
  row: ItemRow
  rowNum: number
  sofaConfigMap?: Record<string, { sofa_image_url?: string }>
  showIncVat: boolean
}) {
  const isPh = isPlaceholder(row.item_code)
  const isCfg = isConfigured(row.item_code)
  const rrp = showIncVat ? row.cm_rrp_inc_vat : row.cm_rrp_ex_vat
  const offer = showIncVat ? offerIncVat(row) : offerExVat(row)
  const total = showIncVat ? lineTotalIncVat(row) : lineTotalExVat(row)

  return (
    <tr className={CM.table.tr + (isPh ? ' bg-amber-50' : '')}>
      <td className={CM.table.tdMuted}>{rowNum}</td>
      <td className={CM.table.td}>
        {isPh && (
          <span className="inline-block mb-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-100 text-amber-700 uppercase tracking-wide">
            Needs product record
          </span>
        )}
        {isCfg && <CfgBadge cfgRef={row.cm_custom_line_ref} />}
        {isCfg && row.item_code === 'CM-SOFA' && (
          <SofaImageStrip row={row} sofaConfigMap={sofaConfigMap} />
        )}
        <ItemCell itemName={row.item_name} itemCode={row.item_code} description={row.description} />
        <DescriptionDisplay description={row.description} />
      </td>
      <td className={CM.table.tdMuted + ' text-right tabular-nums'}>{QTY(row.qty)}</td>
      <td className={CM.table.td}>{row.uom || '—'}</td>
      <td className={CM.table.tdMuted + ' text-right tabular-nums'}>{EUR(rrp)}</td>
      <td className={CM.table.tdMuted + ' text-right tabular-nums'}>
        {DISC(row.cm_effective_discount_percent)}
      </td>
      <td className={CM.table.td + ' text-right tabular-nums'}>{EUR(offer)}</td>
      <td className={CM.table.td + ' text-right tabular-nums font-medium'}>{EUR(total)}</td>
    </tr>
  )
}

interface FrappeItemResult {
  name: string
  item_code: string
  item_name: string
  stock_uom?: string
  standard_rate?: number
  cm_given_name?: string
  cm_rrp_inc_vat?: number
  cm_rrp_ex_vat?: number
  cm_final_offer_inc_vat?: number
  cm_final_offer_ex_vat?: number
  cm_vat_rate_percent?: number
  cm_effective_discount_percent?: number
}

function EditableRow({
  row,
  rowNum,
  idx,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  onTilesCalc,
  isFirst,
  isLast,
  sofaConfigMap,
  showIncVat,
}: {
  row: ItemRow
  rowNum: number
  idx: number
  onChange?: (idx: number, patch: Partial<ItemRow>) => void
  onRemove?: (idx: number) => void
  onMoveUp?: (idx: number) => void
  onMoveDown?: (idx: number) => void
  onTilesCalc?: (idx: number) => void
  onTilesCalc?: (idx: number) => void
  isFirst: boolean
  isLast: boolean
  sofaConfigMap?: Record<string, { sofa_image_url?: string }>
  showIncVat: boolean
}) {
  const isPh = isPlaceholder(row.item_code)
  const isCfg = isConfigured(row.item_code)

  const handleItemSelect = (val: string, itemRow: FrappeItemResult | null) => {
    if (!itemRow) return
    const offerInc = itemRow.cm_final_offer_inc_vat ?? itemRow.standard_rate ?? row.rate ?? 0
    const rrpInc = Number(itemRow.cm_rrp_inc_vat ?? 0)
    const vatFactor = 1 + (itemRow.cm_vat_rate_percent || 18) / 100
    const offerEx = itemRow.cm_final_offer_ex_vat || (offerInc > 0 ? Math.round((offerInc / vatFactor) * 100) / 100 : 0)
    const rrpEx = itemRow.cm_rrp_ex_vat || (rrpInc > 0 ? Math.round((rrpInc / vatFactor) * 100) / 100 : 0)
    const discPct =
      rrpInc > 0 && offerInc > 0
        ? Math.max(0, ((rrpInc - offerInc) / rrpInc) * 100)
        : Number(itemRow.cm_effective_discount_percent ?? 0)

    onChange?.(idx, {
      item_code: val,
      item_name: itemRow.cm_given_name || itemRow.item_name || '',
      uom: itemRow.stock_uom || row.uom || '',
      rate: offerInc,
      cm_rrp_inc_vat: rrpInc,
      cm_rrp_ex_vat: rrpEx,
      cm_final_offer_inc_vat: offerInc,
      cm_final_offer_ex_vat: offerEx,
      cm_effective_discount_percent: discPct,
    })
  }

  const searchItems = (q: string) =>
    frappe
      .call('frappe.client.get_list', {
        doctype: 'Item',
        fields: [
          'name',
          'item_code',
          'item_name',
          'stock_uom',
          'standard_rate',
          'cm_given_name',
          'cm_rrp_inc_vat',
          'cm_rrp_ex_vat',
          'cm_final_offer_inc_vat',
          'cm_final_offer_ex_vat',
          'cm_vat_rate_percent',
          'cm_effective_discount_percent',
        ],
        or_filters: [
          ['item_name', 'like', `%${q}%`],
          ['item_code', 'like', `%${q}%`],
          ['cm_given_name', 'like', `%${q}%`],
        ],
        limit_page_length: 15,
      })
      .then((r: any) => r || [])

  const vatFactor = VAT_FACTOR(row)
  const floorInc = Number(row.cm_final_offer_inc_vat)
  const belowFloor = floorInc > 0 && Number(row.rate) < floorInc
  const displayValue = showIncVat
    ? offerIncVat(row) || ''
    : offerExVat(row) != null
      ? Number((offerExVat(row) as number).toFixed(2))
      : ''

  const handleOfferChangeInc = (e: React.ChangeEvent<HTMLInputElement>) => {
    const incVal = Number(e.target.value)
    const rrp = Number(row.cm_rrp_inc_vat)
    const discPct = rrp > 0 ? Math.max(0, ((rrp - incVal) / rrp) * 100) : 0
    onChange?.(idx, {
      rate: incVal,
      discount_percentage: discPct,
      cm_effective_discount_percent: discPct,
    })
  }

  const handleOfferChangeExc = (e: React.ChangeEvent<HTMLInputElement>) => {
    const exVal = Number(e.target.value)
    const incVal = Math.ceil(exVal * vatFactor)
    const rrp = Number(row.cm_rrp_inc_vat)
    const discPct = rrp > 0 ? Math.max(0, ((rrp - incVal) / rrp) * 100) : 0
    onChange?.(idx, {
      rate: incVal,
      discount_percentage: discPct,
      cm_effective_discount_percent: discPct,
    })
  }

  return (
    <tr className={CM.table.tr + (isPh ? ' bg-amber-50' : '')}>
      <td className={CM.table.tdMuted}>{rowNum}</td>
      <td className={CM.table.td} style={{ minWidth: 200 }}>
        {isPh && (
          <span className="inline-block mb-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-100 text-amber-700 uppercase tracking-wide">
            Needs product record
          </span>
        )}
        {isCfg && <CfgBadge cfgRef={row.cm_custom_line_ref} />}
        {isCfg && row.item_code === 'CM-SOFA' && (
          <SofaImageStrip row={row} sofaConfigMap={sofaConfigMap} />
        )}
        <Typeahead<FrappeItemResult>
          value={row.item_code || ''}
          displayValue={row.item_name || row.item_code || ''}
          onSearch={searchItems}
          getLabel={(r) => r.cm_given_name || r.item_name || r.item_code}
          getValue={(r) => r.item_code}
          onChange={handleItemSelect}
          placeholder="Item code / name…"
        />
        <input
          type="text"
          value={row.item_name || ''}
          onChange={(e) => onChange?.(idx, { item_name: e.target.value })}
          placeholder="Product / service name…"
          className="mt-1 w-full text-sm font-medium border-0 border-b border-transparent focus:border-gray-300 focus:outline-none bg-transparent px-0 py-0.5 placeholder:text-gray-300"
        />
        <textarea
          value={row.description || ''}
          onChange={(e) => onChange?.(idx, { description: e.target.value })}
          placeholder="Detailed description (brand, model, finish, dimensions…)"
          rows={2}
          className="mt-1 w-full text-[11px] text-gray-500 border border-gray-200 rounded px-2 py-1.5 resize-y focus:outline-none focus:border-indigo-300 placeholder:text-gray-300 bg-white"
        />
        {(row as any).cm_supplier_price > 0 && (
          <div className="mt-1 text-[10px] text-indigo-600 font-medium">
            💰 Supplier: {EUR((row as any).cm_supplier_price)}
          </div>
        )}
      </td>
      <td className={CM.table.td} style={{ width: 90 }}>
        <input
          type="number"
          className={CM.input + ' text-right'}
          value={row.qty ?? ''}
          min="0"
          step="0.01"
          onChange={(e) => onChange?.(idx, { qty: parseFloat(e.target.value) || 0 })}
        />
      </td>
      <td className={CM.table.td}>{row.uom || '—'}</td>
      <td className={CM.table.tdMuted + ' text-right tabular-nums'}>
        {EUR(showIncVat ? row.cm_rrp_inc_vat : row.cm_rrp_ex_vat)}
      </td>
      <td className={CM.table.tdMuted + ' text-right tabular-nums'}>
        {DISC(row.cm_effective_discount_percent)}
      </td>
      <td className={CM.table.td} style={{ width: 110 }}>
        <div className="relative">
          <input
            type="number"
            className={
              CM.input +
              ' text-right' +
              (belowFloor ? ' border-amber-400 bg-amber-50' : '')
            }
            value={displayValue}
            min="0"
            step="0.01"
            onChange={showIncVat ? handleOfferChangeInc : handleOfferChangeExc}
          />
          {belowFloor && (
            <span
              className="absolute -top-1 -right-1 text-[11px] leading-none"
              title="Below standard offer — supervisor approval required on save"
            >
              🔒
            </span>
          )}
        </div>
      </td>
      <td className={CM.table.td + ' text-right tabular-nums text-gray-500'}>
        {EUR(showIncVat ? lineTotalIncVat(row) : lineTotalExVat(row))}
      </td>
      <td className={CM.table.td}>
        <div className="flex flex-col items-center gap-0.5">
          <button
            type="button"
            onClick={() => onMoveUp?.(idx)}
            disabled={isFirst}
            className="text-gray-300 hover:text-gray-500 disabled:opacity-20 leading-none text-[10px] px-0.5"
            title="Move up"
          >
            ▲
          </button>
          <button
            type="button"
            onClick={() => onRemove?.(idx)}
            className="text-red-400 hover:text-red-600 transition-colors px-0.5 text-[11px]"
            title="Remove row"
          >
            ✕
          </button>
          <button
            type="button"
            onClick={() => onMoveDown?.(idx)}
            disabled={isLast}
            className="text-gray-300 hover:text-gray-500 disabled:opacity-20 leading-none text-[10px] px-0.5"
            title="Move down"
          >
            ▼
          </button>
          {Number(row.cm_sqm_per_box) > 0 && (
            <button
              type="button"
              onClick={() => onTilesCalc?.(idx)}
              className="text-blue-400 hover:text-blue-600 transition-colors px-0.5 text-[10px]"
              title="Tiles calculator for this row"
            >
              📐
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ItemRow {
  name?: string
  item_code?: string
  item_name?: string
  description?: string
  qty?: number
  uom?: string
  rate?: number
  amount?: number
  discount_percentage?: number
  cm_rrp_inc_vat?: number
  cm_rrp_ex_vat?: number
  cm_final_offer_inc_vat?: number
  cm_final_offer_ex_vat?: number
  cm_effective_discount_percent?: number
  cm_vat_rate_percent?: number
  cm_custom_line_ref?: string
  cm_sqm_per_box?: number
  cm_tiles_calc_meta?: string
  [key: string]: unknown
}

// ── Main export ───────────────────────────────────────────────────────────────

interface ItemsTableProps {
  items?: ItemRow[]
  readOnly?: boolean
  showIncVat?: boolean
  sofaConfigMap?: Record<string, { sofa_image_url?: string }>
  onItemChange?: (idx: number, patch: Partial<ItemRow>) => void
  onRemoveRow?: (idx: number) => void
  onMoveUp?: (idx: number) => void
  onMoveDown?: (idx: number) => void
  onTilesCalc?: (idx: number) => void
}

export function ItemsTable({
  items = [],
  readOnly = true,
  showIncVat = true,
  sofaConfigMap = {},
  onItemChange,
  onRemoveRow,
  onMoveUp,
  onMoveDown,
  onTilesCalc,
}: ItemsTableProps) {
  const COLS = readOnly ? 8 : 9
  const vatLabel = showIncVat ? 'inc. VAT' : 'ex. VAT'

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className={CM.table.thead}>
          <tr>
            <th className={CM.table.th} style={{ width: 36 }}>
              #
            </th>
            <th className={CM.table.th}>Item</th>
            <th className={CM.table.thRight} style={{ width: 80 }}>
              Qty
            </th>
            <th className={CM.table.th} style={{ width: 55 }}>
              UOM
            </th>
            <th className={CM.table.thRight} style={{ width: 95 }}>
              Unit RRP {vatLabel}
            </th>
            <th className={CM.table.thRight} style={{ width: 70 }}>
              Disc%
            </th>
            <th className={CM.table.thRight} style={{ width: 100 }}>
              Offer Price {vatLabel}
            </th>
            <th className={CM.table.thRight} style={{ width: 100 }}>
              Total {vatLabel}
            </th>
            {!readOnly && <th className={CM.table.th} style={{ width: 40 }}></th>}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan={COLS} className="py-6 text-center text-gray-400 text-xs">
                No items
              </td>
            </tr>
          )}
          {(() => {
            let rowNum = 0
            return items.map((row, idx) => {
              if (isSeparator(row.item_code)) {
                return (
                  <SeparatorRow
                    key={row.name || idx}
                    row={row}
                    idx={idx}
                    readOnly={readOnly}
                    onChange={onItemChange}
                    onRemove={onRemoveRow}
                    onMoveUp={onMoveUp}
                    onMoveDown={onMoveDown}
                    onTilesCalc={onTilesCalc}
                    isFirst={idx === 0}
                    isLast={idx === items.length - 1}
                    COLS={COLS}
                  />
                )
              }
              rowNum += 1
              return readOnly ? (
                <ReadOnlyRow
                  key={row.name || idx}
                  row={row}
                  rowNum={rowNum}
                  sofaConfigMap={sofaConfigMap}
                  showIncVat={showIncVat}
                />
              ) : (
                <EditableRow
                  key={row.name || idx}
                  row={row}
                  rowNum={rowNum}
                  idx={idx}
                  onChange={onItemChange}
                  onRemove={onRemoveRow}
                  onMoveUp={onMoveUp}
                  onMoveDown={onMoveDown}
                  isFirst={idx === 0}
                  isLast={idx === items.length - 1}
                  sofaConfigMap={sofaConfigMap}
                  showIncVat={showIncVat}
                />
              )
            })
          })()}
        </tbody>
      </table>
    </div>
  )
}
