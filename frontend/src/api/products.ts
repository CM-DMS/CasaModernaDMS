/**
 * products.ts — API layer for the CM Product doctype (V3).
 *
 * Delegates search to casamoderna_dms.api.catalogue_search.search_catalogue
 * which now queries tabCM Product and returns rows + free_stock in a single
 * SQL query.
 */
import { frappe } from './frappe'

// ── Search result row (lightweight, returned by search_catalogue) ────────────

export interface CMProductRow {
  /** cm_given_code — the CM Product document name, e.g. "0200-TST-00001" */
  name: string
  item_name: string
  cm_given_name?: string
  item_group?: string
  stock_uom?: string
  disabled?: 0 | 1
  cm_hidden_from_catalogue?: 0 | 1
  cm_product_type?: string
  cm_supplier_name?: string
  cm_supplier_code?: string
  cm_rrp_ex_vat?: number
  cm_rrp_inc_vat?: number
  cm_offer_tier1_inc_vat?: number
  cm_offer_tier1_ex_vat?: number
  cm_offer_tier1_discount_pct?: number
  cm_vat_rate_percent?: number
  image?: string
  is_stock_item?: 0 | 1
  free_stock?: number
  creation?: string
}

// ── Full document (returned by get_cm_product, used by Profile/Editor) ───────

export interface CMProductDoc extends CMProductRow {
  // Identity
  cm_description_line_1?: string
  cm_description_line_2?: string
  // Tiles
  cm_sqm_per_box?: number
  cm_tiles_per_box?: number
  // Pricing flags
  cm_show_inc_vat?: 0 | 1
  cm_rrp_manual_override?: 0 | 1
  cm_target_margin_percent?: number
  cm_vat_rate_percent?: number
  // Cost inputs
  cm_purchase_price_ex_vat?: number
  cm_shipping_percent?: number
  cm_shipping_fee?: number
  cm_handling_fee?: number
  cm_other_landed?: number
  cm_delivery_installation_fee?: number
  // Computed cost (r/o)
  cm_landed_additions_total_ex_vat?: number
  cm_cost_ex_vat_calculated?: number
  // Tier 1
  cm_offer_tier1_inc_vat?: number
  cm_offer_tier1_ex_vat?: number
  cm_offer_tier1_discount_pct?: number
  // Tier 2
  cm_offer_tier2_inc_vat?: number
  cm_offer_tier2_ex_vat?: number
  cm_offer_tier2_discount_pct?: number
  // Tier 3
  cm_offer_tier3_inc_vat?: number
  cm_offer_tier3_ex_vat?: number
  cm_offer_tier3_discount_pct?: number
  // Profitability (r/o)
  cm_profit_ex_vat?: number
  cm_margin_percent?: number
  cm_markup_percent?: number
  // Supplier
  cm_supplier_variant_description?: string
  cm_supplier_item_code?: string
  cm_supplier_item_name?: string
  cm_supplier_currency?: string
  cm_supplier_pack?: string
  lead_time_days?: number
  [key: string]: unknown
}

// Legacy alias so any code still importing ItemDoc or ItemSearchRow keeps working
/** @deprecated use CMProductRow */
export type ItemSearchRow = CMProductRow
/** @deprecated use CMProductDoc */
export type ItemDoc = CMProductDoc

export interface SearchResult {
  rows: CMProductRow[]
  total: number
}

export const productsApi = {
  /**
   * Search the CM Product catalogue.
   */
  search({
    q = '',
    itemGroups = [] as string[],
    supplierCode = '',
    supplierName = '',
    disabled,
    showHidden = false,
    productType = 'Primary',
    sortBy = 'cm_given_name',
    sortDir = 'asc',
    limit = 50,
    offset = 0,
    inStockOnly = false,
    minPrice,
    maxPrice,
  }: {
    q?: string
    itemGroups?: string[]
    supplierCode?: string
    supplierName?: string
    disabled?: boolean
    showHidden?: boolean
    productType?: string
    sortBy?: string
    sortDir?: string
    limit?: number
    offset?: number
    inStockOnly?: boolean
    minPrice?: number | string
    maxPrice?: number | string
  } = {}): Promise<SearchResult> {
    return frappe
      .call<SearchResult>('casamoderna_dms.api.catalogue_search.search_catalogue', {
        q,
        item_groups: JSON.stringify(itemGroups),
        ...(supplierCode && { supplier_code: supplierCode }),
        ...(supplierName && { supplier_name: supplierName }),
        ...(disabled !== undefined && { disabled: disabled ? 1 : 0 }),
        show_hidden: showHidden ? 1 : 0,
        product_type: productType || '',
        sort_by: sortBy,
        sort_dir: sortDir,
        limit,
        offset,
        in_stock_only: inStockOnly ? 1 : 0,
        ...(minPrice !== undefined && minPrice !== '' && { min_price: minPrice }),
        ...(maxPrice !== undefined && maxPrice !== '' && { max_price: maxPrice }),
      })
      .then((res) => {
        if (res && typeof res === 'object' && Array.isArray((res as SearchResult).rows)) {
          return res as SearchResult
        }
        const rows = Array.isArray(res) ? (res as CMProductRow[]) : []
        return { rows, total: rows.length }
      })
  },

  /** Load distinct item groups present in the active CM Product catalogue. */
  getGroups(): Promise<string[]> {
    return frappe.call<string[]>('casamoderna_dms.api.catalogue_search.get_catalogue_groups')
  },

  /** Load distinct supplier names present in the active CM Product catalogue. */
  getSuppliers(): Promise<string[]> {
    return frappe.call<string[]>('casamoderna_dms.api.catalogue_search.get_catalogue_suppliers')
  },

  /** @deprecated use getSuppliers() */
  getBrands(): Promise<string[]> {
    return productsApi.getSuppliers()
  },

  /**
   * Fetch a single CM Product document including free_stock.
   */
  get(name: string): Promise<CMProductDoc> {
    return frappe.call<CMProductDoc>('casamoderna_dms.api.item_detail.get_cm_product', { name })
  },

  /**
   * Create or update a CM Product document. Returns the saved doc.
   */
  save(doc: Record<string, unknown>): Promise<CMProductDoc> {
    return frappe.saveDoc<CMProductDoc>('CM Product', doc)
  },
}
