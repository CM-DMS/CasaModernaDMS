/**
 * TilesCalculatorModal — tile area→quantity calculator.
 * Props: { isOpen, onClose, line, onApply }
 *   line  — the product line being quoted (provides sqmPerBox, tileSizeCm etc.)
 *   onApply({ qty, sqm, meta }) — called with the computed quantity and serializable meta
 *
 * Client-side math is explicitly allowed here (quantity calculator, not financials).
 */
import { useState, useEffect, useMemo } from 'react'

/* ─────────────────────────── pure calculation logic ─────────────────────── */
function toN(v: unknown): number { const n = Number(v); return Number.isFinite(n) ? n : 0 }

function calcRowTotal(area: unknown, multiplier: unknown) {
  return Math.max(0, toN(area)) * Math.max(0, toN(multiplier))
}

interface GroupOpts { rows: Row[]; extraPct: number; sqmPerBox: unknown }
interface GroupResult {
  totalArea: number; extraArea: number; sqmToQuote: number
  boxesExact: number; boxesRounded: number; sqmRounded: number; validSqmPerBox: boolean
}

function calcGroup({ rows = [], extraPct = 0, sqmPerBox = 0 }: GroupOpts): GroupResult {
  const totalArea    = rows.reduce((s, r) => s + calcRowTotal(r?.area, r?.multiplier), 0)
  const extraArea    = totalArea * toN(extraPct)
  const sqmToQuote   = totalArea + extraArea
  const spb          = Math.max(0, toN(sqmPerBox))
  const valid        = spb > 0
  const boxesExact   = valid ? sqmToQuote / spb : 0
  const boxesRounded = valid ? Math.ceil(boxesExact) : 0
  const sqmRounded   = valid ? boxesRounded * spb : 0
  return { totalArea, extraArea, sqmToQuote, boxesExact, boxesRounded, sqmRounded, validSqmPerBox: valid }
}

interface SkirtingResult { skirtingSqm: number; valid: boolean }
function calcSkirting({ totalArea = 0, tileSizeCm = 0 }): SkirtingResult {
  const cm = Math.max(0, toN(tileSizeCm))
  const m  = cm / 100
  if (m <= 0) return { skirtingSqm: 0, valid: false }
  const stripsPerTile = Math.floor(cm / 8.2)
  if (stripsPerTile <= 0) return { skirtingSqm: 0, valid: false }
  const tilesNeeded = Math.ceil(Math.ceil(toN(totalArea) / m) / stripsPerTile)
  const skirtingSqm = tilesNeeded * m * m
  return { skirtingSqm: Number.isFinite(skirtingSqm) ? skirtingSqm : 0, valid: true }
}

/* ─────────────────────────── helpers ────────────────────────────────────── */
const MODE_TILES    = 'TILES'
const MODE_BATHROOM = 'BATHROOM'

interface Row { _id: string; area: string; multiplier: string }
const EMPTY_ROW = (): Row => ({ _id: Math.random().toString(36).slice(2), area: '', multiplier: '1' })

function fmt(v: unknown, d = 2) { return toN(v).toFixed(d) }

function resolveSqmPerBox(line?: Record<string, unknown> | null) {
  const candidates = [line?.cm_sqm_per_box, line?.sqmPerBox, line?.tileSqmPerCarton]
  for (const c of candidates) { const n = toN(c); if (n > 0) return n }
  return 0
}

function resolveTileSizeCm(line?: Record<string, unknown> | null) {
  const n = toN((line?.tileSizeCm ?? line?.cm_tile_size_cm) as unknown)
  return n > 0 ? n : 0
}

/* ─────────────────────────── sub-components ─────────────────────────────── */
function RowTable({ rows, onChange }: { rows: Row[]; onChange: (r: Row[]) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-12 gap-2 text-[10px] text-gray-400 uppercase tracking-wide">
        <div className="col-span-5">Area (sqm)</div>
        <div className="col-span-4">Multiplier</div>
        <div className="col-span-2 text-right">Total</div>
        <div className="col-span-1" />
      </div>
      {rows.map((row, i) => (
        <div key={row._id ?? i} className="grid grid-cols-12 gap-2 items-center">
          <input type="number" step="0.01" placeholder="0"
            className="col-span-5 border border-gray-200 rounded-lg px-2 py-1 text-[11px]"
            value={row.area}
            onChange={(e) => { const n = [...rows]; n[i] = { ...row, area: e.target.value }; onChange(n) }}
          />
          <input type="number" step="1" placeholder="1"
            className="col-span-4 border border-gray-200 rounded-lg px-2 py-1 text-[11px]"
            value={row.multiplier}
            onChange={(e) => { const n = [...rows]; n[i] = { ...row, multiplier: e.target.value }; onChange(n) }}
          />
          <div className="col-span-2 text-right text-[11px] text-gray-600">{fmt(calcRowTotal(row.area, row.multiplier))}</div>
          <button type="button" className="col-span-1 text-[10px] text-red-400 hover:text-red-600"
            onClick={() => { const n = rows.filter((_, j) => j !== i); onChange(n.length ? n : [EMPTY_ROW()]) }}>✕</button>
        </div>
      ))}
      <button type="button" className="text-[11px] text-cm-green hover:underline"
        onClick={() => onChange([...rows, EMPTY_ROW()])}>+ Add row</button>
    </div>
  )
}

