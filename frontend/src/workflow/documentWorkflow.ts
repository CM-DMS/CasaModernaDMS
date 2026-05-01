/**
 * Document Workflow Engine — determines recommended next actions for a document.
 *
 * Returns recommended next actions based on document type, ERPNext docstatus,
 * and user capabilities. Pure function — no side effects, no API calls.
 *
 * ERPNext docstatus: 0 = Draft, 1 = Submitted, 2 = Cancelled
 */

export const DOC_TYPES = {
  QUOTATION: 'Quotation',
  SALES_ORDER: 'Sales Order',
  DELIVERY_NOTE: 'Delivery Note',
  SALES_INVOICE: 'Sales Invoice',
  PAYMENT_ENTRY: 'Payment Entry',
} as const

export const ACTION_IDS = {
  SAVE: 'SAVE',
  SUBMIT: 'SUBMIT',
  DELETE: 'DELETE',
  CANCEL: 'CANCEL',
  CANCEL_DRAFT: 'CANCEL_DRAFT',
  CREDIT_NOTE: 'CREDIT_NOTE',
  AMEND: 'AMEND',
  PRINT: 'PRINT',
  EMAIL: 'EMAIL',
  CONVERT: 'CONVERT',
  CONVERT_TO_SO: 'CONVERT_TO_SO',
  CONVERT_TO_PF: 'CONVERT_TO_PF',
  CONVERT_TO_DN: 'CONVERT_TO_DN',
  CONVERT_TO_SI: 'CONVERT_TO_SI',
  CREATE_PAYMENT: 'CREATE_PAYMENT',
  CONFIRM_SO: 'CONFIRM_SO',
} as const

export type ActionId = (typeof ACTION_IDS)[keyof typeof ACTION_IDS]
export type ActionVariant = 'primary' | 'secondary' | 'danger' | 'warning' | 'success' | 'ghost'

export interface DocAction {
  id: ActionId
  label: string
  variant: ActionVariant
  requiresCapability?: string
  tipId?: string
}

export interface Capabilities {
  can_cancel_document?: boolean
  can_confirm_so?: boolean
}

export function getNextActions({
  doctype,
  docstatus,
  workflow_state,
  status,
  capabilities = {},
}: {
  doctype: string
  docstatus: number
  workflow_state?: string | null
  status?: string | null
  capabilities?: Capabilities
}): DocAction[] {
  const actions: DocAction[] = []
  const isDraft = docstatus === 0
  const isSubmitted = docstatus === 1
  const isCancelled = docstatus === 2

  if (isDraft) {
    actions.push({ id: ACTION_IDS.SAVE, label: 'Save', variant: 'secondary' })
    actions.push({ id: ACTION_IDS.SUBMIT, label: 'Submit', variant: 'primary' })
  }

  if (isSubmitted) {
    switch (doctype) {
      case DOC_TYPES.QUOTATION:
        actions.push({ id: ACTION_IDS.CONVERT_TO_SO, label: '→ Sales Order', variant: 'primary' })
        actions.push({ id: ACTION_IDS.CONVERT_TO_PF, label: '→ Proforma', variant: 'secondary' })
        actions.push({ id: ACTION_IDS.PRINT, label: 'Print', variant: 'secondary' })
        actions.push({ id: ACTION_IDS.EMAIL, label: '✉ Email', variant: 'secondary' })
        break
      case DOC_TYPES.SALES_ORDER:
        if (workflow_state === 'Pending') {
          actions.push({
            id: ACTION_IDS.CONFIRM_SO,
            label: 'Confirm Order',
            variant: 'success',
            requiresCapability: 'can_confirm_so',
          })
        }
        if (workflow_state === 'Confirmed') {
          actions.push({ id: ACTION_IDS.CONVERT_TO_DN, label: '→ Delivery Note', variant: 'primary' })
        }
        if (status === 'To Bill') {
          actions.push({ id: ACTION_IDS.CONVERT_TO_SI, label: '→ Invoice', variant: 'primary' })
        }
        actions.push({ id: ACTION_IDS.PRINT, label: 'Print', variant: 'secondary' })
        actions.push({ id: ACTION_IDS.EMAIL, label: '✉ Email', variant: 'secondary' })
        break
      case DOC_TYPES.DELIVERY_NOTE:
        actions.push({ id: ACTION_IDS.CONVERT_TO_SI, label: '→ Invoice', variant: 'primary' })
        actions.push({ id: ACTION_IDS.PRINT, label: 'Print', variant: 'secondary' })
        actions.push({ id: ACTION_IDS.EMAIL, label: '✉ Email', variant: 'secondary' })
        break
      case DOC_TYPES.SALES_INVOICE:
        actions.push({ id: ACTION_IDS.CREATE_PAYMENT, label: 'Receive Payment', variant: 'primary' })
        actions.push({ id: ACTION_IDS.PRINT, label: 'Print', variant: 'secondary' })
        actions.push({ id: ACTION_IDS.EMAIL, label: '✉ Email', variant: 'secondary' })
        break
      default:
        actions.push({ id: ACTION_IDS.PRINT, label: 'Print', variant: 'secondary' })
        actions.push({ id: ACTION_IDS.EMAIL, label: '✉ Email', variant: 'secondary' })
    }
  }

  if (isDraft) {
    actions.push({ id: ACTION_IDS.CANCEL_DRAFT, label: `Cancel ${doctype}`, variant: 'danger' })
  }

  if (isSubmitted) {
    if (doctype === DOC_TYPES.SALES_INVOICE) {
      actions.push({ id: ACTION_IDS.CREDIT_NOTE, label: 'Credit Note', variant: 'danger' })
    } else if (capabilities.can_cancel_document) {
      actions.push({ id: ACTION_IDS.CANCEL, label: 'Cancel', variant: 'danger' })
    }
  }

  if (isCancelled) {
    actions.push({ id: ACTION_IDS.AMEND, label: 'Amend', variant: 'secondary' })
  }

  return actions.filter((a) => !a.requiresCapability || capabilities[a.requiresCapability as keyof Capabilities])
}

export function getDocumentStatusLabel(
  docstatus: number,
  workflow_state?: string | null,
): { label: string; colour: string } {
  if (docstatus === 2) return { label: 'Cancelled', colour: 'bg-red-100 text-red-700' }
  if (docstatus === 1) {
    if (workflow_state === 'Pending') return { label: 'Pending', colour: 'bg-amber-100 text-amber-700' }
    if (workflow_state === 'Confirmed') return { label: 'Confirmed', colour: 'bg-blue-100 text-blue-700' }
    return { label: 'Submitted', colour: 'bg-green-100 text-green-700' }
  }
  return { label: 'Draft', colour: 'bg-gray-100 text-gray-600' }
}
