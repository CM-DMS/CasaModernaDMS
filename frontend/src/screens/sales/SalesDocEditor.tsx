/**
 * SalesDocEditor — unified editor for Quotation, Sales Order, Delivery Note, Sales Invoice.
 * TypeScript port of V2 SalesDocEditor.jsx.
 *
 * Design rules:
 *  - NEVER compute grand totals or taxes in React.
 *  - After every save, replace entire state with the server response.
 *  - ItemsTable handles row editing; TotalsPanel shows server figures.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import { ItemsTable, type ItemRow } from '../../components/sales/ItemsTable'
import { TotalsPanel } from '../../components/sales/TotalsPanel'
import { SalesDocToolbar } from '../../components/sales/SalesDocToolbar'
import { CustomerSelectorModal } from '../../components/customers/CustomerSelectorModal'
import { ProductSelectorModal } from '../../components/products/ProductSelectorModal'
import { FreeTextItemModal } from '../../components/products/FreeTextItemModal'
import { ACTION_IDS, DOC_TYPES, type ActionId } from '../../workflow/documentWorkflow'
import { CM } from '../../components/ui/CMClassNames'
import { CMField, CMSection, CMButton, ErrorBanner, Spinner } from '../../components/ui/CMComponents'
import { fmtDate } from '../../utils/pricing'
import { usePermissions } from '../../auth/PermissionsProvider'

/* ── Constants ──────────────────────────────────────────────────────────────── */

const CUSTOMER_CHILD: Record<string, string> = {
  Quotation: 'Quotation Item',
  'Sales Order': 'Sales Order Item',
  'Delivery Note': 'Delivery Note Item',
  'Sales Invoice': 'Sales Invoice Item',
}

const PARTY_FIELD: Record<string, [string, string | null]> = {
  Quotation: ['party_name', 'quotation_to'],
  'Sales Order': ['customer', null],
  'Delivery Note': ['customer', null],
  'Sales Invoice': ['customer', null],
}

const DATE_FIELD: Record<string, string> = {
  Quotation: 'transaction_date',
  'Sales Order': 'transaction_date',
  'Delivery Note': 'posting_date',
  'Sales Invoice': 'posting_date',
}

const CM_COPY_FIELDS: Record<string, Record<string, string[]>> = {
  Quotation: {
    'Sales Order': [
      'cm_sales_person',
      'cm_notes',
      'cm_customer_b',
      'cm_customer_b_name',
      'cm_customer_a_amount',
      'cm_customer_b_amount',
      'terms',
    ],
    'Sales Invoice': [
      'cm_sales_person',
      'cm_notes',
      'cm_customer_b',
      'cm_customer_b_name',
      'cm_customer_a_amount',
      'cm_customer_b_amount',
      'cm_lift_required',
      'terms',
    ],
  },
  'Sales Order': {
    'Delivery Note': [
      'cm_route',
      'cm_delivery_instructions',
      'cm_lift_required',
      'cm_pickup_from_showroom',
      'cm_site_survey_required',
      'cm_notes',
    ],
    'Sales Invoice': [
      'cm_sales_person',
      'cm_notes',
      'cm_customer_b',
      'cm_customer_b_name',
      'cm_customer_a_amount',
      'cm_customer_b_amount',
      'cm_lift_required',
      'terms',
    ],
  },
  'Delivery Note': {
    'Sales Invoice': [
      'cm_sales_person',
      'cm_notes',
      'cm_customer_b',
      'cm_customer_b_name',
      'cm_customer_a_amount',
      'cm_customer_b_amount',
      'cm_lift_required',
    ],
  },
}

const CONVERT_API: Record<string, Record<string, string>> = {
  Quotation: {
    'Sales Order': 'casamoderna_dms.sales_doc_conversions.make_sales_order_override_validity',
    'Sales Invoice': 'erpnext.selling.doctype.quotation.quotation.make_sales_invoice',
  },
  'Sales Order': {
    'Delivery Note': 'erpnext.selling.doctype.sales_order.sales_order.make_delivery_note',
    'Sales Invoice': 'erpnext.selling.doctype.sales_order.sales_order.make_sales_invoice',
  },
  'Delivery Note': {
    'Sales Invoice': 'erpnext.stock.doctype.delivery_note.delivery_note.make_sales_invoice',
  },
}

const DOC_ROUTE: Record<string, string> = {
  Quotation: '/sales/quotations',
  'Sales Order': '/sales/orders',
  'Delivery Note': '/sales/delivery-notes',
  'Sales Invoice': '/sales/invoices',
}

const PRINT_FORMAT: Record<string, string> = {
  Quotation: 'CasaModerna Quotation',
  'Sales Order': 'CasaModerna Sales Order',
  'Delivery Note': 'CasaModerna Delivery Note',
  'Sales Invoice': 'CasaModerna Sales Invoice',
}

