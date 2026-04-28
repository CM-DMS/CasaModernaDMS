import { frappe } from './frappe'

const API = 'casamoderna_dms.configurator_pricing_api'

export const priceListsApi = {
  listPriceLists() {
    return frappe.callGet<unknown[]>(`${API}.get_price_lists`)
  },

  getConfiguratorPricing(name: string) {
    return frappe.callGet<Record<string, unknown>>(`${API}.get_configurator_pricing`, { name })
  },

  saveConfiguratorPricing(doc: Record<string, unknown>) {
    return frappe.call<Record<string, unknown>>(`${API}.save_configurator_pricing`, { doc })
  },

  deleteConfiguratorPricing(name: string) {
    return frappe.call<{ success: boolean }>(`${API}.delete_configurator_pricing`, { name })
  },

  listSupplierPriceLists() {
    return frappe.callGet<unknown[]>(`${API}.get_supplier_price_lists`)
  },

  getSupplierItemPrices({ price_list, search = '', page = 1, page_size = 50 }: {
    price_list: string; search?: string; page?: number; page_size?: number
  }) {
    return frappe.callGet<{ rows: Record<string, unknown>[]; total: number; page: number; page_size: number }>(
      `${API}.get_supplier_item_prices`, { price_list, search, page, page_size }
    )
  },

  updateSupplierItemPrice(name: string, price_list_rate: number) {
    return frappe.call<{ success: boolean; name: string; price_list_rate: number }>(
      `${API}.update_supplier_item_price`, { name, price_list_rate }
    )
  },
}
