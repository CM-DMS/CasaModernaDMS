/**
 * WarrantyEditor — create or edit a CM Warranty record.
 *
 * Routes:
 *   /service/warranties/new    → create
 *   /service/warranties/:id    → view/edit
 */
import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { frappe } from '../../api/frappe'
import {
  PageHeader, DetailSection, Btn, inputCls, ErrorBox,
} from '../../components/shared/ui'
import { CM } from '../../components/ui/CMClassNames'
import { fmtDate } from '../../utils/fmt'

interface WarrantyDoc {
  name?: string
  customer?: string
  customer_name?: string
  item_code?: string
  item_name?: string
  serial_no?: string
  warranty_months?: number
  purchase_date?: string
  warranty_expiry?: string
  warranty_status?: string
  sales_order?: string
  sales_invoice?: string
  linked_job_cards?: string
  notes?: string
}

const EMPTY: WarrantyDoc = {
  customer: '',
  customer_name: '',
  item_code: '',
  item_name: '',
  serial_no: '',
  warranty_months: 12,
  purchase_date: '',
  warranty_expiry: '',
  warranty_status: 'Active',
  sales_order: '',
  sales_invoice: '',
  linked_job_cards: '',
  notes: '',
}

function calcExpiry(purchaseDate: string, months: number): string {
  if (!purchaseDate || !months) return ''
  const d = new Date(purchaseDate)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

export function WarrantyEditor() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isNew    = !id || id === 'new'

  const [doc, setDoc]         = useState<WarrantyDoc>(EMPTY)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    if (isNew) return
    ;(async () => {
      try {
        const res = await frappe.call<WarrantyDoc>('casamoderna_dms.warranty_api.get_warranty', { name: id })
        if (res) setDoc(res)
      } catch (e: unknown) {
        setError((e as Error).message || 'Failed to load')
      }
      setLoading(false)
    })()
  }, [id, isNew])

  function set<K extends keyof WarrantyDoc>(field: K, value: WarrantyDoc[K]) {
    setDoc((prev) => {
      const next = { ...prev, [field]: value }
      if ((field === 'purchase_date' || field === 'warranty_months') && next.purchase_date && next.warranty_months) {
        next.warranty_expiry = calcExpiry(next.purchase_date, Number(next.warranty_months))
      }
      return next
    })
  }

  async function save() {
    if (!doc.customer || !doc.item_code || !doc.purchase_date) {
      setError('Customer, Item Code and Purchase Date are required.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await frappe.call<WarrantyDoc>('casamoderna_dms.warranty_api.save_warranty', { doc })
      if (res?.name) navigate(`/service/warranties/${encodeURIComponent(res.name)}`)
    } catch (e: unknown) {
      setError((e as Error).message || 'Save failed')
    }
    setSaving(false)
  }

  if (loading) return <div className="p-8 text-sm text-gray-400 animate-pulse">Loading…</div>

  const daysLeft = doc.warranty_expiry
    ? Math.ceil((new Date(doc.warranty_expiry).getTime() - Date.now()) / 86_400_000)
    : null

  return (
    <div className="space-y-5">
      <PageHeader
        title={isNew ? 'New Warranty' : `Warranty: ${id}`}
        subtitle={isNew ? 'Register product warranty' : `Status: ${doc.warranty_status ?? '—'}`}
        actions={
          <div className="flex gap-2">
            <Btn variant="ghost" onClick={() => navigate(-1 as never)}>Cancel</Btn>
            <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
          </div>
        }
      />

      {error && <ErrorBox message={error} />}

      {!isNew && daysLeft !== null && (
        <div className={`rounded-lg px-4 py-3 text-sm ${
          daysLeft < 0
            ? 'bg-gray-50 border border-gray-200 text-gray-500'
            : daysLeft <= 30
            ? 'bg-amber-50 border border-amber-200 text-amber-800'
            : 'bg-green-50 border border-green-200 text-green-800'
        }`}>
          {daysLeft < 0
            ? `Warranty expired ${Math.abs(daysLeft)} days ago (${fmtDate(doc.warranty_expiry!)})`
            : daysLeft === 0
            ? 'Warranty expires today'
            : `${daysLeft} days remaining — expires ${fmtDate(doc.warranty_expiry!)}`}
        </div>
      )}

      <DetailSection title="Customer">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={CM.label}>Customer <span className="text-red-500">*</span></label>
            <input className={inputCls} value={doc.customer ?? ''} onChange={(e) => set('customer', e.target.value)} placeholder="Customer ID" />
          </div>
          <div>
            <label className={CM.label}>Status</label>
            <select className={CM.select} value={doc.warranty_status ?? 'Active'} onChange={(e) => set('warranty_status', e.target.value)}>
              <option>Active</option>
              <option>Expired</option>
              <option>Claimed</option>
              <option>Void</option>
            </select>
          </div>
        </div>
      </DetailSection>

      <DetailSection title="Product">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={CM.label}>Item Code <span className="text-red-500">*</span></label>
            <input className={inputCls} value={doc.item_code ?? ''} onChange={(e) => set('item_code', e.target.value)} placeholder="Item code" />
          </div>
          <div>
            <label className={CM.label}>Serial / Batch No</label>
            <input className={inputCls} value={doc.serial_no ?? ''} onChange={(e) => set('serial_no', e.target.value)} placeholder="Optional" />
          </div>
        </div>
      </DetailSection>

      <DetailSection title="Warranty Period">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={CM.label}>Purchase Date <span className="text-red-500">*</span></label>
            <input type="date" className={inputCls} value={doc.purchase_date ?? ''} onChange={(e) => set('purchase_date', e.target.value)} />
          </div>
          <div>
            <label className={CM.label}>Warranty (months)</label>
            <input
              type="number" className={inputCls} value={doc.warranty_months ?? 12} min={1} max={120}
              onChange={(e) => set('warranty_months', Number(e.target.value))}
            />
          </div>
          <div>
            <label className={CM.label}>Expiry Date</label>
            <input type="date" className={inputCls} value={doc.warranty_expiry ?? ''} onChange={(e) => set('warranty_expiry', e.target.value)} />
          </div>
        </div>
      </DetailSection>

      <DetailSection title="Linked Documents">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={CM.label}>Sales Order</label>
            <input className={inputCls} value={doc.sales_order ?? ''} onChange={(e) => set('sales_order', e.target.value)} placeholder="SO-XXXXX" />
          </div>
          <div>
            <label className={CM.label}>Sales Invoice</label>
            <input className={inputCls} value={doc.sales_invoice ?? ''} onChange={(e) => set('sales_invoice', e.target.value)} placeholder="SINV-XXXXX" />
          </div>
          <div>
            <label className={CM.label}>Linked Job Cards</label>
            <input className={inputCls} value={doc.linked_job_cards ?? ''} onChange={(e) => set('linked_job_cards', e.target.value)} placeholder="JC-001, JC-002" />
          </div>
        </div>
      </DetailSection>

      <DetailSection title="Notes">
        <textarea className={`${CM.textarea} h-24`} value={doc.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="Internal notes…" />
      </DetailSection>
    </div>
  )
}