const NAMING_SERIES: Record<string, string> = {
  Quotation: 'QT .######',
  'Sales Order': 'SO .######',
  'Delivery Note': 'DN .######',
  'Sales Invoice': 'IN.######',
}

function openPrintWindow(doctype: string, name: string, format: string) {
  const url = `/printview?doctype=${encodeURIComponent(doctype)}&name=${encodeURIComponent(name)}&format=${encodeURIComponent(format)}&trigger_print=1`
  window.open(url, '_blank')
}

function blankDoc(doctype: string): Record<string, unknown> {
  const today = new Date().toISOString().slice(0, 10)
  const dateF = DATE_FIELD[doctype] || 'transaction_date'
  const base: Record<string, unknown> = {
    doctype,
    docstatus: 0,
    naming_series: NAMING_SERIES[doctype],
    [dateF]: today,
    items: [],
  }
  if (doctype === 'Quotation') {
    const d = new Date(today)
    d.setDate(d.getDate() + 30)
    base.cm_validity_days = '30'
    base.valid_till = d.toISOString().slice(0, 10)
  }
  return base
}

function blankItem(doctype: string): Partial<ItemRow> {
  return {
    ...(CUSTOMER_CHILD[doctype] ? { doctype: CUSTOMER_CHILD[doctype] } : {}),
    item_code: '',
    item_name: '',
    qty: 1,
    uom: '',
    rate: 0,
    amount: 0,
  } as Partial<ItemRow>
}

/* ── Types ──────────────────────────────────────────────────────────────────── */

export interface SalesDocEditorProps {
  doctype: string
  name?: string | null
  onSaved?: (doc: Record<string, unknown>) => void
  onSubmitted?: (doc: Record<string, unknown>) => void
  onNavigate?: (path: string) => void
}

/* ── Component ──────────────────────────────────────────────────────────────── */

