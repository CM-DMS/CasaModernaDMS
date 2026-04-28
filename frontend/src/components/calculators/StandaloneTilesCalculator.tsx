import { useState, useCallback, useEffect } from 'react'

/* ─── types ─────────────────────────────────────────────────────────────────── */
interface Room { length: string; width: string }
interface TileData { sqmPerBox: string; widthCm: string; heightCm: string; tilesPerBox: string }
interface CalcResult {
  totalFloorSqm: number; contingencyAdd: number; floorWithContingency: number
  skirtingSqm: number; combinedSqm: number; floorBoxes: number; skirtingBoxes: number
  totalBoxes: number; sqmToQuote: number
}
export interface CalcState { rooms: Room[]; contingencyPct: number; skirtingEnabled: boolean; tile: TileData; contractorRate: number; res: CalcResult }

export interface TilesApplyResult { qty: number; sqm: number; meta: object }

export interface TilesCalcProps {
  isOpen?: boolean
  onClose?: () => void
  inline?: boolean
  bare?: boolean
  line?: Record<string, unknown> | null
  onApply?: ((r: TilesApplyResult) => void) | null
  storageKey?: string | null
  onStateChange?: ((s: CalcState) => void) | null
  initialData?: CalcState | null
}

/* ─── pure calculation ───────────────────────────────────────────────────────── */
const p = (v: unknown): number => parseFloat(String(v)) || 0

function calculate({ rooms, contingencyPct, tile, skirtingEnabled }: Omit<CalcState, 'contractorRate' | 'res'>): CalcResult {
  const sqm      = p(tile.sqmPerBox); const wCm = p(tile.widthCm); const hCm = p(tile.heightCm)
  const wM = wCm / 100; const hM = hCm / 100; const tileArea = wM * hM
  const totalFloorSqm        = rooms.reduce((s, r) => s + p(r.length) * p(r.width), 0)
  const contingencyAdd       = totalFloorSqm * (p(contingencyPct) / 100)
  const floorWithContingency = totalFloorSqm + contingencyAdd
  const step1       = wM  > 0 ? totalFloorSqm / wM : 0
  const step2       = hCm > 0 ? Math.floor(hCm / 8.2) : 0
  const step3       = step2 > 0 ? Math.ceil(step1) / step2 : 0
  const skirtingSqm = skirtingEnabled && tileArea > 0 ? Math.ceil(step3) * tileArea : 0
  const combinedSqm   = floorWithContingency + skirtingSqm
  const totalBoxes    = sqm > 0 ? Math.ceil(combinedSqm / sqm) : 0
  const sqmToQuote    = totalBoxes * sqm
  const floorBoxes    = sqm > 0 ? Math.ceil(floorWithContingency / sqm) : 0
  const skirtingBoxes = sqm > 0 ? Math.ceil(skirtingSqm / sqm) : 0
  return { totalFloorSqm, contingencyAdd, floorWithContingency, skirtingSqm, combinedSqm, floorBoxes, skirtingBoxes, totalBoxes, sqmToQuote }
}

/* ─── line data helpers ──────────────────────────────────────────────────────── */
function lineSpb(line: Record<string, unknown> | null): number {
  for (const k of ['cm_sqm_per_box', 'sqmPerBox', 'tileSqmPerCarton']) {
    const n = p(line?.[k]); if (n > 0) return n
  }
  return 0
}
function lineTilesPerBox(line: Record<string, unknown> | null): number {
  const n = p((line?.cm_tiles_per_box ?? line?.tilesPerBox) as unknown); return n > 0 ? n : 0
}
function lineTileDims(line: Record<string, unknown> | null): { w: number; h: number } {
  const explicit = p((line?.cm_tile_size_cm ?? line?.tileSizeCm) as unknown)
  if (explicit > 0) return { w: explicit, h: explicit }
  const name = String(line?.item_name || line?.item_code || '')
  const m = name.match(/(\d+\.?\d*)\s*[×xX*]\s*(\d+\.?\d*)\s*cm/i)
  if (m) return { w: parseFloat(m[1]), h: parseFloat(m[2]) }
  return { w: 0, h: 0 }
}

