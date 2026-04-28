/**
 * procurementDispatch.ts — API calls for the procurement dispatch board.
 * Backend: casamoderna_dms.api.procurement_dispatch
 */
import { frappe } from './frappe'

const M = 'casamoderna_dms.api.procurement_dispatch'

export interface DispatchItem {
  so_item_name: string
  sales_order: string
  item_code: string
  item_name: string
  qty: number
  uom: string
  delivery_date: string
  supplier_name: string | null
  lead_time_days: number | null
  days_to_order: number | null
  urgency: 'ok' | 'urgent' | 'overdue'
  lane: 'order' | 'stock'
}

export interface CreatePoResult {
  po_name: string
  po_url: string
}

export interface AllocateResult {
  sre_name: string
  warehouse: string
}

export const procurementDispatchApi = {
  list: () => frappe.call<DispatchItem[]>(`${M}.get_dispatch_items`),
  createPo: (soItemName: string, supplier: string) =>
    frappe.call<CreatePoResult>(`${M}.create_po_from_so_item`, { so_item_name: soItemName, supplier }),
  allocate: (soItemName: string) =>
    frappe.call<AllocateResult>(`${M}.allocate_so_item`, { so_item_name: soItemName }),
}
