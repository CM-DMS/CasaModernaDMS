import { frappe } from './frappe'

// ---------------------------------------------------------------------------
// Conversion API methods — document type conversion targets
// ---------------------------------------------------------------------------
const CONVERT_API: Record<string, Record<string, string>> = {
  Quotation: {
    'Sales Order':   'casamoderna_dms.sales_doc_conversions.make_sales_order_override_validity',
    'Sales Invoice': 'erpnext.selling.doctype.quotation.quotation.make_sales_invoice',
  },
  'Sales Order': {
    'Delivery Note': 'erpnext.selling.doctype.sales_order.sales_order.make_delivery_note',
    'Sales Invoice': 'erpnext.selling.doctype.sales_order.sales_order.make_sales_invoice',
  },
  'Delivery Note': {
    'Sales Invoice': 'erpnext.stock.doctype.delivery_note.delivery_note.make_sales_invoice',
  },
  'Purchase Order': {
    'Purchase Receipt': 'erpnext.buying.doctype.purchase_order.purchase_order.make_purchase_receipt',
    'Purchase Invoice': 'erpnext.buying.doctype.purchase_order.purchase_order.make_purchase_invoice',
  },
}

// Print format names
const PRINT_FORMAT: Record<string, string> = {
  Quotation:       'CasaModerna Quotation',
  'Sales Order':   'CasaModerna Sales Order',
  'Delivery Note': 'CasaModerna Delivery Note',
  'Sales Invoice': 'CasaModerna Sales Invoice',
}

// Route destinations when a converted doc template needs to be opened
const CONVERT_ROUTE: Record<string, string> = {
  'Sales Order':      '/sales/orders/',
  'Sales Invoice':    '/sales/invoices/',
  'Delivery Note':    '/sales/delivery-notes/',
  'Purchase Receipt': '/purchases/grn/',
}

// ---------------------------------------------------------------------------
// submitDoc — POST /api/method/frappe.client.submit
// ---------------------------------------------------------------------------
export async function submitDoc(doctype: string, name: string): Promise<void> {
  await frappe.post('/api/method/frappe.client.submit', {
    doc: JSON.stringify({ doctype, name }),
  })
}

// ---------------------------------------------------------------------------
// cancelDoc — POST /api/method/frappe.client.cancel
// ---------------------------------------------------------------------------
export async function cancelDoc(doctype: string, name: string): Promise<void> {
  await frappe.post('/api/method/frappe.client.cancel', {
    doc: JSON.stringify({ doctype, name }),
  })
}

// ---------------------------------------------------------------------------
// convertDoc — calls the conversion whitelisted method and saves the result.
// Returns the newly saved document name.
// ---------------------------------------------------------------------------
export async function convertDoc(
  fromDoctype: string,
  toDoctype: string,
  sourceName: string,
): Promise<string> {
  const method = CONVERT_API[fromDoctype]?.[toDoctype]
  if (!method) throw new Error(`No conversion configured from ${fromDoctype} → ${toDoctype}`)

  // Step 1: Get the new doc template from ERPNext
  const template = await frappe.call<Record<string, unknown>>(method, { source_name: sourceName })

  // Step 2: Save the new document (use saveDoc which handles PUT/POST)
  const saved = await frappe.saveDoc<{ name: string }>(toDoctype, template as Record<string, unknown>)

  const newName = (saved as { name?: string })?.name ?? (template?.name as string | undefined)
  if (!newName) throw new Error('Conversion succeeded but document name not returned')
  return newName
}

// ---------------------------------------------------------------------------
// printDoc — opens printview in a new tab
// ---------------------------------------------------------------------------
export function printDoc(doctype: string, name: string): void {
  const format = PRINT_FORMAT[doctype] ?? doctype
  const url = `/printview?doctype=${encodeURIComponent(doctype)}&name=${encodeURIComponent(name)}&format=${encodeURIComponent(format)}&trigger_print=1`
  window.open(url, '_blank', 'noopener,noreferrer')
}

// ---------------------------------------------------------------------------
// routeForConverted — returns the frontend route prefix for a converted doctype
// ---------------------------------------------------------------------------
export function routeForConverted(toDoctype: string): string | null {
  return CONVERT_ROUTE[toDoctype] ?? null
}
