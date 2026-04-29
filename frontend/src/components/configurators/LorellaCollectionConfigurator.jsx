/**
 * LorellaCollectionConfigurator — bedroom set configurator for the Lorena & Lety range.
 *
 * Key differences from NightCollectionConfigurator:
 *  - Lorella uses combined item codes: structure + front in a SINGLE SKU
 *    (e.g. 1LEODA001CM = 1-door wardrobe, Olmo Delicato, Cemento front)
 *  - No separate door / handle components — handle always matches structure
 *  - 4 structure finishes: OD / PG / NS / NG
 *  - 9 front finishes: Tier 1 (CM/BS/CH), Tier 2 (PS/BM/AM/SP/SC), Tier 3 (BL)
 *  - Wardrobe types: HINGED (8 sizes), CABINA (2 + mirror variants),
 *    TERMINALE (SX/DX + Scarpiera), PONTE (6/7 door), TV_UNIT, OPEN_SHELF
 *  - Furniture: beds (120/160 std + 160 LED), drawers with handle-type choice,
 *    desk, pensili, specchiere
 *  - Pricing via resolve_lorella_bom_price (same CM_BEDROOMS_MR calculator)
 *
 * Props: { onBuilt(config), onBack }
 */
import { useState, useMemo, useEffect, useCallback } from 'react';
import { frappe } from '../../api/frappe';
import { fmtMoneySmart } from '../../utils/pricing';

/* ─────────────── Structure finishes ────────────────────────────────────── */
const STRUCT_FINISHES = [
  { code: 'OD', label: 'Olmo Delicato',       prefix: 'LEOD' },
  { code: 'PG', label: 'Frassino Ghiaccio',   prefix: 'LEPG' },
  { code: 'NS', label: 'Noce Stelvio',         prefix: 'LENS' },
  { code: 'NG', label: 'Noce Tortora Stelvio', prefix: 'LENG' },
];

/* ─────────────── Front finishes (tiered) ───────────────────────────────── */
const FRONT_FINISHES = [
  // Tier 1
  { code: 'CM', label: 'Cemento',        tier: 1 },
  { code: 'BS', label: 'Basalt',         tier: 1 },
  { code: 'CH', label: 'Cachemire',      tier: 1 },
  // Tier 2
  { code: 'PS', label: 'Pietra Scura',   tier: 2 },
  { code: 'BM', label: 'Metallo Bronzo', tier: 2 },
  { code: 'AM', label: 'Metallo Argento',tier: 2 },
  { code: 'SP', label: 'Sofia Perla',    tier: 2 },
  { code: 'SC', label: 'Sofia Cuoio',    tier: 2 },
  // Tier 3
  { code: 'BL', label: 'Bianco Lucido',  tier: 3 },
];
const TIER1_CODES = ['CM','BS','CH'];
const TIER2_CODES = ['PS','BM','AM','SP','SC'];

/* ─────────────── SKU builders ──────────────────────────────────────────── */
function lorePrefix(structCode) {
  return STRUCT_FINISHES.find(s => s.code === structCode)?.prefix || 'LEOD';
}
/** Full code: struct + product number + front */
function loreSku(structCode, productNum, frontCode) {
  return `1${lorePrefix(structCode)}${productNum}${frontCode}`;
}
/** Struct-only code (no front — beds, scrivania, pensili, open shelf, grille, column) */
function loreSkuStruct(structCode, productNum) {
  return `1${lorePrefix(structCode)}${productNum}`;
}
/** Mobile a Giorno — struct-only with suffix matching the struct code */
function loreSkuOpen(structCode) {
  return `1${lorePrefix(structCode)}C003${structCode}`;
}
/** Terminal SX/DX suffix */
function loreSkuTerminal(structCode, frontCode, side) {
  return `1${lorePrefix(structCode)}C001${frontCode}${side}`;
}

/* ─────────────── Wardrobe catalogue ────────────────────────────────────── */
const WARDROBE_TYPES = [
  { code: 'HINGED',    label: 'Hinged Wardrobe' },
  { code: 'CABINA',    label: 'Cabina (Walk-in)' },
  { code: 'TERMINALE', label: 'Terminal End Panel / Shoe Cabinet' },
  { code: 'PONTE',     label: 'Ponte (Bridge)' },
  { code: 'TV_UNIT',   label: 'TV Wardrobe Unit' },
  { code: 'OPEN_SHELF',label: 'Mobile a Giorno (Open Shelf)' },
];

const HINGED_OPTIONS = [
  { code: 'A001', label: '1 Door  (L.45)',  weight: 1.0, hasFront: true },
  { code: 'A003', label: '2 Door  (L.88)',  weight: 1.5, hasFront: true },
  { code: 'A005', label: '3 Door  (L.130)', weight: 2.0, hasFront: true },
  { code: 'A006', label: '4 Door  (L.173)', weight: 2.5, hasFront: true },
  { code: 'A025', label: '4 Door + 2 Mirror  (L.173)', weight: 2.5, hasFront: true },
  { code: 'A007', label: '5 Door  (L.216)', weight: 3.0, hasFront: true },
  { code: 'A008', label: '6 Door  (L.258)', weight: 3.5, hasFront: true },
  { code: 'A009', label: '6 Door + 2 Mirror  (L.258)', weight: 3.5, hasFront: true },
];

const CABINA_OPTIONS = [
  { code: 'E003', label: '1-Door Cabina  (L.85 P.85)', weight: 2.0, hasFront: true  },
  { code: 'E001', label: '2-Door Cabina  (L.115 P.115)', weight: 2.5, hasFront: true  },
  { code: 'E006', label: '1-Door Cabina Mirror  (L.85)', weight: 2.0, hasFront: false },
  { code: 'E002', label: '2-Door Cabina Mirror  (L.115)', weight: 2.5, hasFront: false },
];

const TERMINALE_OPTIONS = [
  { code: 'C001', label: 'Terminal End Panel (L.39,9)', weight: 0.3, hasFront: true, sides: true },
  { code: 'C008', label: 'Shoe Cabinet Terminal (L.53)', weight: 0.5, hasFront: true, sides: false },
];

