/**
 * products.ts — API layer for the Item doctype (V3).
 *
 * Delegates search to the unified backend endpoint
 * casamoderna_dms.api.catalogue_search.search_catalogue which returns
 * items + free_stock in a single SQL query.
 */
import { frappe } from './frappe'

export interface ItemSearchRow {
  name: string
  item_code: string
  item_name: string
  cm_given_name?: string
  item_group?: string
  brand?: string
  stock_uom?: string
  disabled?: 0 | 1
  cm_hidden_from_catalogue?: 0 | 1
  cm_product_type?: string
  cm_supplier_code?: string
  cm_supplier_name?: string
  cm_final_offer_inc_vat?: number
  cm_final_offer_ex_vat?: number
  cm_rrp_inc_vat?: number
  cm_rrp_ex_vat?: number
  cm_discount_percent?: number
  free_stock?: number
  image?: string
}

export interface ItemDoc extends ItemSearchRow {
  cm_description_line_1?: string
  cm_description_line_2?: string
  description?: string
  is_stock_item?: 0 | 1
  cm_sqm_per_box?: number
  cm_tiles_per_box?: number
  cm_supplier_pack?: string
  has_batch_no?: 0 | 1
  // Pricing inputs
  cm_rrp_ex_vat?: number
  cm_vat_rate_percent?: number
  cm_discount_target_percent?: number
  cm_pricing_rounding_mode?: string
  cm_cost_ex_vat?: number
  // Cost ladder inputs
  cm_purchase_price_ex_vat?: number
  cm_increase_before_percent?: number
  cm_discount_1_percent?: number
  cm_discount_2_percent?: number
  cm_discount_3_percent?: number
  cm_increase_after_percent?: number
  // Landed
  cm_shipping_percent?: number
  cm_shipping_fee?: number
  cm_handling_fee?: number
  cm_other_landed?: number
  cm_delivery_installation_fee?: number
  // Calculated outputs (read-only, server-computed)
  cm_after_increase_before_ex_vat?: number
  cm_after_discount_1_ex_vat?: number
  cm_after_discount_2_ex_vat?: number
  cm_after_discount_3_ex_vat?: number
  cm_landed_additions_total_ex_vat?: number
  cm_cost_ex_vat_calculated?: number
  cm_profit_ex_vat?: number
  cm_margin_percent?: number
  cm_markup_percent?: number
  // Supplier
  cm_supplier_variant_description?: string
  cm_supplier_item_code?: string
  cm_supplier_item_name?: string
  cm_supplier_currency?: string
  lead_time_days?: number
  image?: string
  // Configurator / product coding
  cm_product_code?: string
  cm_family_code?: string
  cm_finish_code?: string
  cm_role_name?: string
  cm_variant?: string
  cm_dimensions?: string
  cm_weight_factor?: number
  [key: string]: unknown
}

export interface SearchResult {
  rows: ItemSearchRow[]
  total: number
}

export const productsApi = {
  /**
   * Search the product catalogue.
   */
  search({
    q = '',
    itemGroups = [] as string[],
    supplierCode = '',
    disabled,
    showHidden = false,
    productType = 'Primary',
    sortBy = 'item_name',
    sortDir = 'asc',
    limit = 50,
    offset = 0,
    inStockOnly = false,
    minPrice,
    maxPrice,
    barcode = '',
  }: {
    q?: string
    itemGroups?: string[]
    supplierCode?: string
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
    barcode?: string
  } = {}): Promise<SearchResult> {
    return frappe
      .call<SearchResult>('casamoderna_dms.api.catalogue_search.search_catalogue', {
        q,
        item_groups: JSON.stringify(itemGroups),
        supplier_code: supplierCode,
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
        ...(barcode && { barcode }),
      })
      .then((res) => {
        if (res && typeof res === 'object' && Array.isArray((res as SearchResult).rows)) {
          return res as SearchResult
        }
        const rows = Array.isArray(res) ? (res as ItemSearchRow[]) : []
        return { rows, total: rows.length }
      })
  },

  /** Load distinct item groups present in the active catalogue. */
  getGroups(): Promise<string[]> {
    return frappe.call<string[]>('casamoderna_dms.api.catalogue_search.get_catalogue_groups')
  },

  /** Load distinct brand names present in the active catalogue. */
  getBrands(): Promise<string[]> {
    return frappe.call<string[]>('casamoderna_dms.api.catalogue_search.get_catalogue_brands')
  },

  /**
   * Fetch a single Item document with all profile fields.
   * Uses custom endpoint that runs onload to populate virtual pricing fields.
   */
  get(name: string): Promise<ItemDoc> {
    return frappe.call<ItemDoc>('casamoderna_dms.api.item_detail.get_item', { name })
  },

  /**
   * Create or update an Item document. Returns the saved doc.
   * Child tables that this app never manages are stripped before sending.
   */
  save(doc: Record<string, unknown>): Promise<ItemDoc> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { uoms, taxes, customer_items, supplier_items, barcodes, ...safeDoc } = doc
    return frappe.saveDoc<ItemDoc>('Item', safeDoc)
  },
}