interface GroupPanelProps {
  label: string; extraPct: number; rows: Row[]; onChange: (r: Row[]) => void
  sqmPerBox: unknown; onSqmPerBoxChange: (v: string) => void; results: GroupResult
}
function GroupPanel({ label, extraPct, rows, onChange, sqmPerBox, onSqmPerBoxChange, results }: GroupPanelProps) {
  return (
    <div className="border border-gray-200 rounded-xl p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-gray-800">{label}</span>
        <span className="text-[10px] text-gray-400">+{Math.round(extraPct * 100)}% extra</span>
      </div>
      <RowTable rows={rows} onChange={onChange} />
      <label className="block text-[10px] text-gray-500">
        sqm per box
        <input type="number" step="0.01" placeholder="0"
          className={`mt-1 w-32 border rounded-lg px-2 py-1 text-[11px] ${results.validSqmPerBox ? 'border-gray-200' : 'border-amber-300 bg-amber-50'}`}
          value={String(sqmPerBox ?? '')}
          onChange={(e) => onSqmPerBoxChange(e.target.value)}
        />
        {!results.validSqmPerBox && <span className="ml-2 text-amber-500">Required</span>}
      </label>
    </div>
  )
}

function ResultPanel({ title, results }: { title: string; results: GroupResult }) {
  return (
    <div className="border border-gray-100 rounded-xl bg-gray-50 p-3">
      <div className="text-[11px] font-semibold text-gray-700 mb-2">{title}</div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
        {[
          ['Total area',      fmt(results.totalArea) + ' sqm'],
          ['Extra allowance', fmt(results.extraArea) + ' sqm'],
          ['SQM to quote',    fmt(results.sqmToQuote) + ' sqm'],
          ['Boxes (exact)',   fmt(results.boxesExact, 3)],
          ['Boxes (rounded)', String(results.boxesRounded)],
          ['SQM (rounded)',   fmt(results.sqmRounded) + ' sqm'],
        ].map(([k, v]) => (
          <>
            <dt key={k + 'k'} className="text-gray-400">{k}</dt>
            <dd key={k + 'v'} className="text-right text-gray-700 font-medium">{v}</dd>
          </>
        ))}
      </dl>
    </div>
  )
}

/* ─────────────────────────── main modal ─────────────────────────────────── */
export interface TilesApplyResult { qty: number; sqm: number; meta: unknown }

interface TilesCalculatorModalProps {
  isOpen: boolean
  onClose: () => void
  line?: Record<string, unknown> | null
  onApply?: (result: TilesApplyResult) => void
}