const PONTE_OPTIONS = [
  { code: 'K101', label: '6-Door Ponte  (L.327)', weight: 3.5, hasFront: true },
  { code: 'W101', label: '7-Door Ponte  (L.370)', weight: 4.0, hasFront: true },
];

/* ─────────────── Furniture catalogue ───────────────────────────────────── */
const FURN_CATS = [
  { code: 'BED',      label: 'Bed'       },
  { code: 'DRAWERS',  label: 'Drawers'   },
  { code: 'EXTRAS',   label: 'Extras'    },
  { code: 'MIRRORS',  label: 'Mirrors'   },
];

// Drawer-type pieces: each has two handle variants
const DRAWER_TYPES = [
  { code: 'BEDSIDE', label: 'Comodino (Bedside)',     stdNum: 'L020', latNum: 'M014', role: 'FURNITURE_BEDSIDE', weight: 0.4 },
  { code: 'CHEST',   label: 'Comò (Chest)',           stdNum: 'M020', latNum: 'M015', role: 'FURNITURE_CHEST',   weight: 0.8 },
  { code: 'TALLBOY', label: 'Settimino (Tallboy)',    stdNum: 'N020', latNum: 'M016', role: 'FURNITURE_TALLBOY', weight: 0.8 },
  { code: 'CASTOR',  label: 'Cassettiera c/Ruote',   stdNum: 'T010', latNum: 'T046', role: 'FURNITURE_ACC',     weight: 0.5 },
];

const HANDLE_TYPES = [
  { code: 'std', label: 'Maniglia Standard' },
  { code: 'lat', label: 'Maniglia Laterale' },
];

const BED_OPTIONS = [
  { code: 'R011', label: 'Letto 120 con Contenitore',          size: 120, storage: true,  led: false, structOnly: true,  weight: 1.2 },
  { code: 'R012', label: 'Letto 120 senza Contenitore',        size: 120, storage: false, led: false, structOnly: true,  weight: 1.2 },
  { code: 'S011', label: 'Letto 160 con Contenitore',          size: 160, storage: true,  led: false, structOnly: true,  weight: 1.5 },
  { code: 'S012', label: 'Letto 160 senza Contenitore',        size: 160, storage: false, led: false, structOnly: true,  weight: 1.5 },
  { code: 'S013', label: 'Letto 160 LED + Contenitore',        size: 160, storage: true,  led: true,  structOnly: false, weight: 1.5, fronts: [...TIER1_CODES, ...TIER2_CODES] },
  { code: 'S014', label: 'Letto 160 LED senza Contenitore',    size: 160, storage: false, led: true,  structOnly: false, weight: 1.5, fronts: [...TIER1_CODES, ...TIER2_CODES] },
];

const EXTRAS_OPTIONS = [
  { code: 'desk',    label: 'Scrivania (L.120)',        productNum: 'T001', structOnly: true,  weight: 0.6, role: 'FURNITURE_ACC' },
  { code: 'wall1',   label: 'Pensile 1 Vano (L.36)',   productNum: 'Z001', structOnly: true,  weight: 0.3, role: 'FURNITURE_ACC' },
  { code: 'wall2',   label: 'Pensile 2 Vani (L.72)',   productNum: 'Z002', structOnly: true,  weight: 0.5, role: 'FURNITURE_ACC' },
  { code: 'open',    label: 'Mobile a Giorno (L.45)',   productNum: 'C003', structOnly: 'open',weight: 0.4, role: 'FURNITURE_ACC' },
  { code: 'grille',  label: 'Griglia Sottoponte',       productNum: 'U005', structOnly: true,  weight: 0.3, role: 'ACCESSORY'     },
  { code: 'column',  label: 'Colonna x Ponte',          productNum: 'U016', structOnly: true,  weight: 0.3, role: 'ACCESSORY'     },
];

const MIRROR_OPTIONS = [
  { code: '1CNSPEGR003', label: 'Specchiera Sagomata con LED', weight: 0.2, role: 'FURNITURE_ACC' },
  { code: '1VRCI0506',   label: 'Specchiera Rettangolare 60×90', weight: 0.2, role: 'FURNITURE_ACC' },
  { code: '1BPBFP002',   label: 'Specchio Interno 32×140', weight: 0.2, role: 'FURNITURE_ACC' },
];

const FURNITURE_ROLE = {
  BED: 'FURNITURE_BED',
  DRAWERS: 'FURNITURE_CHEST',
};

/* ─────────────── Utility sub-components ────────────────────────────────── */
function StepPill({ current, total }) {
  return (
    <div className="flex items-center gap-1 text-[10px] text-gray-400 mb-3">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`h-1.5 rounded-full transition-all ${i + 1 <= current ? 'bg-cm-green w-4' : 'bg-gray-200 w-1.5'}`} />
      ))}
      <span className="ml-1">Step {current} of {total}</span>
    </div>
  );
}

function NavButtons({ onBack, onNext, nextLabel = 'Next', nextDisabled = false, loading = false }) {
  return (
    <div className="flex justify-between mt-4">
      {onBack
        ? <button type="button" className="px-3 py-1.5 text-xs border border-gray-200 rounded hover:bg-gray-50" onClick={onBack}>← Back</button>
        : <span />}
      <button
        type="button"
        disabled={nextDisabled || loading}
        className={`px-4 py-1.5 text-xs rounded text-white transition-colors ${nextDisabled || loading ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-cm-green hover:bg-green-700'}`}
        onClick={onNext}
      >
        {loading ? 'Calculating…' : nextLabel}
      </button>
    </div>
  );
}

function TierBadge({ tier }) {
  const cls = tier === 1 ? 'bg-blue-50 text-blue-600' : tier === 2 ? 'bg-purple-50 text-purple-600' : 'bg-amber-50 text-amber-700';
  return <span className={`text-[9px] rounded px-1 py-0 ml-1 ${cls}`}>T{tier}</span>;
}

