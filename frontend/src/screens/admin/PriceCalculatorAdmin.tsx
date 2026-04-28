import { useState, useEffect, useCallback } from 'react'
import { PageHeader } from '../../components/shared/ui'
import { CM } from '../../components/ui/CMClassNames'
import { usePermissions } from '../../auth/PermissionsProvider'
import { priceCalculatorApi } from '../../api/priceCalculator'
import { fmtMoney } from '../../utils/fmt'

type StepType = 'DISCOUNT_PCT' | 'INCREASE_PCT' | 'ADD_FIXED' | 'ADD_FIXED_WEIGHTED' | 'ADD_INSTALL_FROM_LM' | 'MULTIPLY'

const STEP_TYPES: { value: StepType; label: string; needsValue: boolean; needsLm: boolean; desc: string }[] = [
  { value: 'DISCOUNT_PCT',        label: 'Discount %',            needsValue: true,  needsLm: false, desc: 'Reduce running total by %' },
  { value: 'INCREASE_PCT',        label: 'Increase %',            needsValue: true,  needsLm: false, desc: 'Increase running total by %' },
  { value: 'ADD_FIXED',           label: 'Add Fixed Amount',      needsValue: true,  needsLm: false, desc: 'Add fixed € to running total' },
  { value: 'ADD_FIXED_WEIGHTED',  label: 'Add Fixed (Weighted)',  needsValue: true,  needsLm: true,  desc: 'Add fixed × weight factor to running total' },
  { value: 'ADD_INSTALL_FROM_LM', label: 'Add Install (per LM)', needsValue: true,  needsLm: true,  desc: 'Add install cost × LM to running total' },
  { value: 'MULTIPLY',            label: 'Multiply',              needsValue: true,  needsLm: false, desc: 'Multiply running total by value' },
]

interface CalcStep {
  _rowId: string
  step_type: StepType
  step_value: number
  step_label: string
}

interface Calculator {
  name: string | null
  calculator_name: string
  calculator_code: string
  requires_lm: number
  pricing_mechanism: string
  max_discount_percent: number
  gozo_surcharge: number
  notes: string
  steps: CalcStep[]
}

const BLANK_CALC = (): Calculator => ({
  name:                 null,
  calculator_name:      '',
  calculator_code:      '',
  requires_lm:          0,
  pricing_mechanism:    'Supplier Ladder',
  max_discount_percent: 30,
  gozo_surcharge:       0,
  notes:                '',
  steps:                [],
})

function applyFormulaLocal(steps: CalcStep[], basePrice: number, lm: number): { step: string; running: number }[] {
  let running = basePrice
  const trace: { step: string; running: number }[] = [{ step: 'Base price', running }]
  for (const s of steps) {
    const v = Number(s.step_value) || 0
    switch (s.step_type) {
      case 'DISCOUNT_PCT':        running = running * (1 - v / 100); break
      case 'INCREASE_PCT':        running = running * (1 + v / 100); break
      case 'ADD_FIXED':           running = running + v;             break
      case 'ADD_FIXED_WEIGHTED':  running = running + v * lm;        break
      case 'ADD_INSTALL_FROM_LM': running = running + v * lm;        break
      case 'MULTIPLY':            running = running * v;             break
    }
    trace.push({ step: s.step_label || s.step_type, running })
  }
  return trace
}

function CalculatorCard({ calc, selected, onClick }: { calc: Calculator; selected: boolean; onClick: () => void }) {
  const mechBadge = calc.pricing_mechanism === 'Configurator BOM' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
  return (
    <button type="button" onClick={onClick} className={`w-full text-left rounded-lg border px-4 py-3 transition-all ${selected ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-sm text-gray-900">{calc.calculator_name || <span className="text-gray-400 italic">Untitled</span>}</p>
          {calc.calculator_code && <p className="text-xs text-gray-400 font-mono mt-0.5">{calc.calculator_code}</p>}
        </div>
        <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${mechBadge}`}>{calc.pricing_mechanism}</span>
      </div>
      <p className="mt-1.5 text-xs text-gray-500">{calc.steps.length} step{calc.steps.length !== 1 ? 's' : ''} · max {calc.max_discount_percent}% disc.</p>
    </button>
  )
}

