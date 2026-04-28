import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { PageHeader } from '../../components/shared/ui'
import { CM } from '../../components/ui/CMClassNames'
import { usePermissions } from '../../auth/PermissionsProvider'
import { priceListsApi } from '../../api/priceLists'
import { frappe } from '../../api/frappe'

const CONFIGURATOR_TYPES = ['Night Collection', 'Lorella Collection', 'Topline Bedrooms', 'Sofa', 'Made-to-Order', 'Other']

interface Tier {
  _id?: string
  tier_name: string
  min_order_value_inc_vat: string | number
}

interface MatrixRow {
  tier_name: string
  role_name: string
  mode: string
  option_code: string
  handle_variant: string
  finish_code: string
  seat_count: string | number
  offer_price_inc_vat: string | number
  rrp_inc_vat: string | number
  cost_price: string | number
  notes?: string
}

interface PricingDoc {
  name: string | null
  price_list: string
  configurator_type: string
  valid_from: string
  valid_to: string
  tiers: Tier[]
  matrix_rows: MatrixRow[]
}

const BLANK_DOC: PricingDoc = {
  name:              null,
  price_list:        '',
  configurator_type: '',
  valid_from:        '',
  valid_to:          '',
  tiers:             [],
  matrix_rows:       [],
}

interface PriceListItem { name: string; currency: string; cm_configurator_type: string }

function TierTable({ tiers, onChange, readOnly }: { tiers: Tier[]; onChange: (t: Tier[]) => void; readOnly: boolean }) {
  function addTier() {
    onChange([...tiers, { _id: Math.random().toString(36).slice(2), tier_name: '', min_order_value_inc_vat: '' }])
  }
  function updateTier(idx: number, field: keyof Tier, value: string) {
    onChange(tiers.map((t, i) => i === idx ? { ...t, [field]: value } : t))
  }
  function removeTier(idx: number) { onChange(tiers.filter((_, i) => i !== idx)) }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-medium uppercase tracking-wide text-gray-500 px-1">
        <span>Tier Name</span><span>Min Order Value (inc VAT €)</span><span />
      </div>
      {tiers.map((tier, idx) => (
        <div key={tier._id || tier.tier_name || String(idx)} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
          <input type="text" value={tier.tier_name} onChange={(e) => updateTier(idx, 'tier_name', e.target.value)}
            placeholder="e.g. Standard" disabled={readOnly} className={CM.input} />
          <input type="number" min="0" step="0.01" value={tier.min_order_value_inc_vat as string}
            onChange={(e) => updateTier(idx, 'min_order_value_inc_vat', e.target.value)}
            placeholder="0.00" disabled={readOnly} className={CM.input} />
          {!readOnly && (
            <button type="button" onClick={() => removeTier(idx)} className="rounded p-1 text-gray-400 hover:text-red-600" title="Remove">✕</button>
          )}
        </div>
      ))}
      {!readOnly && (
        <button type="button" onClick={addTier} className="mt-1 text-sm text-indigo-600 hover:text-indigo-800">+ Add Tier</button>
      )}
    </div>
  )
}

const MATRIX_COLS = [
  { key: 'tier_name',           label: 'Tier',       type: 'text',   placeholder: 'Standard', width: 'w-28' },
  { key: 'role_name',           label: 'Role',       type: 'text',   placeholder: 'OUTPUT',   width: 'w-24' },
  { key: 'mode',                label: 'Mode',       type: 'text',   placeholder: 'HINGED',   width: 'w-20' },
  { key: 'option_code',         label: 'Option',     type: 'text',   placeholder: 'OPT-A',    width: 'w-20' },
  { key: 'handle_variant',      label: 'Handle',     type: 'text',   placeholder: '',         width: 'w-20' },
  { key: 'finish_code',         label: 'Finish',     type: 'text',   placeholder: '',         width: 'w-20' },
  { key: 'seat_count',          label: 'Seats',      type: 'number', placeholder: '',         width: 'w-16' },
  { key: 'offer_price_inc_vat', label: 'Offer (€)',  type: 'number', placeholder: '0.00',     width: 'w-24', required: true },
  { key: 'rrp_inc_vat',         label: 'RRP (€)',    type: 'number', placeholder: '0.00',     width: 'w-24' },
  { key: 'cost_price',          label: 'Cost (€)',   type: 'number', placeholder: '0.00',     width: 'w-24' },
] as const

