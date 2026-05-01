import { useState, useEffect, useCallback } from 'react'
import { CM } from '../../components/ui/CMClassNames'
import { CMButton, CMSection } from '../../components/ui/CMComponents'
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
  value: number
  value2: number
  label: string
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
    const v  = Number(s.value)  || 0
    const v2 = Number(s.value2) || 0
    switch (s.step_type) {
      case 'DISCOUNT_PCT':        running = running * (1 - v / 100);         break
      case 'INCREASE_PCT':        running = running * (1 + v / 100);         break
      case 'ADD_FIXED':           running = running + v;                     break
      case 'ADD_FIXED_WEIGHTED':  /* skip — BOM weight unknown in preview */  break
      case 'ADD_INSTALL_FROM_LM': running = running + (v * lm) + v2;         break
      case 'MULTIPLY':            running = running * v;                     break
    }
    trace.push({ step: s.label || s.step_type, running })
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
  const needsValue2 = step.step_type === 'ADD_INSTALL_FROM_LM'
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      {/* Row header: number badge + type selector + reorder/remove */}
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-bold text-indigo-700">
          {idx + 1}
        </span>
        <select
          value={step.step_type}
          onChange={(e) => onChange({ ...step, step_type: e.target.value as StepType })}
          disabled={readOnly}
          className={`flex-1 ${CM.select} py-1 text-xs`}
        >
          {STEP_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        {!readOnly && (
          <div className="flex items-center gap-0.5 text-gray-400">
            <button type="button" onClick={() => onMove(-1)} disabled={idx === 0}
              className="rounded p-1 hover:bg-gray-100 disabled:opacity-30" title="Move up">↑</button>
            <button type="button" onClick={() => onMove(1)} disabled={idx >= total - 1}
              className="rounded p-1 hover:bg-gray-100 disabled:opacity-30" title="Move down">↓</button>
            <button type="button" onClick={onRemove}
              className="rounded p-1 hover:bg-gray-100 hover:text-red-600 ml-1" title="Remove step">✕</button>
          </div>
        )}
      </div>

      {/* Label + value inputs */}
      <div className={`grid gap-2 px-3 py-2 ${needsValue2 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <input
          type="text"
          value={step.label}
          onChange={(e) => onChange({ ...step, label: e.target.value })}
          disabled={readOnly}
          placeholder="Step label (e.g. 1st Discount)"
          className={`${CM.input} text-xs`}
        />
        <input
          type="number"
          step="0.0001"
          min="0"
          value={step.value ?? ''}
          onChange={(e) => onChange({ ...step, value: Number(e.target.value) })}
          disabled={readOnly}
          placeholder={needsValue2 ? '€ / LM rate' : 'Value'}
          className={`${CM.input} text-xs`}
        />
        {needsValue2 && (
          <input
            type="number"
            step="0.01"
            min="0"
            value={step.value2 ?? ''}
            onChange={(e) => onChange({ ...step, value2: Number(e.target.value) })}
            disabled={readOnly}
            placeholder="Fixed € part"
            className={`${CM.input} text-xs`}
          />
        )}
      </div>

      {/* Hint */}
      {meta && (
        <p className="px-3 pb-2 text-[11px] text-gray-400">{meta.desc}</p>
      )}
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

function CalcEditor({ calc, onChange, onSave, onDelete, saving, saveError, isNew, readOnly }: {
  calc: Calculator; onChange: (c: Calculator) => void
  onSave: () => void; onDelete: () => void
  saving: boolean; saveError: string | null; isNew: boolean; readOnly: boolean
}) {
  function addStep() {
    onChange({ ...calc, steps: [...calc.steps, { _rowId: Math.random().toString(36).slice(2), step_type: 'DISCOUNT_PCT', value: 10, value2: 0, label: '' }] })
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
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm flex flex-col h-full">
      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 flex-shrink-0">
        <div>
          <h2 className="font-semibold text-gray-900">
            {calc.calculator_name || (isNew ? 'New Calculator' : '—')}
            {calc.calculator_code && (
              <span className="ml-2 font-mono text-sm font-normal text-gray-400">{calc.calculator_code}</span>
            )}
            {!!calc.requires_lm && (
              <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Requires LM</span>
            )}
          </h2>
        </div>
        <div className="flex gap-2">
          {!isNew && !readOnly && (
            <CMButton variant="danger" onClick={onDelete} disabled={saving}>Delete</CMButton>
          )}
          <CMButton variant="primary" onClick={onSave} disabled={saving || readOnly}>
            {saving ? 'Saving…' : isNew ? 'Create' : 'Save'}
          </CMButton>
        </div>
      </div>

      {saveError && (
        <div className="mx-5 mt-3 rounded bg-red-50 p-3 text-sm text-red-700 flex-shrink-0">{saveError}</div>
      )}

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        <CMSection title="Calculator">
          <IdentityForm calc={calc} onChange={onChange} readOnly={readOnly} />
        </CMSection>

        <CMSection
          title={`Formula Steps — ${calc.steps.length} step${calc.steps.length !== 1 ? 's' : ''}`}
          actions={!readOnly ? (
            <button type="button" onClick={addStep} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">+ Add Step</button>
          ) : undefined}
        >
          {calc.steps.length === 0 ? (
            <p className="text-sm text-gray-400 py-2">
              No steps yet. Click <strong>+ Add Step</strong> to start building the formula.
            </p>
          ) : (
            <div className="mt-1 space-y-2">
              {calc.steps.map((step, idx) => (
                <StepRow key={step._rowId} step={step} idx={idx} total={calc.steps.length}
                  onChange={(s) => updateStep(idx, s)} onMove={(dir) => moveStep(idx, dir)} onRemove={() => removeStep(idx)} readOnly={readOnly} />
              ))}
            </div>
          )}
        </CMSection>

        {calc.steps.length > 0 && (
          <CMSection title="Formula Preview">
            <FormulaPreview steps={calc.steps} requiresLm={!!calc.requires_lm} />
          </CMSection>
        )}
      </div>
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
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isNew, setIsNew]         = useState(false)

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

  function handleSelect(c: Calculator) {
    // Ensure steps have _rowId for React key and default missing fields
    const hydratedCalc: Calculator = {
      ...c,
      pricing_mechanism: c.pricing_mechanism || 'Supplier Ladder',
      steps: (c.steps ?? []).map((s) => ({
        ...s,
        _rowId: (s as unknown as Record<string,string>)['name'] ?? Math.random().toString(36).slice(2),
        value:  Number(s.value  ?? 0),
        value2: Number(s.value2 ?? 0),
        label:  s.label ?? '',
      })),
    }
    setSelected(hydratedCalc); setDirty(false); setError(null); setSaveError(null)
  }

  async function handleSave() {
    if (!selected || !can('canAdmin')) return
    if (!selected.calculator_name || !selected.calculator_code) {
      setSaveError('Calculator name and code are required.')
      return
    }
    setSaving(true)
    setSaveError(null)
    setError(null)
    try {
      const saved = await priceCalculatorApi.saveCalculator(selected as unknown as Record<string, unknown>)
      const savedCalc = {
        ...(saved as unknown as Calculator),
        steps: ((saved as unknown as Calculator).steps ?? []).map((s) => ({
          ...s,
          _rowId: (s as unknown as Record<string,string>)['name'] ?? Math.random().toString(36).slice(2),
        })),
      }
      setSelected(savedCalc)
      setIsNew(false)
      setDirty(false)
      setCalcs((cs) => {
        const exists = cs.some((c) => c.name === savedCalc.name)
        return exists ? cs.map((c) => c.name === savedCalc.name ? savedCalc : c) : [...cs, savedCalc]
      })
      await load()
    } catch (err: unknown) {
      setSaveError((err as Error).message || 'Save failed.')
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
      setIsNew(false)
      setDirty(false)
    } catch (err: unknown) {
      setSaveError((err as Error).message || 'Delete failed.')
    }
  }

  function handleNew() {
    if (dirty && !window.confirm('Discard unsaved changes?')) return
    setSelected(BLANK_CALC())
    setIsNew(true)
    setDirty(false)
    setError(null)
    setSaveError(null)
  }

  if (!can('canAdmin')) return <div className="p-8 text-center text-gray-500">Admin access required.</div>

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-0 flex-shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Pricing Calculators</h1>
          <p className="text-sm text-gray-500 mt-0.5">Define step-by-step markup formulas for each product range</p>
        </div>
        <CMButton variant="primary" onClick={handleNew}>+ New Calculator</CMButton>
      </div>

      {error && (
        <div className="mx-6 mt-3 rounded bg-red-50 p-3 text-sm text-red-700 flex-shrink-0">{error}</div>
      )}

      {/* Split panel body */}
      <div className="flex flex-1 gap-6 overflow-hidden px-6 pt-5 pb-6 min-h-0">
        {/* Left: list */}
        <div className="w-64 flex-shrink-0 overflow-y-auto space-y-2">
          {loading && (
            <p className="px-1 text-sm text-gray-400 animate-pulse">Loading…</p>
          )}
          {!loading && calcs.length === 0 && !isNew && (
            <p className="px-1 text-sm text-gray-400">
              No calculators yet.{' '}
              <button type="button" onClick={handleNew} className={`${CM.linkAction} text-sm`}>Create one →</button>
            </p>
          )}
          {calcs.map((c) => (
            <CalculatorCard key={c.name ?? c.calculator_name} calc={c} selected={!isNew && selected?.name === c.name} onClick={() => {
              if (dirty && !window.confirm('Discard unsaved changes?')) return
              handleSelect(c)
              setIsNew(false)
              setSaveError(null)
            }} />
          ))}
        </div>

        {/* Right: editor */}
        <div className="flex-1 min-h-0">
          {selected ? (
            <CalcEditor
              calc={selected}
              onChange={(c) => { setSelected(c); setDirty(true) }}
              onSave={handleSave}
              onDelete={handleDelete}
              saving={saving}
              saveError={saveError}
              isNew={isNew}
              readOnly={!can('canAdmin')}
            />
          ) : (
            <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-gray-200">
              <p className="text-sm text-gray-400">
                ← Select a calculator to edit, or{' '}
                <button type="button" onClick={handleNew} className={`${CM.linkAction} text-sm`}>create a new one</button>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Unsaved changes bar */}
      {dirty && (
        <div className="mx-6 mb-4 flex items-center justify-between rounded border border-amber-200 bg-amber-50 px-4 py-2 flex-shrink-0">
          <span className="text-xs text-amber-800">You have unsaved changes</span>
          <CMButton variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </CMButton>
        </div>
      )}
    </div>
  )
}