function IdentityForm({ calc, onChange, readOnly }: { calc: Calculator; onChange: (c: Calculator) => void; readOnly: boolean }) {
  function set<K extends keyof Calculator>(k: K, v: Calculator[K]) { onChange({ ...calc, [k]: v }) }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={CM.label}>Calculator Name *</label>
          <input type="text" value={calc.calculator_name} onChange={(e) => set('calculator_name', e.target.value)} disabled={readOnly} className={CM.input} placeholder="e.g. Night Collection Supplier" />
        </div>
        <div>
          <label className={CM.label}>Code (short ID)</label>
          <input type="text" value={calc.calculator_code} onChange={(e) => set('calculator_code', e.target.value)} disabled={readOnly} className={`${CM.input} font-mono`} placeholder="e.g. NC-SUP" />
        </div>
      </div>
      <div>
        <label className={CM.label}>Pricing Mechanism</label>
        <div className="mt-1 flex gap-4">
          {['Supplier Ladder', 'Configurator BOM'].map((m) => (
            <label key={m} className={`flex items-center gap-2 cursor-pointer text-sm ${readOnly ? 'cursor-not-allowed opacity-60' : ''}`}>
              <input type="radio" value={m} checked={calc.pricing_mechanism === m} onChange={(e) => set('pricing_mechanism', e.target.value)} disabled={readOnly} className="accent-indigo-600" />
              {m}
            </label>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={CM.label}>Max Discount %</label>
          <input type="number" min="0" max="100" step="1" value={calc.max_discount_percent} onChange={(e) => set('max_discount_percent', Number(e.target.value))} disabled={readOnly} className={CM.input} />
        </div>
        <div>
          <label className={CM.label}>Gozo Surcharge %</label>
          <input type="number" min="0" max="100" step="0.5" value={calc.gozo_surcharge} onChange={(e) => set('gozo_surcharge', Number(e.target.value))} disabled={readOnly} className={CM.input} />
        </div>
        <div>
          <label className={CM.label}>Requires LM</label>
          <div className="mt-2">
            <label className={`flex items-center gap-2 cursor-pointer text-sm ${readOnly ? 'cursor-not-allowed opacity-60' : ''}`}>
              <input type="checkbox" checked={!!calc.requires_lm} onChange={(e) => set('requires_lm', e.target.checked ? 1 : 0)} disabled={readOnly} className="accent-indigo-600 w-4 h-4" />
              Require linear metre input
            </label>
          </div>
        </div>
      </div>
      <div>
        <label className={CM.label}>Notes</label>
        <textarea value={calc.notes || ''} onChange={(e) => set('notes', e.target.value)} disabled={readOnly} rows={2} className={CM.textarea} placeholder="Internal notes…" />
      </div>
    </div>
  )
}

function StepRow({ step, idx, total, onChange, onMove, onRemove, readOnly }: {
  step: CalcStep; idx: number; total: number
  onChange: (s: CalcStep) => void; onMove: (dir: -1 | 1) => void; onRemove: () => void; readOnly: boolean
}) {
  const meta = STEP_TYPES.find((t) => t.value === step.step_type)
  return (
    <div className="grid grid-cols-[auto_200px_1fr_90px_auto] gap-2 items-center rounded border border-gray-200 bg-white px-3 py-2">
      <div className="flex flex-col gap-0.5">
        <button type="button" disabled={readOnly || idx === 0} onClick={() => onMove(-1)}
          className="text-gray-400 hover:text-gray-700 disabled:opacity-20 leading-none text-xs">▲</button>
        <button type="button" disabled={readOnly || idx >= total - 1} onClick={() => onMove(1)}
          className="text-gray-400 hover:text-gray-700 disabled:opacity-20 leading-none text-xs">▼</button>
      </div>
      <div>
        <select value={step.step_type} onChange={(e) => onChange({ ...step, step_type: e.target.value as StepType })} disabled={readOnly} className={`${CM.select} text-xs py-1`}>
          {STEP_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        {meta && <p className="mt-0.5 text-[10px] text-gray-400">{meta.desc}</p>}
      </div>
      <div>
        <input type="text" value={step.step_label} onChange={(e) => onChange({ ...step, step_label: e.target.value })} disabled={readOnly} placeholder="Label (optional)" className={`${CM.input} text-xs py-1`} />
      </div>
      <div>
        <input type="number" step="any" value={step.step_value} onChange={(e) => onChange({ ...step, step_value: Number(e.target.value) })} disabled={readOnly} className={`${CM.input} text-xs py-1 text-right tabular-nums`} />
      </div>
      <div>
        {!readOnly && <button type="button" onClick={onRemove} className="rounded p-1.5 text-gray-300 hover:text-red-600" title="Remove step">✕</button>}
      </div>
    </div>
  )
}

function FormulaPreview({ steps, requiresLm }: { steps: CalcStep[]; requiresLm: boolean }) {
  const [basePrice, setBasePrice] = useState(1000)
  const [lm, setLm]               = useState(2)
  const trace = applyFormulaLocal(steps, basePrice, lm)
  const finalPrice = trace[trace.length - 1]?.running ?? basePrice

  return (
    <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50 p-4">
      <h4 className="text-sm font-semibold text-indigo-800 mb-3">Formula Preview</h4>
      <div className="flex items-center gap-4 mb-3">
        <div>
          <label className="text-xs text-indigo-700 font-medium">Base Price (€)</label>
          <input type="number" min="0" step="50" value={basePrice} onChange={(e) => setBasePrice(Number(e.target.value))} className="mt-0.5 block w-28 rounded border border-indigo-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" />
        </div>
        {requiresLm && (
          <div>
            <label className="text-xs text-indigo-700 font-medium">Linear Metres</label>
            <input type="number" min="0" step="0.5" value={lm} onChange={(e) => setLm(Number(e.target.value))} className="mt-0.5 block w-20 rounded border border-indigo-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" />
          </div>
        )}
      </div>
      <div className="space-y-1">
        {trace.map((t, i) => (
          <div key={i} className={`flex items-center justify-between text-xs rounded px-2 py-1 ${i === trace.length - 1 ? 'bg-indigo-200 font-semibold' : 'bg-white border border-indigo-100'}`}>
            <span className="text-indigo-700">{t.step}</span>
            <span className="tabular-nums">{fmtMoney(t.running)}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-sm font-bold text-indigo-900">
        <span>Final Price</span>
        <span>{fmtMoney(finalPrice)}</span>
      </div>
    </div>
  )
}

function CalcEditor({ calc, onChange, onSave, onDelete, onNew, saving, readOnly }: {
  calc: Calculator; onChange: (c: Calculator) => void
  onSave: () => void; onDelete: () => void; onNew: () => void
  saving: boolean; readOnly: boolean
}) {
  function addStep() {
    onChange({ ...calc, steps: [...calc.steps, { _rowId: Math.random().toString(36).slice(2), step_type: 'DISCOUNT_PCT', step_value: 10, step_label: '' }] })
  }
  function updateStep(idx: number, s: CalcStep) {
    onChange({ ...calc, steps: calc.steps.map((x, i) => i === idx ? s : x) })
  }
  function moveStep(idx: number, dir: -1 | 1) {
    const steps = [...calc.steps]
    const target = idx + dir
    if (target < 0 || target >= steps.length) return
    ;[steps[idx], steps[target]] = [steps[target], steps[idx]]
    onChange({ ...calc, steps })
  }
  function removeStep(idx: number) {
    onChange({ ...calc, steps: calc.steps.filter((_, i) => i !== idx) })
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-gray-900">{calc.name ? 'Edit Calculator' : 'New Calculator'}</h2>
        <div className="flex gap-2">
          {calc.name && !readOnly && <button type="button" onClick={onDelete} className={CM.btn.danger}>Delete</button>}
          <button type="button" onClick={onNew} className={CM.btn.secondary}>+ New</button>
          {!readOnly && <button type="button" onClick={onSave} disabled={saving} className={CM.btn.primary}>{saving ? 'Saving…' : 'Save'}</button>}
        </div>
      </div>

      <IdentityForm calc={calc} onChange={onChange} readOnly={readOnly} />

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700">Pricing Steps</h3>
          {!readOnly && <button type="button" onClick={addStep} className={CM.btn.secondary}>+ Add Step</button>}
        </div>
        {calc.steps.length === 0 && <p className="text-sm text-gray-400">No steps defined. Add steps to build a pricing formula.</p>}
        <div className="space-y-2">
          {calc.steps.map((step, idx) => (
            <StepRow key={step._rowId} step={step} idx={idx} total={calc.steps.length}
              onChange={(s) => updateStep(idx, s)} onMove={(dir) => moveStep(idx, dir)} onRemove={() => removeStep(idx)} readOnly={readOnly} />
          ))}
        </div>
      </div>

      {calc.steps.length > 0 && <FormulaPreview steps={calc.steps} requiresLm={!!calc.requires_lm} />}
    </div>
  )
}

export function PriceCalculatorAdmin() {
  const { can }        = usePermissions()
  const [calcs, setCalcs]         = useState<Calculator[]>([])
  const [selected, setSelected]   = useState<Calculator | null>(null)
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [dirty, setDirty]         = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [success, setSuccess]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await priceCalculatorApi.listCalculators()
      setCalcs(data as unknown as Calculator[])
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to load calculators.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function handleNew() { setSelected(BLANK_CALC()); setDirty(false); setError(null); setSuccess(null) }
  function handleSelect(c: Calculator) { setSelected(c); setDirty(false); setError(null); setSuccess(null) }

  function handleChange(c: Calculator) { setSelected(c); setDirty(true) }

  async function handleSave() {
    if (!selected || !can('canAdmin')) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const saved = await priceCalculatorApi.saveCalculator(selected as unknown as Record<string, unknown>)
      const savedCalc = saved as unknown as Calculator
      setSelected(savedCalc)
      setDirty(false)
      setSuccess(`"${savedCalc.calculator_name}" saved successfully.`)
      setCalcs((cs) => {
        const exists = cs.some((c) => c.name === savedCalc.name)
        return exists ? cs.map((c) => c.name === savedCalc.name ? savedCalc : c) : [savedCalc, ...cs]
      })
    } catch (err: unknown) {
      setError((err as Error).message || 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!selected?.name) return
    if (!window.confirm(`Delete calculator "${selected.calculator_name}"? Cannot be undone.`)) return
    try {
      await priceCalculatorApi.deleteCalculator(selected.name)
      setCalcs((cs) => cs.filter((c) => c.name !== selected.name))
      setSelected(null)
      setDirty(false)
      setSuccess('Calculator deleted.')
    } catch (err: unknown) {
      setError((err as Error).message || 'Delete failed.')
    }
  }

  if (!can('canAdmin')) return <div className="p-8 text-center text-gray-500">Admin access required.</div>

  return (
    <div>
      <PageHeader title="Pricing Calculators" subtitle="Define step-based pricing formulas for product configurators" />
      {error && <div className="mx-6 mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="mx-6 mt-4 rounded bg-green-50 p-3 text-sm text-green-700">{success}</div>}

      <div className="mx-6 mt-6 grid grid-cols-[280px_1fr] gap-6">
        {/* Left: list */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Calculators</h3>
            <button type="button" onClick={handleNew} className={CM.btn.secondary}>+ New</button>
          </div>
          {loading && <div className="text-sm text-gray-500 animate-pulse">Loading…</div>}
          <div className="space-y-2">
            {calcs.map((c) => (
              <CalculatorCard key={c.name ?? c.calculator_name} calc={c} selected={selected?.name === c.name} onClick={() => handleSelect(c)} />
            ))}
            {!loading && calcs.length === 0 && <p className="text-sm text-gray-400">No calculators yet.</p>}
          </div>
        </div>

        {/* Right: editor */}
        <div>
          {selected ? (
            <CalcEditor calc={selected} onChange={handleChange} onSave={handleSave} onDelete={handleDelete} onNew={handleNew} saving={saving} readOnly={!can('canAdmin')} />
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <p className="text-base font-medium">Select a calculator</p>
              <p className="text-sm mt-1">or create a new one</p>
            </div>
          )}
        </div>
      </div>

      {dirty && (
        <div className="fixed bottom-0 left-0 right-0 bg-yellow-50 border-t border-yellow-200 px-8 py-3 flex items-center justify-between z-10">
          <span className="text-sm text-yellow-700 font-medium">You have unsaved changes</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => { setDirty(false); if (selected?.name) load() }} className={CM.btn.secondary}>Discard</button>
            <button type="button" onClick={handleSave} disabled={saving} className={CM.btn.primary}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
