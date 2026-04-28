import { frappe } from './frappe'

const API = 'casamoderna_dms.price_calculator_api'

export const priceCalculatorApi = {
  listCalculators() {
    return frappe.callGet<unknown[]>(`${API}.get_price_calculators`)
  },

  getCalculator(name: string) {
    return frappe.callGet<Record<string, unknown>>(`${API}.get_price_calculator`, { name })
  },

  saveCalculator(doc: Record<string, unknown>) {
    return frappe.call<Record<string, unknown>>(`${API}.save_price_calculator`, { doc })
  },

  deleteCalculator(name: string) {
    return frappe.call<{ success: boolean }>(`${API}.delete_price_calculator`, { name })
  },

  applyFormula(name: string, basePrice: number, lm = 0) {
    return frappe.callGet<unknown>(`${API}.apply_formula`, { name, base_price: basePrice, lm })
  },

  getVatRate() {
    return frappe.callGet<number>(`${API}.get_vat_rate`)
  },
}