export function SalesDocEditor({
  doctype,
  name,
  onSaved,
  onSubmitted,
  onNavigate,
}: SalesDocEditorProps) {
  const isNew = !name || name === 'new'
  const location = useLocation()
  const navigate = useNavigate()
  const { can } = usePermissions()

  const [doc, setDoc] = useState<Record<string, unknown>>(
    () => (location.state as any)?.doc || blankDoc(doctype),
  )
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  // Modals
  const [showCustomer, setShowCustomer] = useState(false)
  const [showCustomerB, setShowCustomerB] = useState(false)
  const [showProduct, setShowProduct] = useState(false)
  const [showFreeText, setShowFreeText] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancellingDraft, setCancellingDraft] = useState(false)

  const saveInProgressRef = useRef(false)

  const partyInfo = PARTY_FIELD[doctype] || ['customer', null]
  const partyField = partyInfo[0]
  const dateField = DATE_FIELD[doctype] || 'transaction_date'

  /* ── Load ── */
  useEffect(() => {
    if (isNew) {
      setDoc((location.state as any)?.doc || blankDoc(doctype))
      return
    }
    setLoading(true)
    frappe
      .getDoc(doctype, name!)
      .then((d: unknown) => {
        setDoc(d as Record<string, unknown>)
        setDirty(false)
      })
      .catch((err: Error) => setError(err.message || 'Failed to load document'))
      .finally(() => setLoading(false))
  }, [doctype, name, isNew]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Helpers ── */
  const patch = useCallback((updates: Record<string, unknown>) => {
    setDoc((prev) => ({ ...prev, ...updates }))
    setDirty(true)
  }, [])

  const handleItemChange = useCallback((idx: number, changes: Partial<ItemRow>) => {
    setDoc((prev) => {
      const items = ((prev.items as ItemRow[]) || []).map((r, i) =>
        i === idx ? { ...r, ...changes } : r,
      )
      return { ...prev, items }
    })
    setDirty(true)
  }, [])

  const handleAddRow = useCallback(() => {
    setDoc((prev) => ({
      ...prev,
      items: [...((prev.items as ItemRow[]) || []), blankItem(doctype)],
    }))
    setDirty(true)
  }, [doctype])

  const handleRemoveRow = useCallback((idx: number) => {
    setDoc((prev) => ({
      ...prev,
      items: ((prev.items as ItemRow[]) || []).filter((_, i) => i !== idx),
    }))
    setDirty(true)
  }, [])

  const handleMoveUp = useCallback((idx: number) => {
    if (idx === 0) return
    setDoc((prev) => {
      const items = [...((prev.items as ItemRow[]) || [])]
      ;[items[idx - 1], items[idx]] = [items[idx], items[idx - 1]]
      return { ...prev, items }
    })
    setDirty(true)
  }, [])

  const handleMoveDown = useCallback((idx: number) => {
    setDoc((prev) => {
      const items = [...((prev.items as ItemRow[]) || [])]
      if (idx >= items.length - 1) return prev
      ;[items[idx], items[idx + 1]] = [items[idx + 1], items[idx]]
      return { ...prev, items }
    })
    setDirty(true)
  }, [])

  const handleAddSeparator = useCallback(() => {
    setDoc((prev) => ({
      ...prev,
      items: [
        ...((prev.items as ItemRow[]) || []),
        {
          doctype: `${doctype} Item`,
          item_code: 'CM-SEPARATOR',
          item_name: '',
          qty: 1,
          uom: 'Nos',
          rate: 0,
        } as ItemRow,
      ],
    }))
    setDirty(true)
  }, [doctype])

  /* ── Customer selected ── */
  const handleCustomerSelect = (customer: Record<string, unknown>) => {
    setShowCustomer(false)
    patch({
      [partyField]: customer.name,
      customer_name: customer.customer_name || customer.name,
      cm_prices_inc_vat: customer.cm_prices_inc_vat != null ? customer.cm_prices_inc_vat : 1,
      ...(partyInfo[1] === 'quotation_to' ? { quotation_to: 'Customer' } : {}),
    })
  }

  /* ── Customer B selected ── */
  const handleCustomerBSelect = (customer: Record<string, unknown>) => {
    setShowCustomerB(false)
    patch({
      cm_customer_b: customer.name,
      cm_customer_b_name: customer.customer_name || customer.name,
    })
  }

  /* ── Product selected ── */
  const handleProductSelect = (product: Partial<ItemRow>) => {
    setShowProduct(false)
    const offerIncVat = product.cm_final_offer_inc_vat || (product as any).standard_rate || 0
    const rrpIncVat = product.cm_rrp_inc_vat || 0
    const vatFactor = 1 + (product.cm_vat_rate_percent || 18) / 100
    const offerExVat =
      offerIncVat > 0 ? Math.round((offerIncVat / vatFactor) * 100) / 100 : 0
    const rrpExVat =
      rrpIncVat > 0 ? Math.round((rrpIncVat / vatFactor) * 100) / 100 : 0
    const discPct =
      rrpIncVat > 0 && offerIncVat < rrpIncVat
        ? Math.round(((rrpIncVat - offerIncVat) / rrpIncVat) * 10000) / 100
        : product.cm_effective_discount_percent || 0

    const row: ItemRow = {
      ...(blankItem(doctype) as ItemRow),
      ...(product as ItemRow),
      item_name: (product as any).cm_given_name || product.item_name || '',
      uom: (product as any).stock_uom || product.uom || '',
      rate: offerIncVat,
      discount_percentage: discPct,
      cm_rrp_inc_vat: rrpIncVat,
      cm_rrp_ex_vat: rrpExVat,
      cm_final_offer_inc_vat: offerIncVat,
      cm_final_offer_ex_vat: offerExVat,
      cm_effective_discount_percent: discPct,
    }
    setDoc((prev) => ({ ...prev, items: [...((prev.items as ItemRow[]) || []), row] }))
    setDirty(true)
  }

  /* ── Free-text item added ── */
  const handleFreeTextAdd = (product: Partial<ItemRow>) => {
    setShowFreeText(false)
    const row: ItemRow = {
      ...(blankItem(doctype) as ItemRow),
      ...(product as ItemRow),
    }
    setDoc((prev) => ({ ...prev, items: [...((prev.items as ItemRow[]) || []), row] }))
    setDirty(true)
  }

  /* ── Save ── */
  const handleSave = useCallback(async () => {
    if (saveInProgressRef.current) return
    saveInProgressRef.current = true

    if (!doc[partyField]) {
      saveInProgressRef.current = false
      setError('Customer is required.')
      return
    }

    const rawItems = (doc.items as ItemRow[]) || []
    let cleanItems = rawItems.filter((r) => r.item_code?.trim())
    if (cleanItems.length === 0) {
      saveInProgressRef.current = false
      setError('At least one item is required.')
      return
    }

    // Hydrate missing UOM from Item master
    const missingUomCodes = Array.from(
      new Set(
        cleanItems
          .filter((r) => !String(r.uom || '').trim())
          .map((r) => String(r.item_code || '').trim())
          .filter(Boolean),
      ),
    )
    if (missingUomCodes.length > 0) {
      try {
        const itemRows: any[] = await frappe.call('frappe.client.get_list', {
          doctype: 'Item',
          fields: ['name', 'item_code', 'stock_uom'],
          filters: [['item_code', 'in', missingUomCodes]],
          limit_page_length: Math.max(50, missingUomCodes.length),
        })
        const uomByCode: Record<string, string> = {}
        for (const row of itemRows || []) {
          const code = String(row.item_code || row.name || '').trim()
          if (code && row.stock_uom) uomByCode[code] = row.stock_uom
        }
        cleanItems = cleanItems.map((r) => {
          if (String(r.uom || '').trim()) return r
          const fallback = uomByCode[String(r.item_code || '').trim()] || ''
          return fallback ? { ...r, uom: fallback } : r
        })
      } catch {
        // fall through
      }
    }

    const stillMissing = cleanItems.filter((r) => !String(r.uom || '').trim())
    if (stillMissing.length > 0) {
      const labels = stillMissing.map((r) => r.item_code).filter(Boolean).join(', ')
      saveInProgressRef.current = false
      setError(
        `UOM is required for: ${labels || 'one or more items'}. Re-select the item or use Add Product.`,
      )
      return
    }

    setSaving(true)
    setError(null)

    try {
      // Build payload — strip internal temp fields, always set tax template
      const docToSave: Record<string, unknown> = {
        ...doc,
        items: cleanItems.map(({ ...rest }) => rest),
        taxes_and_charges: doc.taxes_and_charges || 'VAT 18% (MT) - CM',
      }

      // Populate tax rows if absent — ERPNext won't fill them on REST saves
      if (!Array.isArray(docToSave.taxes) || (docToSave.taxes as unknown[]).length === 0) {
        try {
          const templateRows = await frappe.call(
            'erpnext.controllers.accounts_controller.get_taxes_and_charges',
            {
              master_doctype: 'Sales Taxes and Charges Template',
              master_name: docToSave.taxes_and_charges,
            },
          )
          docToSave.taxes =
            Array.isArray(templateRows) && templateRows.length > 0 ? templateRows : []
        } catch {
          delete docToSave.taxes
        }
      }

      const saved = await frappe.saveDoc<Record<string, unknown>>(doctype, docToSave)
      const savedDoc = (saved as any)?.data ?? saved
      setDoc(savedDoc)
      setDirty(false)
      onSaved?.(savedDoc)
    } catch (err: any) {
      setError(err.message || 'Save failed')
    } finally {
      setSaving(false)
      saveInProgressRef.current = false
    }
  }, [doctype, doc, partyField, onSaved])

  /* ── Submit ── */
  const handleSubmit = useCallback(async () => {
    if (dirty) {
      setError('Save the document before submitting.')
      return
    }
    if (!window.confirm(`Submit this ${doctype}? This cannot be undone.`)) return
    setSaving(true)
    setError(null)
    try {
      const latest = await frappe.getDoc(doctype, doc.name as string)
      await frappe.call('frappe.client.submit', { doc: latest })
      const refreshed = await frappe.getDoc<Record<string, unknown>>(doctype, doc.name as string)
      setDoc(refreshed)
      setDirty(false)
      onSubmitted?.(refreshed)
      const fmt = PRINT_FORMAT[doctype]
      if (fmt) openPrintWindow(doctype, doc.name as string, fmt)
    } catch (err: any) {
      setError(err.message || 'Submit failed')
    } finally {
      setSaving(false)
    }
  }, [doctype, doc.name, dirty, onSubmitted])

  /* ── Confirm SO ── */
  const handleConfirmSO = useCallback(async () => {
    if (!window.confirm('Confirm this Sales Order? It will move to Confirmed status.')) return
    setSaving(true)
    setError(null)
    try {
      await frappe.call('casamoderna_dms.sales_order_confirm.confirm_pending_so', {
        sales_order: doc.name,
      })
      const refreshed = await frappe.getDoc<Record<string, unknown>>(doctype, doc.name as string)
      setDoc(refreshed)
      setDirty(false)
    } catch (err: any) {
      setError(err.message || 'Confirm failed')
    } finally {
      setSaving(false)
    }
  }, [doctype, doc.name])

  /* ── Delete ── */
  const handleDelete = useCallback(async () => {
    const listRoute = DOC_ROUTE[doctype] || '/sales/quotations'
    if (!doc.name) {
      onNavigate?.(listRoute)
      return
    }
    if (!window.confirm(`Delete this ${doctype}? This is permanent.`)) return
    setSaving(true)
    setError(null)
    try {
      await frappe.deleteDoc(doctype, doc.name as string)
      onNavigate?.(listRoute)
    } catch (err: any) {
      setError(err.message || 'Delete failed')
      setSaving(false)
    }
  }, [doctype, doc.name, onNavigate])

  /* ── Cancel Draft ── */
  const handleCancelDraft = useCallback(() => {
    if (doctype === DOC_TYPES.QUOTATION) {
      setCancelReason('')
      setCancellingDraft(true)
      setShowCancelModal(true)
    } else {
      handleDelete()
    }
  }, [doctype, handleDelete])

  /* ── Cancel ── */
  const handleCancel = useCallback(() => {
    setCancelReason('')
    setCancellingDraft(false)
    setShowCancelModal(true)
  }, [])

  const handleCancelConfirm = useCallback(async () => {
    setShowCancelModal(false)
    setSaving(true)
    setError(null)
    try {
      if (cancellingDraft) {
        const latest = await frappe.getDoc(doctype, doc.name as string)
        await frappe.call('frappe.client.submit', { doc: latest })
      }
      await frappe.call('casamoderna_dms.sales_doc_conversions.cancel_document', {
        doctype,
        name: doc.name,
        cancel_reason: cancelReason.trim(),
      })
      const refreshed = await frappe.getDoc<Record<string, unknown>>(doctype, doc.name as string)
      setDoc(refreshed)
      setDirty(false)
    } catch (err: any) {
      setError(err.message || 'Cancel failed')
    } finally {
      setSaving(false)
      setCancellingDraft(false)
    }
  }, [doctype, doc.name, cancellingDraft, cancelReason])

  /* ── Convert ── */
  const handleConvert = useCallback(
    async (targetDoctype: string) => {
      const apiMethod = CONVERT_API[doctype]?.[targetDoctype]
      if (!apiMethod) {
        setError(`Conversion from ${doctype} to ${targetDoctype} is not supported.`)
        return
      }
      setSaving(true)
      setError(null)
      try {
        if (targetDoctype === 'Sales Invoice') {
          await frappe.call('casamoderna_dms.sales_doc_conversions.check_invoice_eligibility', {
            doctype,
            name: doc.name,
          })
          const newDoc: any = await frappe.call(apiMethod, { source_name: doc.name })
          const docToFill: Record<string, unknown> = {
            ...newDoc,
            doctype: targetDoctype,
            naming_series: NAMING_SERIES[targetDoctype],
          }
          const fieldsToCopy = CM_COPY_FIELDS[doctype]?.[targetDoctype] ?? []
          for (const field of fieldsToCopy) {
            if (doc[field] !== undefined && doc[field] !== null && doc[field] !== '') {
              docToFill[field] = doc[field]
            }
          }
          navigate(`${DOC_ROUTE[targetDoctype]}/new`, { state: { doc: docToFill } })
          return
        }

        const newDoc: any = await frappe.call(apiMethod, { source_name: doc.name })
        const docToSave: Record<string, unknown> = { ...newDoc, doctype: targetDoctype }

        if (targetDoctype === 'Sales Order' && !docToSave.delivery_date) {
          const tomorrow = new Date()
          tomorrow.setDate(tomorrow.getDate() + 1)
          docToSave.delivery_date = tomorrow.toISOString().slice(0, 10)
        }
        if (targetDoctype === 'Sales Order') {
          docToSave.payment_schedule = []
        }

        const fieldsToCopy = CM_COPY_FIELDS[doctype]?.[targetDoctype] ?? []
        for (const field of fieldsToCopy) {
          if (doc[field] !== undefined && doc[field] !== null && doc[field] !== '') {
            docToSave[field] = doc[field]
          }
        }

        const saved: any = await frappe.saveDoc(targetDoctype, docToSave)
        const targetRoute = DOC_ROUTE[targetDoctype] || '/sales/quotations'
        onNavigate?.(`${targetRoute}/${encodeURIComponent(saved.name || saved.data?.name)}`)
      } catch (err: any) {
        setError(err.message || 'Conversion failed')
      } finally {
        setSaving(false)
      }
    },
    [doctype, doc, navigate, onNavigate],
  )

  /* ── Amend ── */
  const handleAmend = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      const amended: any = await frappe.call(
        'casamoderna_dms.sales_doc_conversions.amend_document',
        { doctype, name: doc.name },
      )
      const amendedDoc = amended?.message ?? amended
      onSaved?.(amendedDoc)
      const selfRoute = DOC_ROUTE[doctype] || '/sales/quotations'
      onNavigate?.(`${selfRoute}/${encodeURIComponent(amendedDoc.name)}`)
    } catch (err: any) {
      setError(err.message || 'Amend failed')
    } finally {
      setSaving(false)
    }
  }, [doctype, doc.name, onSaved, onNavigate])

  /* ── Convert to Proforma ── */
  const handleConvertToProforma = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      const result: any = await frappe.call(
        'casamoderna_dms.sales_doc_conversions.create_quotation_proforma',
        { quotation: doc.name },
      )
      const name = result?.name
      if (!name) throw new Error('Proforma creation did not return a document name.')
      onNavigate?.(`/sales/quotations/${encodeURIComponent(name)}`)
    } catch (err: any) {
      setError(err.message || 'Proforma creation failed')
    } finally {
      setSaving(false)
    }
  }, [doc.name, onNavigate])

  /* ── Action dispatcher ── */
  const handleAction = useCallback(
    (actionId: ActionId) => {
      switch (actionId) {
        case ACTION_IDS.SAVE:
          return handleSave()
        case ACTION_IDS.SUBMIT:
          return handleSubmit()
        case ACTION_IDS.CONFIRM_SO:
          return handleConfirmSO()
        case ACTION_IDS.CANCEL:
          return handleCancel()
        case ACTION_IDS.CANCEL_DRAFT:
          return handleCancelDraft()
        case ACTION_IDS.DELETE:
          return handleDelete()
        case ACTION_IDS.AMEND:
          return handleAmend()
        case ACTION_IDS.CONVERT_TO_PF:
          return handleConvertToProforma()
        case ACTION_IDS.CONVERT_TO_SO:
          return handleConvert('Sales Order')
        case ACTION_IDS.CONVERT_TO_DN:
          return handleConvert('Delivery Note')
        case ACTION_IDS.CONVERT_TO_SI:
          return handleConvert('Sales Invoice')
        case ACTION_IDS.CREATE_PAYMENT:
          return navigate('/sales/receipts/new', { state: { payment_purpose: 'Invoice Settlement' } })
        case ACTION_IDS.CREDIT_NOTE:
          return navigate('/sales/credit-notes/new', { state: { source_invoice: doc.name } })
        case ACTION_IDS.PRINT: {
          const fmt = PRINT_FORMAT[doctype]
          if (fmt && doc.name) openPrintWindow(doctype, doc.name as string, fmt)
          return
        }
        default:
          break
      }
    },
    [
      handleSave,
      handleSubmit,
      handleConfirmSO,
      handleCancel,
      handleCancelDraft,
      handleDelete,
      handleAmend,
      handleConvertToProforma,
      handleConvert,
      doctype,
      doc.name,
      navigate,
    ],
  )

  /* ── Render ── */
  const readOnly = doc.docstatus === 1 || doc.docstatus === 2
  const customerName = (doc.customer_name as string) || (doc[partyField] as string) || ''
  const dateVal = (doc[dateField] as string) || ''
  const showIncVat = doc.cm_prices_inc_vat !== 0

  if (loading) return <Spinner />

  return (
    <div className="flex flex-col min-h-0">
      {/* Toolbar */}
      <SalesDocToolbar
        doctype={doctype}
        docstatus={Number(doc.docstatus ?? 0)}
        workflow_state={doc.workflow_state as string | null}
        status={doc.status as string | null}
        capabilities={{ can_confirm_so: can('canConfirmSO') }}
        dirty={dirty}
        saving={saving}
        name={doc.name as string | null}
        onAction={handleAction}
      />

      {/* Error banner */}
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* Dirty hint */}
      {dirty && !readOnly && (
        <div className="px-3 pt-1 text-[11px] text-amber-600">
          Unsaved changes — click Save in the toolbar.
        </div>
      )}

      <div className="flex-1 p-3 space-y-4">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* ── Left column ── */}
          <div className="xl:col-span-2 space-y-4">
            {/* Header card */}
            <CMSection title="Header">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Customer */}
                <div>
                  <label className={CM.label}>Customer *</label>
                  <div className="flex gap-2 items-center">
                    <div className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-800 bg-gray-50 min-h-[34px]">
                      {customerName || (
                        <span className="text-gray-400">No customer selected</span>
                      )}
                    </div>
                    {!readOnly && (
                      <CMButton variant="secondary" onClick={() => setShowCustomer(true)}>
                        Select
                      </CMButton>
                    )}
                  </div>
                </div>

                {/* Date */}
                <CMField label={dateField === 'posting_date' ? 'Posting Date' : 'Date'}>
                  <input
                    type="date"
                    className={CM.input}
                    value={dateVal}
                    onChange={(e) => {
                      const updates: Record<string, unknown> = { [dateField]: e.target.value }
                      if (doctype === 'Quotation' && e.target.value) {
                        const days = parseInt((doc.cm_validity_days as string) || '30', 10)
                        const d = new Date(e.target.value)
                        d.setDate(d.getDate() + days)
                        updates.valid_till = d.toISOString().slice(0, 10)
                      }
                      patch(updates)
                    }}
                    disabled={readOnly}
                  />
                </CMField>

                {/* Validity (Quotation only) */}
                {doctype === 'Quotation' && (
                  <CMField label="Validity">
                    <select
                      className={CM.select}
                      value={(doc.cm_validity_days as string) || '30'}
                      onChange={(e) => {
                        const days = parseInt(e.target.value, 10)
                        const base =
                          (doc.transaction_date as string) ||
                          new Date().toISOString().slice(0, 10)
                        const d = new Date(base)
                        d.setDate(d.getDate() + days)
                        patch({
                          cm_validity_days: e.target.value,
                          valid_till: d.toISOString().slice(0, 10),
                        })
                      }}
                      disabled={readOnly}
                    >
                      <option value="7">7 days</option>
                      <option value="14">14 days</option>
                      <option value="30">30 days</option>
                    </select>
                  </CMField>
                )}

                {/* Title */}
                <CMField label="Title">
                  <input
                    className={CM.input}
                    value={(doc.title as string) || ''}
                    onChange={(e) => patch({ title: e.target.value })}
                    disabled={readOnly}
                    placeholder="Optional reference title…"
                  />
                </CMField>

                {/* PO No (Sales Order + Invoice) */}
                {(doctype === 'Sales Order' || doctype === 'Sales Invoice') && (
                  <CMField label="Customer PO No.">
                    <input
                      className={CM.input}
                      value={(doc.po_no as string) || ''}
                      onChange={(e) => patch({ po_no: e.target.value })}
                      disabled={readOnly}
                    />
                  </CMField>
                )}

                {/* Sales Person */}
                <CMField label="Sales Person">
                  <input
                    className={CM.input}
                    value={(doc.cm_sales_person as string) || ''}
                    onChange={(e) => patch({ cm_sales_person: e.target.value })}
                    disabled={readOnly}
                    placeholder="Sales person…"
                  />
                </CMField>
              </div>

              {/* Customer B split */}
              {(doctype === 'Quotation' ||
                doctype === 'Sales Order' ||
                doctype === 'Sales Invoice') && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="flex justify-between items-center mb-2">
                    <span className={CM.sectionTitle}>Customer B Split</span>
                    {!readOnly && !doc.cm_customer_b && (
                      <button
                        type="button"
                        className="text-[11px] text-emerald-700 hover:underline"
                        onClick={() => setShowCustomerB(true)}
                      >
                        + Add Second Customer
                      </button>
                    )}
                  </div>
                  {doc.cm_customer_b && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <CMField label="Customer B">
                        <div className="flex gap-2 items-center">
                          <div className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-800 bg-gray-50 min-h-[34px]">
                            {(doc.cm_customer_b_name as string) ||
                              (doc.cm_customer_b as string) ||
                              'Not set'}
                          </div>
                          {!readOnly && (
                            <div className="flex gap-1">
                              <button
                                type="button"
                                className="text-[11px] text-emerald-700 hover:underline"
                                onClick={() => setShowCustomerB(true)}
                              >
                                Change
                              </button>
                              <button
                                type="button"
                                className="text-[11px] text-red-600 hover:underline"
                                onClick={() =>
                                  patch({
                                    cm_customer_b: '',
                                    cm_customer_b_name: '',
                                    cm_customer_b_amount: '',
                                  })
                                }
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </div>
                      </CMField>
                      <CMField label="Customer A Amount (€)">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className={CM.input}
                          value={(doc.cm_customer_a_amount as string) || ''}
                          onChange={(e) => patch({ cm_customer_a_amount: e.target.value })}
                          disabled={readOnly}
                        />
                      </CMField>
                      <CMField label="Customer B Amount (€)">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className={CM.input}
                          value={(doc.cm_customer_b_amount as string) || ''}
                          onChange={(e) => patch({ cm_customer_b_amount: e.target.value })}
                          disabled={readOnly}
                        />
                      </CMField>
                    </div>
                  )}
                </div>
              )}
            </CMSection>

            {/* Items */}
            <CMSection title="Items">
              <ItemsTable
                items={(doc.items as ItemRow[]) || []}
                readOnly={readOnly}
                showIncVat={!!showIncVat}
                onItemChange={handleItemChange}
                onRemoveRow={handleRemoveRow}
                onMoveUp={handleMoveUp}
                onMoveDown={handleMoveDown}
              />
              {!readOnly && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <CMButton variant="secondary" onClick={() => setShowProduct(true)}>
                    + Add Product
                  </CMButton>
                  <CMButton variant="secondary" onClick={() => setShowFreeText(true)}>
                    + Free Text
                  </CMButton>
                  <CMButton variant="ghost" onClick={handleAddSeparator}>
                    + Separator
                  </CMButton>
                  <CMButton variant="ghost" onClick={handleAddRow}>
                    + Blank Row
                  </CMButton>
                </div>
              )}
            </CMSection>

            {/* Notes & Terms */}
            <CMSection title="Notes & Terms">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <CMField label="Internal Notes">
                  <textarea
                    className={CM.textarea}
                    rows={3}
                    value={(doc.cm_notes as string) || ''}
                    onChange={(e) => patch({ cm_notes: e.target.value })}
                    disabled={readOnly}
                    placeholder="Notes visible to staff only…"
                  />
                </CMField>
                <CMField label="Terms & Conditions">
                  <textarea
                    className={CM.textarea}
                    rows={3}
                    value={(doc.terms as string) || ''}
                    onChange={(e) => patch({ terms: e.target.value })}
                    disabled={readOnly}
                    placeholder="Printed on document…"
                  />
                </CMField>
              </div>
            </CMSection>

            {/* Delivery section — Sales Order / Delivery Note only */}
            {(doctype === 'Sales Order' || doctype === 'Delivery Note') && (
              <CMSection title="Delivery">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <CMField label="Delivery Date">
                    <input
                      type="date"
                      className={CM.input}
                      value={(doc.delivery_date as string) || ''}
                      onChange={(e) => patch({ delivery_date: e.target.value })}
                      disabled={readOnly}
                    />
                  </CMField>
                  <CMField label="Route">
                    <input
                      className={CM.input}
                      value={(doc.cm_route as string) || ''}
                      onChange={(e) => patch({ cm_route: e.target.value })}
                      disabled={readOnly}
                    />
                  </CMField>
                  <CMField label="Delivery Instructions">
                    <textarea
                      className={CM.textarea}
                      rows={2}
                      value={(doc.cm_delivery_instructions as string) || ''}
                      onChange={(e) => patch({ cm_delivery_instructions: e.target.value })}
                      disabled={readOnly}
                    />
                  </CMField>
                </div>
                <div className="flex gap-4 mt-3 text-sm">
                  {[
                    ['cm_lift_required', 'Lift Required'],
                    ['cm_pickup_from_showroom', 'Pickup from Showroom'],
                    ['cm_site_survey_required', 'Site Survey Required'],
                  ].map(([field, label]) => (
                    <label key={field} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!(doc[field] as boolean)}
                        onChange={(e) => patch({ [field]: e.target.checked ? 1 : 0 })}
                        disabled={readOnly}
                        className="rounded"
                      />
                      <span className="text-xs text-gray-700">{label}</span>
                    </label>
                  ))}
                </div>
              </CMSection>
            )}
          </div>

          {/* ── Right column ── */}
          <div className="space-y-4">
            {/* Document info */}
            <CMSection title="Document Info">
              <div className="space-y-1.5 text-xs">
                {doc.name && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Document</span>
                    <span className="font-mono font-medium text-gray-800">{doc.name as string}</span>
                  </div>
                )}
                {doc.workflow_state && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Status</span>
                    <span className="text-gray-800">{doc.workflow_state as string}</span>
                  </div>
                )}
                {doc.amended_from && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Amended from</span>
                    <span className="text-gray-700 font-mono">{doc.amended_from as string}</span>
                  </div>
                )}
                {doc.modified && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Last modified</span>
                    <span className="text-gray-700">{fmtDate(doc.modified as string)}</span>
                  </div>
                )}
                {doc.modified_by && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">By</span>
                    <span className="text-gray-700">{doc.modified_by as string}</span>
                  </div>
                )}
              </div>
            </CMSection>

            {/* Totals */}
            <TotalsPanel doc={doc as any} />

            {/* Save shortcut */}
            {!readOnly && (
              <CMButton
                variant="primary"
                disabled={saving}
                onClick={handleSave}
                className="w-full justify-center"
              >
                {saving ? 'Saving…' : 'Save'}
              </CMButton>
            )}
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      <CustomerSelectorModal
        isOpen={showCustomer}
        onSelect={handleCustomerSelect as any}
        onClose={() => setShowCustomer(false)}
      />
      <CustomerSelectorModal
        isOpen={showCustomerB}
        onSelect={handleCustomerBSelect as any}
        onClose={() => setShowCustomerB(false)}
      />
      <ProductSelectorModal
        isOpen={showProduct}
        onSelect={handleProductSelect}
        onClose={() => setShowProduct(false)}
      />
      <FreeTextItemModal
        isOpen={showFreeText}
        onAdd={handleFreeTextAdd}
        onClose={() => setShowFreeText(false)}
      />

      {/* Cancel modal */}
      {showCancelModal && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setShowCancelModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b">
              <div className="text-sm font-semibold text-gray-800">
                {cancellingDraft ? 'Cancel Draft Quotation' : `Cancel ${doctype}`}
              </div>
            </div>
            <div className="p-4">
              <label className={CM.label}>Reason (required)</label>
              <textarea
                className={CM.textarea + ' w-full'}
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Reason for cancellation…"
                autoFocus
              />
            </div>
            <div className="px-4 pb-3 flex justify-end gap-2">
              <CMButton variant="ghost" onClick={() => setShowCancelModal(false)}>
                Cancel
              </CMButton>
              <CMButton
                variant="danger"
                disabled={!cancelReason.trim()}
                onClick={handleCancelConfirm}
              >
                Confirm Cancel
              </CMButton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