export function TilesCalculatorModal({ isOpen, onClose, line, onApply }: TilesCalculatorModalProps) {
  const initSpb = resolveSqmPerBox(line)
  const initCm  = resolveTileSizeCm(line)
  const name    = String(line?.cm_given_name || line?.item_name || line?.item_code || '')

  const [mode,       setMode]       = useState(MODE_TILES)
  const [tiIntRows,  setTiIntRows]  = useState<Row[]>([EMPTY_ROW()])
  const [tiExtRows,  setTiExtRows]  = useState<Row[]>([EMPTY_ROW()])
  const [bfRows,     setBfRows]     = useState<Row[]>([EMPTY_ROW()])
  const [bwRows,     setBwRows]     = useState<Row[]>([EMPTY_ROW()])
  const [tiIntSpb,   setTiIntSpb]   = useState<string>('')
  const [tiExtSpb,   setTiExtSpb]   = useState<string>('')
  const [bfSpb,      setBfSpb]      = useState<string>('')
  const [bwSpb,      setBwSpb]      = useState<string>('')
  const [skirting,   setSkirting]   = useState(false)
  const [tileCm,     setTileCm]     = useState<string>('')

  useEffect(() => {
    if (!isOpen) return
    const meta = (line as any)?.tilesCalcMeta
    setMode(meta?.mode || MODE_TILES)
    setTiIntRows(meta?.groups?.internal?.rows?.length    ? meta.groups.internal.rows    : [EMPTY_ROW()])
    setTiExtRows(meta?.groups?.external?.rows?.length    ? meta.groups.external.rows    : [EMPTY_ROW()])
    setBfRows(meta?.groups?.bathroomFloor?.rows?.length  ? meta.groups.bathroomFloor.rows : [EMPTY_ROW()])
    setBwRows(meta?.groups?.bathroomWalls?.rows?.length  ? meta.groups.bathroomWalls.rows : [EMPTY_ROW()])
    setTiIntSpb(String(meta?.groups?.internal?.sqmPerBox     ?? (initSpb || '')))
    setTiExtSpb(String(meta?.groups?.external?.sqmPerBox     ?? (initSpb || '')))
    setBfSpb(String(meta?.groups?.bathroomFloor?.sqmPerBox   ?? (initSpb || '')))
    setBwSpb(String(meta?.groups?.bathroomWalls?.sqmPerBox   ?? (initSpb || '')))
    setSkirting(Boolean(meta?.skirting?.enabled))
    setTileCm(String(meta?.skirting?.tileSizeCm ?? (initCm || '')))
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  const rInternal  = useMemo(() => calcGroup({ rows: tiIntRows, extraPct: 0.20, sqmPerBox: tiIntSpb }), [tiIntRows, tiIntSpb])
  const rExternal  = useMemo(() => calcGroup({ rows: tiExtRows, extraPct: 0.15, sqmPerBox: tiExtSpb }), [tiExtRows, tiExtSpb])
  const rBathFloor = useMemo(() => calcGroup({ rows: bfRows,    extraPct: 0.20, sqmPerBox: bfSpb }),    [bfRows,    bfSpb])
  const rBathWalls = useMemo(() => calcGroup({ rows: bwRows,    extraPct: 0.20, sqmPerBox: bwSpb }),    [bwRows,    bwSpb])

  const tilesArea = rInternal.totalArea + rExternal.totalArea
  const skirtRes  = useMemo(
    () => skirting ? calcSkirting({ totalArea: tilesArea, tileSizeCm: tileCm }) : { skirtingSqm: 0, valid: true },
    [skirting, tilesArea, tileCm]
  )

  const canApply = mode === MODE_BATHROOM
    ? (rBathFloor.validSqmPerBox && rBathWalls.validSqmPerBox)
    : (rInternal.validSqmPerBox && rExternal.validSqmPerBox && (!skirting || skirtRes.valid))

  const handleApply = () => {
    const totalBoxes = mode === MODE_BATHROOM
      ? rBathFloor.boxesRounded + rBathWalls.boxesRounded
      : rInternal.boxesRounded + rExternal.boxesRounded
    const totalSqm = mode === MODE_BATHROOM
      ? rBathFloor.sqmRounded + rBathWalls.sqmRounded
      : rInternal.sqmRounded + rExternal.sqmRounded
    const meta = {
      mode,
      groups: {
        internal:      { rows: tiIntRows, extraPct: 0.20, sqmPerBox: tiIntSpb, results: rInternal },
        external:      { rows: tiExtRows, extraPct: 0.15, sqmPerBox: tiExtSpb, results: rExternal },
        bathroomFloor: { rows: bfRows,    extraPct: 0.20, sqmPerBox: bfSpb,    results: rBathFloor },
        bathroomWalls: { rows: bwRows,    extraPct: 0.20, sqmPerBox: bwSpb,    results: rBathWalls },
      },
      skirting: { enabled: skirting, tileSizeCm: skirting ? toN(tileCm) : 0, skirtingSqm: skirting ? skirtRes.skirtingSqm : 0 },
      timestamp: new Date().toISOString(),
    }
    onApply?.({ qty: totalBoxes, sqm: totalSqm, meta })
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-800">Tiles Calculator</div>
            {name && <div className="text-[11px] text-gray-400">{name}</div>}
          </div>
          <button type="button" className="text-gray-400 hover:text-gray-700 text-lg leading-none" onClick={onClose}>✕</button>
        </div>

        {/* Mode toggle */}
        <div className="px-4 py-2 border-b flex gap-2">
          {[
            { id: MODE_TILES,    label: 'Tiles (Int/Ext)' },
            { id: MODE_BATHROOM, label: 'Bathroom' },
          ].map(({ id, label }) => (
            <button key={id} type="button"
              className={`px-3 py-1 rounded-lg text-[11px] border transition-colors ${mode === id ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              onClick={() => setMode(id)}>{label}</button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {mode === MODE_TILES ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="space-y-4">
                <GroupPanel label="Internal Floor (+20%)" extraPct={0.20} rows={tiIntRows} onChange={setTiIntRows} sqmPerBox={tiIntSpb} onSqmPerBoxChange={setTiIntSpb} results={rInternal} />
                <GroupPanel label="External Floor (+15%)" extraPct={0.15} rows={tiExtRows} onChange={setTiExtRows} sqmPerBox={tiExtSpb} onSqmPerBoxChange={setTiExtSpb} results={rExternal} />
                <div className="border border-gray-200 rounded-xl p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-gray-800">Skirting</span>
                    <label className="flex items-center gap-2 text-[11px] text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={skirting} onChange={(e) => setSkirting(e.target.checked)} />
                      Include skirting
                    </label>
                  </div>
                  {skirting && (
                    <label className="block text-[10px] text-gray-500">
                      Tile size (cm)
                      <input type="number" step="0.1" placeholder="e.g. 59.6"
                        className={`mt-1 w-32 border rounded-lg px-2 py-1 text-[11px] ${skirtRes.valid ? 'border-gray-200' : 'border-amber-300 bg-amber-50'}`}
                        value={tileCm}
                        onChange={(e) => setTileCm(e.target.value)}
                      />
                      <span className="ml-2 text-gray-400">skirting height: 8.2 cm</span>
                    </label>
                  )}
                </div>
              </div>
              <div className="space-y-4">
                <ResultPanel title="Internal Floor" results={rInternal} />
                <ResultPanel title="External Floor" results={rExternal} />
                {skirting && (
                  <div className="border border-gray-100 rounded-xl bg-gray-50 p-3 text-[11px]">
                    <div className="font-semibold text-gray-700 mb-1">Skirting Result</div>
                    <div className="text-gray-600">Skirting sqm: <span className="font-medium">{fmt(skirtRes.skirtingSqm)}</span></div>
                  </div>
                )}
                <div className="border border-gray-100 rounded-xl bg-blue-50 p-3 text-[11px]">
                  <div className="font-semibold text-blue-800 mb-1">Total</div>
                  <div className="text-blue-700">Total boxes: <span className="font-bold">{rInternal.boxesRounded + rExternal.boxesRounded}</span></div>
                  <div className="text-blue-600">Total sqm: <span className="font-medium">{fmt(rInternal.sqmRounded + rExternal.sqmRounded)}</span></div>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="space-y-4">
                <GroupPanel label="Bathroom Floor (+20%)" extraPct={0.20} rows={bfRows} onChange={setBfRows} sqmPerBox={bfSpb} onSqmPerBoxChange={setBfSpb} results={rBathFloor} />
                <GroupPanel label="Bathroom Walls (+20%)" extraPct={0.20} rows={bwRows} onChange={setBwRows} sqmPerBox={bwSpb} onSqmPerBoxChange={setBwSpb} results={rBathWalls} />
              </div>
              <div className="space-y-4">
                <ResultPanel title="Bathroom Floor" results={rBathFloor} />
                <ResultPanel title="Bathroom Walls" results={rBathWalls} />
                <div className="border border-gray-100 rounded-xl bg-blue-50 p-3 text-[11px]">
                  <div className="font-semibold text-blue-800 mb-1">Total</div>
                  <div className="text-blue-700">Total boxes: <span className="font-bold">{rBathFloor.boxesRounded + rBathWalls.boxesRounded}</span></div>
                  <div className="text-blue-600">Total sqm: <span className="font-medium">{fmt(rBathFloor.sqmRounded + rBathWalls.sqmRounded)}</span></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t flex justify-end gap-2">
          <button type="button" className="px-4 py-1.5 text-[12px] rounded-lg border border-gray-200 hover:bg-gray-50" onClick={onClose}>Cancel</button>
          <button type="button" disabled={!canApply}
            className={`px-4 py-1.5 text-[12px] rounded-lg text-white transition-colors ${canApply ? 'bg-cm-green hover:bg-green-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
            onClick={handleApply}>Apply Quantity</button>
        </div>
      </div>
    </div>
  )
}