function PieceCard({ piece, label, onRemove }) {
  return (
    <div className="rounded-lg border border-green-200 bg-emerald-50 p-2.5">
      <div className="flex items-start justify-between mb-0.5">
        <div>
          {label && <div className="text-[10px] font-semibold text-green-700 uppercase tracking-wide mb-0.5">{label}</div>}
          <div className="text-xs font-semibold text-gray-800">{piece.name}</div>
        </div>
        {onRemove && (
          <button type="button" onClick={onRemove} className="text-gray-300 hover:text-red-500 ml-2">✕</button>
        )}
      </div>
      <div className="text-[10px] text-gray-500 font-mono">{piece.sku}</div>
    </div>
  );
}

/* ─────────────── Furniture picker ──────────────────────────────────────── */
function LorFurniturePicker({ furniture, onAdd, onRemove }) {
  const [cat,        setCat]      = useState(null);
  const [struct,     setStruct]   = useState('OD');
  const [front,      setFront]    = useState('CM');
  const [bedOpt,     setBedOpt]   = useState('S011');
  const [drawerType, setDrawType] = useState('BEDSIDE');
  const [handleType, setHandleType] = useState('std');
  const [extrasOpt,  setExtrasOpt]  = useState('desk');
  const [mirrorOpt,  setMirrorOpt]  = useState('1CNSPEGR003');
  const [qty,        setQty]      = useState(1);

  // Reset sub-selections when category changes
  useEffect(() => {
    setStruct('OD'); setFront('CM'); setQty(1); // eslint-disable-line react-hooks/set-state-in-effect
    setBedOpt('S011'); setDrawType('BEDSIDE'); setHandleType('std');
    setExtrasOpt('desk'); setMirrorOpt('1CNSPEGR003');
  }, [cat]);

  const bedDef   = BED_OPTIONS.find(b => b.code === bedOpt);
  const extDef   = EXTRAS_OPTIONS.find(e => e.code === extrasOpt);
  const drawDef  = DRAWER_TYPES.find(d => d.code === drawerType);
  const mirDef   = MIRROR_OPTIONS.find(m => m.code === mirrorOpt);

  // Available fronts for selected bed
  const bedFronts   = bedDef?.fronts || FRONT_FINISHES.map(f => f.code);
  const validFront  = bedFronts.includes(front) ? front : bedFronts[0];

  function catCount(catCode) { return furniture.filter(f => f.catCode === catCode).length; }

  function buildAndAdd() {
    let sku, name, finish, role, weight;

    if (cat === 'BED') {
      if (bedDef.structOnly) {
        sku    = loreSkuStruct(struct, bedDef.code);
        name   = `${bedDef.label} — ${STRUCT_FINISHES.find(s => s.code === struct)?.label}`;
        finish = struct;
      } else {
        const f = validFront;
        sku    = loreSku(struct, bedDef.code, f);
        name   = `${bedDef.label} — ${STRUCT_FINISHES.find(s => s.code === struct)?.label} / ${FRONT_FINISHES.find(ff => ff.code === f)?.label}`;
        finish = `${struct}/${f}`;
      }
      role   = 'FURNITURE_BED';
      weight = bedDef.weight;
    } else if (cat === 'DRAWERS') {
      const num = handleType === 'std' ? drawDef.stdNum : drawDef.latNum;
      sku    = loreSku(struct, num, front);
      name   = `${drawDef.label} (${handleType === 'std' ? 'Maniglia Std' : 'Maniglia Lat'}) — ${STRUCT_FINISHES.find(s => s.code === struct)?.label} / ${FRONT_FINISHES.find(ff => ff.code === front)?.label}`;
      finish = `${struct}/${front}`;
      role   = drawDef.role;
      weight = drawDef.weight;
    } else if (cat === 'EXTRAS') {
      if (extDef.structOnly === 'open') {
        sku  = loreSkuOpen(struct);
        name = `${extDef.label} — ${STRUCT_FINISHES.find(s => s.code === struct)?.label}`;
      } else {
        sku  = loreSkuStruct(struct, extDef.productNum);
        name = `${extDef.label} — ${STRUCT_FINISHES.find(s => s.code === struct)?.label}`;
      }
      finish = struct; role = extDef.role; weight = extDef.weight;
    } else if (cat === 'MIRRORS') {
      sku    = mirDef.code;
      name   = mirDef.label;
      finish = ''; role = mirDef.role; weight = mirDef.weight;
    } else {
      return;
    }

    if (!sku) return;
    onAdd({ sku, name, finish, qty: parseInt(qty) || 1, weight, role, catCode: cat });
    setQty(1);
  }

  return (
    <div>
      <div className="flex gap-2 min-h-[11rem]">
        {/* Category list */}
        <div className="w-24 flex-shrink-0 space-y-1">
          {FURN_CATS.map(c => {
            const count = catCount(c.code);
            return (
              <button key={c.code} type="button"
                className={`w-full flex justify-between items-center rounded px-2 py-1.5 text-[11px] transition-colors ${cat === c.code ? 'bg-cm-green text-white font-semibold' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                onClick={() => setCat(cat === c.code ? null : c.code)}>
                <span>{c.label}</span>
                {count > 0 && <span className={`text-[9px] rounded-full px-1 py-0.5 ${cat === c.code ? 'bg-white text-cm-green' : 'bg-green-100 text-green-700'}`}>{count}</span>}
              </button>
            );
          })}
        </div>

        {/* Picker panel */}
        <div className="flex-1 min-w-0">
          {!cat ? (
            <div className="flex items-center justify-center h-full text-[11px] text-gray-300">← Select a category</div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-2.5 space-y-2">

              {/* BED */}
              {cat === 'BED' && (<>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {BED_OPTIONS.map(b => (
                    <button key={b.code} type="button"
                      className={`w-full text-left border rounded px-2 py-1.5 text-[11px] transition-colors ${bedOpt === b.code ? 'border-cm-green bg-green-50 text-cm-green font-semibold' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                      onClick={() => setBedOpt(b.code)}>
                      {b.label}
                      {b.led && <span className="ml-1.5 text-[9px] bg-yellow-100 text-yellow-700 rounded px-1">LED</span>}
                    </button>
                  ))}
                </div>
                <StructPicker value={struct} onChange={setStruct} />
                {bedDef && !bedDef.structOnly && (
                  <FrontPicker value={validFront} onChange={setFront} available={bedDef.fronts} label="Front (handle matches struct)" />
                )}
                {bedDef?.structOnly && (
                  <p className="text-[10px] text-gray-400">Structure finish only — no front selection</p>
                )}
              </>)}

              {/* DRAWERS */}
              {cat === 'DRAWERS' && (<>
                <div className="grid grid-cols-2 gap-1">
                  {DRAWER_TYPES.map(d => (
                    <button key={d.code} type="button"
                      className={`border rounded px-1.5 py-1 text-[10px] transition-colors ${drawerType === d.code ? 'border-cm-green bg-green-50 text-cm-green font-semibold' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                      onClick={() => setDrawType(d.code)}>
                      {d.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {HANDLE_TYPES.map(h => (
                    <button key={h.code} type="button"
                      className={`border rounded py-1 text-[10px] transition-colors ${handleType === h.code ? 'border-cm-green bg-green-50 text-cm-green font-semibold' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                      onClick={() => setHandleType(h.code)}>
                      {h.label}
                    </button>
                  ))}
                </div>
                <StructPicker value={struct} onChange={setStruct} />
                <FrontPicker value={front} onChange={setFront} label="Front finish" />
                <p className="text-[10px] text-gray-400">Handle colour matches structure automatically</p>
              </>)}

              {/* EXTRAS */}
              {cat === 'EXTRAS' && (<>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {EXTRAS_OPTIONS.map(e => (
                    <button key={e.code} type="button"
                      className={`w-full text-left border rounded px-2 py-1.5 text-[11px] transition-colors ${extrasOpt === e.code ? 'border-cm-green bg-green-50 text-cm-green font-semibold' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                      onClick={() => setExtrasOpt(e.code)}>
                      {e.label}
                    </button>
                  ))}
                </div>
                <StructPicker value={struct} onChange={setStruct} />
              </>)}

              {/* MIRRORS */}
              {cat === 'MIRRORS' && (<>
                <div className="space-y-1">
                  {MIRROR_OPTIONS.map(m => (
                    <button key={m.code} type="button"
                      className={`w-full text-left border rounded px-2 py-1.5 text-[11px] transition-colors ${mirrorOpt === m.code ? 'border-cm-green bg-green-50 text-cm-green font-semibold' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                      onClick={() => setMirrorOpt(m.code)}>
                      {m.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-gray-400">No finish selection — fixed SKU</p>
              </>)}

              {/* Qty + Add */}
              <div className="flex items-center gap-1.5 pt-1 border-t border-gray-200">
                <button type="button" className="w-6 h-6 border border-gray-300 rounded text-sm leading-none hover:bg-gray-100 flex-shrink-0"
                  onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
                <span className="w-6 text-center text-xs font-medium">{qty}</span>
                <button type="button" className="w-6 h-6 border border-gray-300 rounded text-sm leading-none hover:bg-gray-100 flex-shrink-0"
                  onClick={() => setQty(qty + 1)}>+</button>
                <button type="button" onClick={buildAndAdd}
                  className="flex-1 text-xs py-1 rounded bg-cm-green text-white hover:bg-green-700 transition-colors">
                  + Add
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Cart */}
      {furniture.length > 0 && (
        <div className="mt-2 border-t border-gray-100 pt-2 space-y-1 max-h-36 overflow-y-auto">
          <div className="text-[10px] font-semibold text-gray-500 mb-1">{furniture.length} item{furniture.length !== 1 ? 's' : ''} in set</div>
          {furniture.map((f, i) => (
            <div key={i} className="flex items-center justify-between text-[11px] bg-white border border-gray-100 rounded px-2 py-1.5">
              <span className="flex-1 text-gray-800 truncate">{f.qty > 1 ? `${f.qty}× ` : ''}{f.name}</span>
              <button type="button" className="text-gray-300 hover:text-red-500 flex-shrink-0 ml-1" onClick={() => onRemove(i)}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────── Swatch helpers ────────────────────────────────────────── */
const LORELLA_SWATCH_CODES = new Set(['OD','PG','NS','NG','CM','BS','CH','PS','BM','AM','SP','SC','BL']);
function finImg(code) {
  return LORELLA_SWATCH_CODES.has(code) ? `/files/lorella-swatch-${code}.webp` : null;
}
function finLabel(code) {
  return (
    [...STRUCT_FINISHES, ...FRONT_FINISHES].find(f => f.code === code)?.label || code
  );
}

/* ─────────────── Reusable finish pickers ────────────────────────────────── */
function StructPicker({ value, onChange, label = 'Structure Finish' }) {
  return (
    <div>
      <label className="block text-[9px] font-semibold text-gray-500 mb-0.5">{label}</label>
      <div className="grid grid-cols-2 gap-1">
        {STRUCT_FINISHES.map(s => (
          <button key={s.code} type="button"
            className={`border rounded px-2 py-1.5 text-[11px] text-left transition-colors flex items-center gap-1.5 ${value === s.code ? 'border-cm-green bg-green-50 text-cm-green font-semibold' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
            onClick={() => onChange(s.code)}>
            {finImg(s.code) && (
              <img src={finImg(s.code)} alt={s.label} className="w-5 h-5 rounded object-cover border border-gray-200 flex-shrink-0" />
            )}
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function FrontPicker({ value, onChange, label = 'Front Finish', available = null }) {
  const tiers = [1, 2, 3];
  const TIER_LABEL = { 1: 'Tier 1', 2: 'Tier 2', 3: 'Tier 3' };
  return (
    <div>
      <label className="block text-[9px] font-semibold text-gray-500 mb-0.5">{label}</label>
      {tiers.map(t => {
        const finishes = FRONT_FINISHES.filter(f => f.tier === t && (!available || available.includes(f.code)));
        if (!finishes.length) return null;
        return (
          <div key={t} className="mb-1">
            <div className="text-[9px] text-gray-400 mb-0.5">{TIER_LABEL[t]}</div>
            <div className="flex flex-wrap gap-1">
              {finishes.map(f => (
                <button key={f.code} type="button"
                  className={`border rounded px-1.5 py-0.5 text-[10px] transition-colors flex items-center gap-1 ${value === f.code ? 'border-cm-green bg-green-50 text-cm-green font-semibold' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                  onClick={() => onChange(f.code)}>
                  {finImg(f.code) && (
                    <img src={finImg(f.code)} alt={f.label} className="w-4 h-4 rounded object-cover border border-gray-200 flex-shrink-0" />
                  )}
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────── Description builder ───────────────────────────────────── */
function buildDescription({ pieces, furniture, furnitureOnly }) {
  if (furnitureOnly) {
    const items = (furniture || []).map(f => `${f.qty > 1 ? `${f.qty}× ` : ''}${f.name}`).join(', ');
    return { title: 'Lorella Collection – Bedroom Furniture', body: items || '' };
  }
  const wardParts = (pieces || []).map(p => p.name);
  const titleParts = ['Lorella Collection'];
  if (wardParts.length) titleParts.push(wardParts.slice(0, 2).join(' + '));
  const furnitureBody = furniture.length ? `Furniture: ${furniture.map(f => f.name).join(', ')}` : '';
  return {
    title: titleParts.join(' | ').slice(0, 139),
    body:  furnitureBody,
  };
}

/* ─────────────── Main export ────────────────────────────────────────────── */
export function LorellaCollectionConfigurator({ onBuilt, onBack }) {
  /* ── Navigation ── */
  const [step,     setStep]     = useState(1);

  /* ── Wardrobe draft ── */
  const [wType,    setWType]    = useState('HINGED');
  const [wOption,  setWOption]  = useState('');
  const [wStruct,  setWStruct]  = useState('OD');
  const [wFront,   setWFront]   = useState('CM');
  const [wSide,    setWSide]    = useState('S');  // for TERMINALE C001

  /* ── Committed wardrobe pieces ── */
  const [pieces, setPieces] = useState([]);

  /* ── Furniture & delivery ── */
  const [furniture,    setFurniture] = useState([]);
  const [gozoDelivery, setGozo]      = useState(false);
  const [furnitureOnly,setFurnOnly]  = useState(false);

  /* ── Pricing ── */
  const [pricing,     setPricing]     = useState(null);
  const [pricingErr,  setPricingErr]  = useState(null);
  const [pricingLoad, setPricingLoad] = useState(false);

  /* ── Derived: options list for selected type ── */
  const optionsList = useMemo(() => {
    switch (wType) {
      case 'HINGED':     return HINGED_OPTIONS;
      case 'CABINA':     return CABINA_OPTIONS;
      case 'TERMINALE':  return TERMINALE_OPTIONS;
      case 'PONTE':      return PONTE_OPTIONS;
      case 'TV_UNIT':    return [{ code: 'A073', label: 'TV Wardrobe Unit (L.88)', weight: 1.5, hasFront: true }];
      case 'OPEN_SHELF': return [{ code: 'C003', label: 'Mobile a Giorno (L.45)', weight: 0.4, hasFront: false }];
      default: return [];
    }
  }, [wType]);

  const wOptDef   = optionsList.find(o => o.code === wOption);
  const hasFront  = wOptDef?.hasFront || false;
  const hasSides  = wOptDef?.sides    || false;

  /* ── Validate front for selected option ── */
  // All Lorella fronts are available for all options
  const wSubTotal = useMemo(() => {
    if (wType === 'OPEN_SHELF') return 3;            // type → option → struct → summary
    if (!hasFront) return 3;
    if (hasSides) return 5;                          // type → opt → struct → front → side → summary
    return 4;                                        // type → opt → struct → front → summary
  }, [wType, hasFront, hasSides]);

  /* ── Build current piece into BOM object ── */
  function buildCurrentPiece() {
    if (!wOptDef) return null;
    let sku, name;

    if (wType === 'OPEN_SHELF') {
      sku  = loreSkuOpen(wStruct);
      name = `Mobile a Giorno — ${STRUCT_FINISHES.find(s => s.code === wStruct)?.label}`;
    } else if (!hasFront) {
      // mirror cabinas are struct-only
      sku  = loreSkuStruct(wStruct, wOption);
      name = `${wOptDef.label} — ${STRUCT_FINISHES.find(s => s.code === wStruct)?.label}`;
    } else if (hasSides) {
      sku  = loreSkuTerminal(wStruct, wFront, wSide);
      name = `${wOptDef.label} ${wSide === 'S' ? 'SX' : 'DX'} — ${STRUCT_FINISHES.find(s => s.code === wStruct)?.label} / ${FRONT_FINISHES.find(f => f.code === wFront)?.label}`;
    } else {
      sku  = loreSku(wStruct, wOption, wFront);
      name = `${wOptDef.label} — ${STRUCT_FINISHES.find(s => s.code === wStruct)?.label} / ${FRONT_FINISHES.find(f => f.code === wFront)?.label}`;
    }

    return {
      sku,
      name,
      role:   'STRUCTURE',
      qty:    1,
      weight: wOptDef.weight,
      finish: wFront || wStruct,
    };
  }

  function resetDraft() {
    setWType('HINGED'); setWOption(''); setWStruct('OD'); setWFront('CM'); setWSide('S');
  }

  /* ── BOM assembly ── */
  function buildBom() {
    return {
      configurator_type: 'Lorella Collection',
      gozo_delivery: gozoDelivery,
      wardrobes: furnitureOnly ? [] : pieces,
      furniture,
    };
  }

  /* ── Pricing API ── */
  const fetchPricing = useCallback(async (bom) => {
    setPricingLoad(true); setPricingErr(null);
    try {
      const result = await frappe.call(
        'casamoderna_dms.configurator_pricing_api.resolve_lorella_bom_price',
        { bom: JSON.stringify(bom), gozo_delivery: gozoDelivery ? 1 : 0 }
      );
      setPricing(result);
      return result;
    } catch (err) {
      setPricingErr(err?.message || 'Pricing unavailable');
      return null;
    } finally {
      setPricingLoad(false);
    }
  }, [gozoDelivery]);

  /* ── Add to document ── */
  async function handleAddToDocument() {
    const bom = buildBom();
    let pr = pricing;
    if (!pr) pr = await fetchPricing(bom);
    const { title, body } = buildDescription({ pieces, furniture, furnitureOnly });
    onBuilt?.({
      ...bom,
      description: title,
      descriptionBody: body,
      itemCode: 'CM-WARDROBE',
      uom: 'Unit',
      pricing: pr ? {
        offerInclVat:   pr.offer_price_inc_vat,
        rrpInclVat:     pr.rrp_inc_vat,
        costPrice:      pr.cost_price,
        vatRate:        pr.vat_rate,
        maxDiscountPct: pr.max_discount_pct,
        calculator:     pr.calculator,
        bomLines:       pr.bom_lines || [],
        offerExVat:     Math.round((pr.offer_price_inc_vat / (1 + pr.vat_rate / 100)) * 100) / 100,
        rrpExVat:       Math.round((pr.rrp_inc_vat / (1 + pr.vat_rate / 100)) * 100) / 100,
      } : null,
    });
  }

  const itemCount   = pieces.length + furniture.length;
  const showFooter  = [10, 11, 12, 13, 14, 3, 4].includes(step) && itemCount > 0;

  /* ════════════════════ STEP RENDERERS ════════════════════════ */
  function renderStep() {
    switch (step) {

      /* ── STEP 1: Start choice ── */
      case 1:
        return (
          <div>
            <div className="text-sm font-semibold text-gray-800 mb-2">
              {pieces.length > 0 ? `Add Another Piece (${pieces.length} so far)` : 'Configure Your Lorella Collection'}
            </div>
            {pieces.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-2 mb-3 text-[11px] text-gray-500 space-y-0.5">
                <div className="font-semibold text-gray-600 mb-0.5">Already configured:</div>
                {pieces.map((p, i) => <div key={i}>· {p.name} <span className="font-mono text-[10px]">({p.sku})</span></div>)}
              </div>
            )}
            <div className="space-y-2">
              <button type="button"
                className="w-full text-left border border-gray-200 rounded-lg px-4 py-3 text-sm hover:bg-gray-50 transition-colors"
                onClick={() => { setFurnOnly(false); setStep(10); }}>
                <div className="font-medium">Configure a Wardrobe Piece</div>
                <div className="text-[11px] text-gray-400 mt-0.5">Hinged, Cabina, Ponte, Terminal, TV Unit or Open Shelf</div>
              </button>
              {pieces.length === 0 && (
                <button type="button"
                  className={`w-full text-left border rounded-lg px-4 py-3 text-sm transition-colors ${furnitureOnly ? 'border-cm-green bg-green-50 font-semibold' : 'border-gray-200 hover:bg-gray-50'}`}
                  onClick={() => { setFurnOnly(true); setStep(3); }}>
                  <div className="font-medium">Bedroom Furniture Only</div>
                  <div className="text-[11px] font-normal text-gray-400 mt-0.5">Beds, drawers, mirrors and accessories — no wardrobe</div>
                </button>
              )}
              {pieces.length > 0 && (
                <button type="button"
                  className="w-full text-left border border-cm-green text-cm-green rounded-lg px-4 py-3 text-sm hover:bg-green-50 font-semibold transition-colors"
                  onClick={() => setStep(3)}>
                  Continue to Furniture →
                </button>
              )}
            </div>
            <div className="flex justify-between mt-4">
              <button type="button" className="px-3 py-1.5 text-xs border border-gray-200 rounded hover:bg-gray-50" onClick={onBack}>← Back</button>
            </div>
          </div>
        );

      /* ── STEP 10: Wardrobe Type ── */
      case 10:
        return (
          <div>
            <StepPill current={1} total={wSubTotal} />
            <div className="text-sm font-semibold text-gray-800 mb-3">Wardrobe Type</div>
            <div className="grid grid-cols-2 gap-2">
              {WARDROBE_TYPES.map(m => (
                <button key={m.code} type="button"
                  className={`border rounded-lg px-3 py-2.5 text-[12px] text-left transition-colors ${wType === m.code ? 'border-cm-green bg-green-50 font-semibold text-cm-green' : 'border-gray-200 hover:bg-gray-50'}`}
                  onClick={() => { setWType(m.code); setWOption(''); }}>
                  {m.label}
                </button>
              ))}
            </div>
            <NavButtons onBack={() => setStep(1)} onNext={() => setStep(11)} />
          </div>
        );

      /* ── STEP 11: Size / Option ── */
      case 11: {
        const opts = optionsList;
        return (
          <div>
            <StepPill current={2} total={wSubTotal} />
            <div className="text-sm font-semibold text-gray-800 mb-2">
              {WARDROBE_TYPES.find(t => t.code === wType)?.label} — Size / Model
            </div>
            <div className="grid grid-cols-1 gap-1.5 max-h-64 overflow-y-auto">
              {opts.map(o => (
                <button key={o.code} type="button"
                  className={`border rounded-lg px-3 py-2 text-[12px] text-left transition-colors ${wOption === o.code ? 'border-cm-green bg-green-50 font-semibold text-cm-green' : 'border-gray-200 hover:bg-gray-50'}`}
                  onClick={() => setWOption(o.code)}>
                  {o.label}
                  {o.hasFront === false && <span className="ml-2 text-[10px] text-gray-400">(structure only)</span>}
                </button>
              ))}
            </div>
            <NavButtons onBack={() => setStep(10)} onNext={() => setStep(12)} nextDisabled={!wOption} />
          </div>
        );
      }

      /* ── STEP 12: Structure Finish ── */
      case 12:
        return (
          <div>
            <StepPill current={3} total={wSubTotal} />
            <div className="text-sm font-semibold text-gray-800 mb-3">Structure Finish</div>
            <p className="text-[10px] text-gray-400 mb-2">
              Handle colour matches structure automatically in the Loretta & Lety range.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {STRUCT_FINISHES.map(s => (
                <button key={s.code} type="button"
                  className={`border rounded-lg px-3 py-2.5 text-[12px] text-left transition-colors flex items-center gap-2 ${wStruct === s.code ? 'border-cm-green bg-green-50 font-semibold text-cm-green' : 'border-gray-200 hover:bg-gray-50'}`}
                  onClick={() => setWStruct(s.code)}>
                  {finImg(s.code) && (
                    <img src={finImg(s.code)} alt={s.label} className="w-7 h-7 rounded object-cover border border-gray-200 flex-shrink-0" />
                  )}
                  {s.label}
                </button>
              ))}
            </div>
            <div className="mt-3 p-2 bg-blue-50 border border-blue-100 rounded text-[10px] text-blue-600 flex items-center gap-2">
              {finImg(wStruct) && (
                <img src={finImg(wStruct)} alt={finLabel(wStruct)} className="w-6 h-6 rounded object-cover border border-blue-200 flex-shrink-0" />
              )}
              Selected: <strong>{STRUCT_FINISHES.find(s => s.code === wStruct)?.label}</strong>
              — handle will match this finish
            </div>
            <NavButtons
              onBack={() => setStep(11)}
              onNext={() => {
                if (wType === 'OPEN_SHELF' || !hasFront) { setStep(14); }
                else { setStep(13); }
              }}
            />
          </div>
        );

      /* ── STEP 13: Front Finish ── */
      case 13: {
        const tierLabel = { 1: 'Tier 1 — Standard', 2: 'Tier 2 — Premium', 3: 'Tier 3 — High Gloss' };
        return (
          <div>
            <StepPill current={4} total={wSubTotal} />
            <div className="text-sm font-semibold text-gray-800 mb-2">Front Finish</div>
            {[1, 2, 3].map(t => (
              <div key={t} className="mb-3">
                <div className="text-[10px] font-bold text-gray-500 mb-1.5">{tierLabel[t]}</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {FRONT_FINISHES.filter(f => f.tier === t).map(f => (
                    <button key={f.code} type="button"
                      className={`border rounded px-2 py-1.5 text-[11px] text-center transition-colors flex flex-col items-center gap-0.5 ${wFront === f.code ? 'border-cm-green bg-green-50 font-semibold text-cm-green' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                      onClick={() => setWFront(f.code)}>
                      {finImg(f.code) && (
                        <img src={finImg(f.code)} alt={f.label} className="w-full h-10 object-cover rounded" />
                      )}
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <NavButtons
              onBack={() => setStep(12)}
              onNext={() => hasSides ? setStep(14) : setStep(15)}
            />
          </div>
        );
      }

      /* ── STEP 14: SX / DX (TERMINALE C001 only) ── */
      case 14: {
        if (!hasSides) {
          // Non-terminal struct-only: go straight to summary
          setStep(15);
          return null;
        }
        return (
          <div>
            <StepPill current={5} total={wSubTotal} />
            <div className="text-sm font-semibold text-gray-800 mb-3">Side</div>
            <div className="grid grid-cols-2 gap-2">
              {[{ code: 'S', label: 'SX — Left'}, { code: 'D', label: 'DX — Right'}].map(s => (
                <button key={s.code} type="button"
                  className={`border rounded-lg px-4 py-3 text-sm text-left transition-colors ${wSide === s.code ? 'border-cm-green bg-green-50 font-semibold text-cm-green' : 'border-gray-200 hover:bg-gray-50'}`}
                  onClick={() => setWSide(s.code)}>
                  {s.label}
                </button>
              ))}
            </div>
            <NavButtons onBack={() => setStep(13)} onNext={() => setStep(15)} />
          </div>
        );
      }

      /* ── STEP 15: Piece Summary ── */
      case 15: {
        const current = buildCurrentPiece();
        if (!current) { setStep(1); return null; }
        return (
          <div>
            <StepPill current={wSubTotal} total={wSubTotal} />
            <div className="text-sm font-semibold text-gray-800 mb-2">Wardrobe Summary</div>
            <PieceCard piece={current} label="Just configured" />
            <button type="button"
              className="w-full mt-2 border border-dashed border-gray-300 rounded-lg py-2.5 text-[11px] text-gray-500 hover:bg-gray-50 transition-colors"
              onClick={() => { setPieces(prev => [...prev, current]); resetDraft(); setStep(10); }}>
              + Add Another Wardrobe Piece
            </button>
            {pieces.length > 0 && (
              <div className="mt-2 space-y-1.5">
                <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">In set so far</div>
                {pieces.map((p, i) => (
                  <PieceCard key={i} piece={p} label={`Piece ${i + 1}`}
                    onRemove={() => setPieces(prev => prev.filter((_, j) => j !== i))} />
                ))}
              </div>
            )}
            <NavButtons
              onBack={() => {
                if (hasSides) setStep(14);
                else if (hasFront && wType !== 'OPEN_SHELF') setStep(13);
                else setStep(12);
              }}
              onNext={() => { setPieces(prev => [...prev, current]); setStep(3); }}
              nextLabel={`Continue to Furniture${pieces.length > 0 ? ` (${pieces.length + 1} pieces)` : ''}`}
            />
          </div>
        );
      }

      /* ── STEP 3: Bedroom Furniture ── */
      case 3:
        return (
          <div>
            <div className="text-sm font-semibold text-gray-800 mb-1">Bedroom Furniture</div>
            <p className="text-[11px] text-gray-400 mb-3">
              {furnitureOnly ? 'Select the pieces you need.' : 'Add furnishing — or skip for wardrobe only.'}
            </p>
            {!furnitureOnly && pieces.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {pieces.map((p, i) => <PieceCard key={i} piece={p} label={pieces.length > 1 ? `Wardrobe ${i + 1}` : 'Configured Wardrobe'} />)}
              </div>
            )}
            <LorFurniturePicker
              furniture={furniture}
              onAdd={item => setFurniture(prev => [...prev, item])}
              onRemove={idx => setFurniture(prev => prev.filter((_, j) => j !== idx))}
            />
            <NavButtons
              onBack={() => {
                if (furnitureOnly) { onBack?.(); }
                else if (pieces.length > 0) { setPieces(prev => prev.slice(0, -1)); setStep(15); }
                else { setStep(1); }
              }}
              onNext={() => setStep(4)}
              nextLabel="Delivery Options →"
              nextDisabled={furnitureOnly && furniture.length === 0}
            />
          </div>
        );

      /* ── STEP 4: Delivery ── */
      case 4:
        return (
          <div>
            <div className="text-sm font-semibold text-gray-800 mb-3">Delivery Options</div>
            <div className="space-y-2">
              {[
                { gozo: false, label: 'Malta Delivery', sub: 'Standard delivery', cls: !gozoDelivery ? 'border-cm-green bg-green-50' : 'border-gray-200' },
                { gozo: true,  label: 'Gozo Delivery',  sub: '+€80 surcharge applied to order', cls: gozoDelivery ? 'border-amber-500 bg-amber-50' : 'border-gray-200' },
              ].map(opt => (
                <div key={opt.label}
                  className={`border rounded-lg p-3 cursor-pointer transition-colors ${opt.cls}`}
                  onClick={() => setGozo(opt.gozo)}>
                  <div className="flex items-center gap-2">
                    <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${opt.gozo ? (gozoDelivery ? 'border-amber-500' : 'border-gray-300') : (!gozoDelivery ? 'border-cm-green' : 'border-gray-300')}`}>
                      {(opt.gozo ? gozoDelivery : !gozoDelivery) && <div className={`w-1.5 h-1.5 rounded-full ${opt.gozo ? 'bg-amber-500' : 'bg-cm-green'}`} />}
                    </div>
                    <div className="text-sm font-medium text-gray-800">{opt.label}</div>
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5 ml-5.5">{opt.sub}</div>
                </div>
              ))}
            </div>
            <NavButtons
              onBack={() => setStep(3)}
              onNext={() => { setPricing(null); fetchPricing(buildBom()); setStep(5); }}
              nextLabel="Review & Price →"
            />
          </div>
        );

      /* ── STEP 5: Summary + Pricing ── */
      case 5: {
        const bom = buildBom();
        return (
          <div>
            <div className="text-sm font-semibold text-gray-800 mb-3">Summary</div>
            <div className="text-[11px] space-y-1 bg-gray-50 rounded p-3 mb-3">
              {furnitureOnly ? (
                <div><span className="text-gray-500">Type:</span> <span className="font-medium">Bedroom Furniture Only</span></div>
              ) : pieces.length === 0 ? (
                <div className="text-gray-400">No wardrobe configured</div>
              ) : (
                pieces.map((p, i) => (
                  <div key={i}>
                    <span className="text-gray-500">Wardrobe {pieces.length > 1 ? i + 1 : ''}:</span>{' '}
                    <span className="font-medium">{p.name}</span>
                    <span className="ml-1 font-mono text-[10px] text-gray-400">({p.sku})</span>
                  </div>
                ))
              )}
              {furniture.length > 0 && (
                <div className="pt-1 border-t border-gray-200">
                  <div className="text-gray-500 mb-0.5">Furniture:</div>
                  {furniture.map((f, i) => <div key={i} className="ml-2">{f.qty > 1 ? `${f.qty}× ` : ''}{f.name}</div>)}
                </div>
              )}
              {gozoDelivery && <div className="pt-1 text-amber-600 font-medium">+ Gozo delivery surcharge</div>}
            </div>

            {pricingLoad && <div className="text-[11px] text-gray-400 text-center py-4 animate-pulse">Calculating price…</div>}
            {pricingErr && (
              <div className="text-[11px] text-red-600 bg-red-50 rounded p-2 mb-2">
                Pricing error: {pricingErr}
                <button type="button" className="ml-2 underline" onClick={() => fetchPricing(bom)}>Retry</button>
              </div>
            )}
            {pricing && !pricingLoad && (
              <div className="rounded border border-gray-200 bg-white text-[12px] overflow-hidden mb-3">
                <div className="flex justify-between px-3 py-2 border-b border-gray-100">
                  <span className="text-gray-500">RRP (inc. VAT)</span>
                  <span className="font-semibold">€{pricing.rrp_inc_vat?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between px-3 py-2 border-b border-gray-100">
                  <span className="text-gray-500">Max Discount</span>
                  <span className="font-semibold">{pricing.max_discount_pct ?? 30}%</span>
                </div>
                <div className="flex justify-between px-3 py-2 bg-green-50">
                  <span className="font-semibold text-green-800">Offer Price (inc. VAT)</span>
                  <span className="font-bold text-green-800">€{pricing.offer_price_inc_vat}</span>
                </div>
              </div>
            )}

            <NavButtons
              onBack={() => setStep(4)}
              onNext={handleAddToDocument}
              nextLabel="Add to Document"
              loading={pricingLoad}
              nextDisabled={pricingLoad}
            />
          </div>
        );
      }

      default: return null;
    }
  }

  const footer = showFooter ? (
    <div className="mt-3 pt-2 border-t border-gray-100 text-[10px] text-gray-400 text-right">
      {itemCount} item{itemCount !== 1 ? 's' : ''} in set
      {pieces.length > 0 && ` (${pieces.length} wardrobe piece${pieces.length !== 1 ? 's' : ''}${furniture.length > 0 ? `, ${furniture.length} furniture` : ''})`}
    </div>
  ) : null;

  return (
    <div>
      {renderStep()}
      {footer}
    </div>
  );
}