function MatrixTable({ rows, onChange, definedTiers, readOnly }: {
  rows: MatrixRow[]; onChange: (rows: MatrixRow[]) => void; definedTiers: Tier[]; readOnly: boolean
}) {
  function addRow() {
    onChange([...rows, { tier_name: definedTiers[0]?.tier_name ?? '', role_name: 'OUTPUT', mode: '', option_code: '', handle_variant: '', finish_code: '', seat_count: '', offer_price_inc_vat: '', rrp_inc_vat: '', cost_price: '', notes: '' }])
  }
  function updateRow(idx: number, field: string, value: string) {
    onChange(rows.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }
  function removeRow(idx: number) { onChange(rows.filter((_, i) => i !== idx)) }

  return (
    <div>
      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              {MATRIX_COLS.map((col) => (
                <th key={col.key} className={`px-2 py-2 text-left font-medium text-gray-500 ${col.width}`}>
                  {col.label}{('required' in col && col.required) ? <span className="text-red-500 ml-0.5">*</span> : null}
                </th>
              ))}
              {!readOnly && <th className="px-2 py-2 w-8" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {rows.length === 0 && (
              <tr><td colSpan={MATRIX_COLS.length + 1} className="px-3 py-4 text-center text-gray-400">No matrix rows yet.</td></tr>
            )}
            {rows.map((row, idx) => (
              <tr key={idx} className="hover:bg-gray-50">
                {MATRIX_COLS.map((col) => (
                  <td key={col.key} className={`px-1 py-1 ${col.width}`}>
                    {col.key === 'tier_name' && definedTiers.length > 0 ? (
                      <select value={String(row[col.key] ?? '')} onChange={(e) => updateRow(idx, col.key, e.target.value)}
                        disabled={readOnly} className={`${CM.select} text-xs py-1`}>
                        <option value="">—</option>
                        {definedTiers.map((t) => <option key={t.tier_name} value={t.tier_name}>{t.tier_name}</option>)}
                      </select>
                    ) : (
                      <input type={col.type} min={col.type === 'number' ? '0' : undefined}
                        step={col.type === 'number' ? '0.01' : undefined}
                        value={String(row[col.key as keyof MatrixRow] ?? '')}
                        onChange={(e) => updateRow(idx, col.key, e.target.value)}
                        placeholder={col.placeholder} disabled={readOnly}
                        className={`${CM.input} text-xs py-1`} />
                    )}
                  </td>
                ))}
                {!readOnly && (
                  <td className="px-1 py-1">
                    <button type="button" onClick={() => removeRow(idx)} className="rounded p-1 text-gray-300 hover:text-red-600" title="Remove">✕</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <button type="button" onClick={addRow} className="mt-2 text-sm text-indigo-600 hover:text-indigo-800">+ Add Row</button>
      )}
    </div>
  )
}

export function PriceListEditor() {
  const { id }     = useParams<{ id: string }>()
  const navigate   = useNavigate()
  const location   = useLocation()
  const { can }    = usePermissions()
  const isNew      = !id || id === 'new'

  const [doc, setDoc]         = useState<PricingDoc>(() => {
    const state = (location.state ?? {}) as { price_list?: string; configurator_type?: string }
    return { ...BLANK_DOC, price_list: state.price_list ?? '', configurator_type: state.configurator_type ?? '' }
  })
  const [priceLists, setPriceLists] = useState<PriceListItem[]>([])
  const [loading, setLoading]       = useState(!isNew)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [dirty, setDirty]           = useState(false)
  const readOnly = !can('canAdmin')

  useEffect(() => {
    frappe.getList<PriceListItem>('Price List', {
      fields: ['name', 'currency', 'cm_configurator_type'],
      filters: [['selling', '=', '1']],
      limit: 200,
      order_by: 'name asc',
    }).then((data) => setPriceLists(data ?? [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (isNew) return
    setLoading(true)
    priceListsApi.getConfiguratorPricing(decodeURIComponent(id ?? ''))
      .then((data) => { setDoc(data as unknown as PricingDoc); setDirty(false) })
      .catch((err: Error) => setError(err.message || 'Failed to load.'))
      .finally(() => setLoading(false))
  }, [id, isNew])

  function update<K extends keyof PricingDoc>(field: K, value: PricingDoc[K]) {
    setDoc((d) => ({ ...d, [field]: value }))
    setDirty(true)
  }

  async function handleSave() {
    if (readOnly) return
    setSaving(true)
    setError(null)
    try {
      const saved = await priceListsApi.saveConfiguratorPricing(doc as unknown as Record<string, unknown>)
      setDoc(saved as unknown as PricingDoc)
      setDirty(false)
      if (isNew) navigate(`/admin/price-lists/${encodeURIComponent((saved as { name?: string }).name ?? '')}`, { replace: true })
    } catch (err: unknown) {
      setError((err as Error).message || 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete pricing matrix "${doc.name}"? This cannot be undone.`)) return
    try {
      await priceListsApi.deleteConfiguratorPricing(doc.name ?? '')
      navigate('/admin/price-lists')
    } catch (err: unknown) {
      setError((err as Error).message || 'Delete failed.')
    }
  }

  if (!can('canAdmin')) return <div className="p-8 text-center text-gray-500">You do not have permission to manage price lists.</div>
  if (loading) return <div className="p-8 text-sm text-gray-500">Loading…</div>

  const definedTiers = (doc.tiers ?? []).filter((t) => t.tier_name)

  return (
    <div>
      <PageHeader
        title={isNew ? 'New Pricing Matrix' : (doc.name ?? 'Pricing Matrix')}
        subtitle={doc.price_list ? `${doc.price_list} · ${doc.configurator_type || 'No type'}` : 'Configure tiers and pricing matrix'}
        actions={
          <div className="flex gap-2">
            {!isNew && !readOnly && <button onClick={handleDelete} disabled={saving} className={CM.btn.danger}>Delete</button>}
            <button onClick={() => navigate('/admin/price-lists')} className={CM.btn.secondary}>{dirty ? 'Discard' : 'Back'}</button>
            {!readOnly && <button onClick={handleSave} disabled={saving || !dirty} className={CM.btn.primary}>{saving ? 'Saving…' : 'Save'}</button>}
          </div>
        }
      />

      {error && <div className="mx-6 mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="mx-6 mt-6 space-y-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Price List</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={CM.label}>Price List *</label>
              <select value={doc.price_list} onChange={(e) => update('price_list', e.target.value)} disabled={readOnly || !isNew} className={CM.select}>
                <option value="">— Select —</option>
                {priceLists.map((pl) => (
                  <option key={pl.name} value={pl.name}>{pl.name} ({pl.currency}){pl.cm_configurator_type ? ` · ${pl.cm_configurator_type}` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={CM.label}>Configurator Type *</label>
              <select value={doc.configurator_type} onChange={(e) => update('configurator_type', e.target.value)} disabled={readOnly} className={CM.select}>
                <option value="">— Select —</option>
                {CONFIGURATOR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={CM.label}>Valid From</label>
              <input type="date" value={doc.valid_from ?? ''} onChange={(e) => update('valid_from', e.target.value)} disabled={readOnly} className={CM.input} />
            </div>
            <div>
              <label className={CM.label}>Valid To</label>
              <input type="date" value={doc.valid_to ?? ''} onChange={(e) => update('valid_to', e.target.value)} disabled={readOnly} className={CM.input} />
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Price Tiers</h3>
          <TierTable tiers={doc.tiers ?? []} onChange={(tiers) => { setDoc((d) => ({ ...d, tiers })); setDirty(true) }} readOnly={readOnly} />
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Pricing Matrix</h3>
          <MatrixTable rows={doc.matrix_rows ?? []} onChange={(matrix_rows) => { setDoc((d) => ({ ...d, matrix_rows })); setDirty(true) }} definedTiers={definedTiers} readOnly={readOnly} />
        </div>
      </div>
    </div>
  )
}