/* ─── localStorage helpers ───────────────────────────────────────────────────── */
function lsGet<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null }
}
function lsSet(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

/* ─── ui helpers ─────────────────────────────────────────────────────────────── */
const fmt = (n: unknown, d = 2) => p(n).toFixed(d)
const INPUT = 'border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cm-green w-full'
const LABEL = 'block text-[11px] font-semibold text-gray-600 mb-1'
const BLANK_TILE: TileData = { sqmPerBox: '', widthCm: '', heightCm: '', tilesPerBox: '' }
const newRoom = (): Room => ({ length: '', width: '' })

function NumField({ label, value, onChange, suffix, step = '0.01', min = 0, width = 'w-24' }: {
  label: string; value: string | number; onChange: (v: string) => void
  suffix?: string; step?: string; min?: number; width?: string
}) {
  return (
    <div>
      <label className={LABEL}>{label}</label>
      <div className="flex items-center gap-1">
        <input type="number" min={min} step={step} value={value} onChange={e => onChange(e.target.value)} className={`${INPUT} ${width}`} />
        {suffix && <span className="text-[11px] text-gray-400 whitespace-nowrap">{suffix}</span>}
      </div>
    </div>
  )
}

function RoomRow({ room, index, onChange, onRemove, canRemove }: { room: Room; index: number; onChange: (i: number, k: keyof Room, v: string) => void; onRemove: (i: number) => void; canRemove: boolean }) {
  const area = p(room.length) * p(room.width)
  return (
    <div className="flex items-center gap-2 mb-2 flex-wrap">
      <span className="w-5 h-5 rounded bg-gray-100 border border-gray-200 text-[10px] text-gray-500 flex items-center justify-center flex-shrink-0 font-medium">{index + 1}</span>
      <div className="flex items-center gap-1">
        <input type="number" min={0} step="0.01" placeholder="0.00" value={room.length} onChange={e => onChange(index, 'length', e.target.value)} className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cm-green w-20" />
        <span className="text-[11px] text-gray-400">m</span>
      </div>
      <span className="text-gray-400 text-sm">×</span>
      <div className="flex items-center gap-1">
        <input type="number" min={0} step="0.01" placeholder="0.00" value={room.width} onChange={e => onChange(index, 'width', e.target.value)} className="border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cm-green w-20" />
        <span className="text-[11px] text-gray-400">m</span>
      </div>
      <span className="text-gray-400 text-sm">=</span>
      <span className="text-sm font-medium text-gray-700 w-20">{area > 0 ? `${fmt(area)} m²` : '—'}</span>
      {canRemove && <button type="button" onClick={() => onRemove(index)} className="text-gray-300 hover:text-red-500 text-xs leading-none flex-shrink-0 transition-colors">✕</button>}
    </div>
  )
}

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded border p-3 flex flex-col gap-0.5 ${accent ? 'bg-cm-green border-cm-green text-white' : 'bg-white border-gray-200'}`}>
      <span className={`text-[10px] font-bold uppercase tracking-wider ${accent ? 'text-white/70' : 'text-gray-400'}`}>{label}</span>
      <span className={`text-2xl font-bold leading-tight ${accent ? 'text-white' : 'text-gray-800'}`}>{value}</span>
      {sub && <span className={`text-[11px] ${accent ? 'text-white/70' : 'text-gray-400'}`}>{sub}</span>}
    </div>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded border border-gray-200 p-4">
      <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-3">{title}</div>
      {children}
    </div>
  )
}

interface CardProps {
  rooms: Room[]; contingencyPct: number; skirtingEnabled: boolean; tile: TileData
  contractorRate: number; showContractor: boolean; tileReady: boolean; res: CalcResult
  rate: number; contractorTotal: number; onApply: ((r: TilesApplyResult) => void) | null | undefined
  updateRoom: (i: number, k: keyof Room, v: string) => void
  addRoom: () => void; removeRoom: (i: number) => void
  setTF: (k: keyof TileData, v: string) => void
  setContingencyPct: (v: number) => void
  setSkirtingEnabled: (v: boolean) => void
  setContractorRate: (v: string) => void
  setShowContractor: (v: boolean) => void
}

function TilesCalcCards({ rooms, contingencyPct, skirtingEnabled, tile, contractorRate, showContractor, tileReady, res, rate, contractorTotal, onApply, updateRoom, addRoom, removeRoom, setTF, setContingencyPct, setSkirtingEnabled, setContractorRate, setShowContractor }: CardProps) {
  const PILL = (active: boolean) =>
    `px-3 py-1 rounded border text-xs font-semibold transition-colors cursor-pointer ${active ? 'bg-cm-green border-cm-green text-white' : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'}`

  return (
    <div className="space-y-3">
      <SectionCard title="Tile Details">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <NumField label="Sqm / Box"   value={tile.sqmPerBox}   onChange={v => setTF('sqmPerBox', v)}   suffix="m²" />
          <NumField label="Tiles / Box" value={tile.tilesPerBox} onChange={v => setTF('tilesPerBox', v)} suffix="pcs" step="1" />
          <NumField label="Tile Width"  value={tile.widthCm}     onChange={v => setTF('widthCm', v)}     suffix="cm"  step="0.1" />
          <NumField label="Tile Height" value={tile.heightCm}    onChange={v => setTF('heightCm', v)}    suffix="cm"  step="0.1" />
        </div>
      </SectionCard>

      <SectionCard title="Floor Measurements">
        {rooms.map((room, i) => (
          <RoomRow key={i} room={room} index={i} onChange={updateRoom} onRemove={removeRoom} canRemove={rooms.length > 1} />
        ))}
        <button type="button" className="text-[11px] text-cm-green hover:underline mt-1" onClick={addRoom}>+ Add Room / Zone</button>
        {res.totalFloorSqm > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-100 text-[11px] text-gray-500">
            Total floor area: <span className="font-semibold text-gray-700">{fmt(res.totalFloorSqm)} m²</span>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Options">
        <div className="mb-3">
          <div className={LABEL}>Contingency — waste &amp; cuts</div>
          <div className="flex items-center gap-2 flex-wrap">
            {[10, 15, 20, 25].map(pct => (
              <button key={pct} type="button" className={PILL(contingencyPct === pct)} onClick={() => setContingencyPct(pct)}>{pct}%</button>
            ))}
            <div className="flex items-center gap-1">
              <input type="number" min={0} max={100} step={1} placeholder="—"
                value={[10, 15, 20, 25].includes(contingencyPct) ? '' : contingencyPct}
                onChange={e => setContingencyPct(p(e.target.value))}
                className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-cm-green w-16" />
              <span className="text-[11px] text-gray-400">%</span>
            </div>
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={skirtingEnabled} onChange={e => setSkirtingEnabled(e.target.checked)} className="rounded border-gray-300 text-cm-green focus:ring-cm-green" />
          <span className="text-sm text-gray-700">Include skirting tiles (10 cm cut strips)</span>
        </label>
      </SectionCard>

      <SectionCard title="Results">
        <div className="space-y-1 mb-4">
          <div className="flex justify-between text-sm py-1 border-b border-gray-100">
            <span className="text-gray-500">Floor area</span>
            <span className="text-gray-700 tabular-nums">{fmt(res.totalFloorSqm)} m²</span>
          </div>
          <div className="flex justify-between text-sm py-1 border-b border-gray-100">
            <span className="text-gray-500">+ {contingencyPct}% contingency</span>
            <span className="text-gray-700 tabular-nums">+ {fmt(res.contingencyAdd)} m²</span>
          </div>
          {skirtingEnabled && (
            <div className="flex justify-between text-sm py-1 border-b border-gray-100">
              <span className="text-gray-500">+ Skirting strips</span>
              <span className="text-gray-700 tabular-nums">+ {fmt(res.skirtingSqm)} m²</span>
            </div>
          )}
          <div className="flex justify-between text-sm py-1.5 font-semibold">
            <span className="text-gray-700">Combined total</span>
            <span className="text-gray-900 tabular-nums">{fmt(res.combinedSqm)} m²</span>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatCard label="Floor Boxes" value={tileReady ? (res.floorBoxes || '—') : '—'} sub={tileReady && res.floorBoxes ? `${fmt(res.floorBoxes * p(tile.sqmPerBox))} m² quoted` : 'enter sqm/box'} />
          {skirtingEnabled && <StatCard label="Skirting Boxes" value={tileReady ? (res.skirtingBoxes || '—') : '—'} sub={tileReady ? `${fmt(res.skirtingSqm)} m²` : 'enter sqm/box'} />}
          <StatCard label="m² to Quote" value={tileReady && res.sqmToQuote ? `${fmt(res.sqmToQuote)} m²` : '—'} sub={tileReady && res.totalBoxes ? `${res.totalBoxes} boxes` : 'enter sqm/box'} accent />
        </div>
        {tileReady && p(tile.tilesPerBox) > 0 && res.totalBoxes > 0 && (
          <div className="mt-3 text-[11px] text-gray-500">
            ≈ <span className="font-semibold text-gray-700">{res.totalBoxes * p(tile.tilesPerBox)}</span> tiles total
            &nbsp;·&nbsp;{p(tile.tilesPerBox)} per box × {res.totalBoxes} boxes
          </div>
        )}
      </SectionCard>

      {!onApply && (showContractor ? (
        <SectionCard title="Contractor Share">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <NumField label="Rate per m²" value={contractorRate} onChange={setContractorRate} suffix="€ / m²" step="0.50" />
            <div className="bg-gray-50 rounded border border-gray-200 p-3">
              <div className={LABEL}>Billed m²</div>
              <div className="text-xl font-bold text-gray-800">{tileReady && res.sqmToQuote > 0 ? `${fmt(res.sqmToQuote)} m²` : '—'}</div>
              <div className="text-[11px] text-gray-400">whole-box sqm</div>
            </div>
          </div>
          <div className="bg-gray-50 rounded border border-gray-200 p-4">
            <div className={LABEL}>Contractor Total</div>
            <div className="text-3xl font-bold text-gray-900 mt-1">
              {tileReady && rate > 0 && res.sqmToQuote > 0 ? `€${contractorTotal.toLocaleString('en-MT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
            </div>
            <div className="text-[11px] text-gray-400 mt-1">
              {tileReady && rate > 0 && res.sqmToQuote > 0 ? `${fmt(res.sqmToQuote)} m² × €${fmt(rate, 2)} / m²` : 'Fill in tile details and floor measurements above'}
            </div>
          </div>
          <button type="button" className="mt-3 text-[11px] text-gray-400 hover:text-gray-600" onClick={() => setShowContractor(false)}>Hide contractor section</button>
        </SectionCard>
      ) : (
        <button type="button" className="w-full border border-dashed border-gray-300 rounded p-3 text-[11px] font-semibold text-gray-400 hover:border-gray-400 hover:text-gray-500 transition-colors" onClick={() => setShowContractor(true)}>
          + Contractor Share Calculator
        </button>
      ))}
    </div>
  )
}

export function StandaloneTilesCalculator({ isOpen = false, onClose, inline = false, bare = false, line = null, onApply = null, storageKey = null, onStateChange = null, initialData = null }: TilesCalcProps) {
  const [rooms,           setRooms]           = useState<Room[]>([newRoom()])
  const [contingencyPct,  setContingencyPct]  = useState(20)
  const [skirtingEnabled, setSkirtingEnabled] = useState(true)
  const [tile,            setTile]            = useState<TileData>(BLANK_TILE)
  const [contractorRate,  setContractorRate]  = useState(15)
  const [showContractor,  setShowContractor]  = useState(true)

  useEffect(() => {
    if (!inline && !isOpen) return
    if (initialData?.rooms?.length) {
      setRooms(initialData.rooms)
      setContingencyPct(initialData.contingencyPct ?? 20)
      setSkirtingEnabled(initialData.skirtingEnabled ?? true)
      setTile({ ...BLANK_TILE, ...initialData.tile })
      if (initialData.contractorRate !== undefined) setContractorRate(initialData.contractorRate)
      return
    }
    const activeKey = storageKey || (line?.item_code ? `tc:row:${line.item_code}` : null)
    if (activeKey) {
      const saved = lsGet<CalcState>(activeKey)
      if (saved?.rooms?.length) {
        setRooms(saved.rooms)
        setContingencyPct(saved.contingencyPct ?? 20)
        setSkirtingEnabled(saved.skirtingEnabled ?? true)
        setTile({ ...BLANK_TILE, ...saved.tile })
        if (saved.contractorRate !== undefined) setContractorRate(saved.contractorRate)
        return
      }
    }
    const metaRaw = line?.cm_tiles_calc_meta
    const meta: CalcState | null = metaRaw
      ? (typeof metaRaw === 'string' ? (() => { try { return JSON.parse(metaRaw as string) } catch { return null } })() : metaRaw as CalcState)
      : null
    if (meta?.rooms?.length) {
      setRooms(meta.rooms)
      setContingencyPct(meta.contingencyPct ?? 20)
      setSkirtingEnabled(meta.skirtingEnabled ?? true)
      setTile({ ...BLANK_TILE, ...meta.tile })
      return
    }
    if (line) {
      const spb = lineSpb(line); const tpb = lineTilesPerBox(line); const dims = lineTileDims(line)
      setTile({ sqmPerBox: spb > 0 ? String(spb) : '', tilesPerBox: tpb > 0 ? String(tpb) : '', widthCm: dims.w > 0 ? String(dims.w) : '', heightCm: dims.h > 0 ? String(dims.h) : '' })
    }
  }, [isOpen, inline]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const key = storageKey || (line?.item_code ? `tc:row:${line.item_code}` : null)
    if (!key) return
    if (!inline && !isOpen) return
    lsSet(key, { rooms, contingencyPct, skirtingEnabled, tile, contractorRate })
  }, [rooms, contingencyPct, skirtingEnabled, tile, contractorRate, storageKey, line, isOpen, inline])

  useEffect(() => {
    if (!onStateChange) return
    if (!inline && !isOpen) return
    const r = calculate({ rooms, contingencyPct, tile, skirtingEnabled })
    onStateChange({ rooms, contingencyPct, skirtingEnabled, tile, contractorRate, res: r })
  }, [rooms, contingencyPct, skirtingEnabled, tile, contractorRate, isOpen, inline, onStateChange]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateRoom = useCallback((i: number, k: keyof Room, v: string) =>
    setRooms(rs => rs.map((r, idx) => idx === i ? { ...r, [k]: v } : r)), [])
  const addRoom    = () => setRooms(rs => [...rs, newRoom()])
  const removeRoom = (i: number) => setRooms(rs => rs.filter((_, idx) => idx !== i))
  const setTF      = (k: keyof TileData, v: string) => setTile(t => ({ ...t, [k]: v }))

  const tileReady       = p(tile.sqmPerBox) > 0
  const res             = calculate({ rooms, contingencyPct, tile, skirtingEnabled })
  const rate            = p(contractorRate)
  const contractorTotal = res.sqmToQuote * rate
  const canApply        = !!onApply && tileReady && res.totalBoxes > 0

  const handleApply = () => {
    if (!canApply || !onApply) return
    onApply({ qty: res.totalBoxes, sqm: res.sqmToQuote, meta: { rooms, contingencyPct, skirtingEnabled, tile, results: res, timestamp: new Date().toISOString() } })
    onClose?.()
  }

  const cardProps: CardProps = { rooms, contingencyPct, skirtingEnabled, tile, contractorRate, showContractor, tileReady, res, rate, contractorTotal, onApply, updateRoom, addRoom, removeRoom, setTF, setContingencyPct, setSkirtingEnabled, setContractorRate: (v: string) => setContractorRate(p(v)), setShowContractor }

  if (!inline && !isOpen) return null

  if (inline) {
    const body = (
      <>
        {!bare && <div className="mb-4"><h1 className="text-base font-semibold text-gray-800">Tiles Calculator</h1><p className="text-[11px] text-gray-400 mt-0.5">boxes · contingency · skirting · contractor share</p></div>}
        <TilesCalcCards {...cardProps} />
      </>
    )
    if (bare) return body
    return <div className="p-3 md:p-4"><div className="max-w-2xl">{body}</div></div>
  }

  const lineName = String(line?.cm_given_name || line?.item_name || line?.item_code || '')

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b flex items-center justify-between flex-shrink-0">
          <div>
            <div className="text-sm font-semibold text-gray-800">Tiles Calculator</div>
            {lineName && <div className="text-[11px] text-gray-400">{lineName}</div>}
          </div>
          <button type="button" className="text-gray-400 hover:text-gray-700 text-lg leading-none" onClick={onClose}>✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <TilesCalcCards {...cardProps} />
        </div>
        {onApply && (
          <div className="px-4 py-3 border-t flex items-center justify-between gap-3 flex-shrink-0">
            <div className="text-[11px] text-gray-500">
              {canApply ? <>Will set qty to <span className="font-semibold text-gray-700">{fmt(res.sqmToQuote)} m²</span> ({res.totalBoxes} boxes)</> : 'Enter tile details and floor measurements above'}
            </div>
            <button type="button" disabled={!canApply} onClick={handleApply}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-semibold bg-cm-green text-white hover:bg-cm-green-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Apply to Line
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
