/**
 * NightCollectionConfigurator — redesigned full bedroom configurator.
 *
 * Outer steps (1–5):
 *   1. Choose: "Start with a wardrobe" | "Bedroom furniture only"
 *   3. Bedroom furniture (cart)
 *   4. Delivery options (Gozo toggle)
 *   5. Summary + Pricing
 *
 * Wardrobe sub-flow (steps 10–16, repeatable):
 *   10. Wardrobe Type   (HINGED | SLIDING | CABINA | PONTE | OPEN | TERMINALE)
 *   11. Size Selection  (mode-specific)
 *   12. Structure Finish
 *   13. Handle Type + Finish  (HINGED / CABINA only; auto-skipped otherwise)
 *   14. Door Configuration    (skipped for OPEN and TERMINALE)
 *   15. Internal Accessories  (skipped for TERMINALE)
 *   16. Wardrobe Summary Card → "Add another piece" or "Continue to furniture"
 *
 * Props: { onBuilt(config), onBack }
 */
import { useState, useMemo, useEffect, useCallback } from 'react';
import { frappe } from '../../api/frappe';

/* ─────────────── Finish catalogue ───────────────────────────────────────── */
const FINISH_LABEL = {
  LW: 'Olmo Bianco',
  NS: 'Noce Stelvio',
  CE: 'Grigio Cenere',
  AT: 'Calce',
  CM: 'Cemento',
  OS: 'Ossido',
  PD: 'Portland',
  PG: 'Frassino Ghiaccio',
  KZ: 'Rovere Kadiz',
  NG: 'Noce Tortora',
  BL: 'Bianco Lucido',
  SP: 'Specchio',
  FU: 'Fumè Mirror',
  BR: 'Mirror Aluminium Brill',
  TX: 'Tessuto',
};

const STRUCT_FINISHES        = ['LW','NS','CE','AT','PD','PG','KZ','NG'];       // 8 woods (standard)
const SLIDE274_STRUCT_FINISHES = ['LW','NS','CE','PD','PG','KZ','NG'];           // 7 (no AT)
const DOOR_STD_FINISHES      = ['LW','NS','CE','AT','CM','OS','PD','PG','KZ','NG']; // 10 woods
const SLIDE274_RQ_FINISHES   = ['LW','NS','CE','NG','KZ'];

function finImg(code) {
  const available = new Set(['LW','NS','CE','AT','CM','OS','PD','PG','KZ','NG','BL','SP']);
  return available.has(code) ? `/files/ares-swatch-${code}.jpg` : null;
}

function finLabel(code) { return FINISH_LABEL[code] || code; }

/* ─────────────── Wardrobe modes & options ───────────────────────────────── */
const MODES = [
  { code: 'HINGED',    label: 'Hinged Wardrobe' },
  { code: 'SLIDING',   label: 'Sliding Wardrobe' },
  { code: 'CABINA',    label: 'Cabina (Walk-in)' },
  { code: 'PONTE',     label: 'Ponte (Bridge)' },
  { code: 'OPEN',      label: 'Open Unit' },
  { code: 'TERMINALE', label: 'Terminal End Panel' },
];

const OPTIONS = {
  HINGED: [
    { code: 'W1', label: '1 Door  (L45)',  doors: 1 },
    { code: 'W2', label: '2 Door  (L88)',  doors: 2 },
    { code: 'W3', label: '3 Door  (L130)', doors: 3 },
    { code: 'W4', label: '4 Door  (L173)', doors: 4 },
    { code: 'W5', label: '5 Door  (L216)', doors: 5 },
    { code: 'W6', label: '6 Door  (L258)', doors: 6 },
  ],
  SLIDING: [
    { code: 'SLIDING_2D_173', label: '2-Door Sliding  (L172.6 / P55)' },
    { code: 'S3',             label: '3-Door Sliding  (L258 / P55)' },
    { code: 'SLIDING_2D_274', label: '2-Door Sliding  (L274 / P64)' },
  ],
  CABINA: [
    { code: 'C1', label: '1 Door Cabina  (L83)',  doors: 1 },
    { code: 'C2', label: '2 Door Cabina  (L115)', doors: 2 },
  ],
  PONTE: [
    { code: 'P6', label: '6 Door Ponte  (L327)', doors: 6 },
    { code: 'P7', label: '7 Door Ponte  (L370)', doors: 7 },
  ],
  OPEN: [
    { code: 'OPEN_CABINET', label: 'Open Cabinet  (L45)' },
    { code: 'END_OPEN_DX',  label: 'End Open Cabinet DX' },
    { code: 'END_OPEN_SX',  label: 'End Open Cabinet SX' },
  ],
  TERMINALE: [
    { code: 'END_DX', label: 'Terminal End Panel — Right (DX)' },
    { code: 'END_SX', label: 'Terminal End Panel — Left (SX)' },
  ],
};

const HANDLE_TYPES = [
  { code: 'HANDLE-SM', label: 'Small Handle' },
  { code: 'HANDLE-BG', label: 'Big Handle' },
  { code: 'HANDLE-GO', label: 'Gola Handle (Integrated Rail)' },
];

/* ─────────────── Sliding door set configuration ─────────────────────────── */
// For SLIDING_2D_173 and S3
const SLIDING_DOOR_SETS_2D = [
  { code: 'WOOD', label: 'Standard Wood',            family: 'SLIDE-SET',    blVariant: false },
  { code: 'WM',   label: '1 Wood + 1 Mirror',        family: 'SLIDE-SET-WM', blVariant: false },
  { code: 'BL',   label: 'Bianco Lucido',            family: 'SLIDE-SET',    blVariant: true  },
];
const SLIDING_DOOR_SETS_3D = [
  { code: 'WOOD', label: 'Standard Wood',            family: 'SLIDE-SET-3',   blVariant: false },
  { code: '3WM',  label: '2 Wood + 1 Mirror',        family: 'SLIDE-SET-3WM', blVariant: false },
  { code: 'BL',   label: 'Bianco Lucido',            family: 'SLIDE-SET-3',   blVariant: true  },
];
// For SLIDING_2D_274 only
const SLIDE274_DOOR_TYPES = [
  { code: 'RQ', label: 'Riquadrate',          family: 'SLIDE-SET-2RQ', finishFixed: null },
  { code: 'FU', label: 'Fumè Mirror',         family: 'SLIDE-SET-2FU', finishFixed: 'FU' },
  { code: 'MR', label: 'Mirror Aluminium Brill', family: 'SLIDE-SET-2MR', finishFixed: 'BR' },
];

/* ─────────────── Accessories catalogue ─────────────────────────────────── */
const ACCESSORIES_CATALOG = [
  { code: 'SHELF_45',        label: 'Shelf 45cm',                        modes: ['HINGED','CABINA','PONTE','SLIDING'], weight: 0.05 },
  { code: 'SHELF_90',        label: 'Shelf 90cm',                        modes: ['HINGED','PONTE','SLIDING'],          weight: 0.05 },
  { code: 'CABIN_SHELF_1D',  label: 'Cabina 1-Door Shelf',               modes: ['CABINA'],                            weight: 0.05 },
  { code: 'HANG_RAIL_50',    label: 'Hanging Rail 50cm',                 modes: ['HINGED','CABINA','SLIDING'],         weight: 0.05 },
  { code: 'HANG_RAIL_100',   label: 'Hanging Rail 100cm',                modes: ['HINGED','CABINA','SLIDING'],         weight: 0.05 },
  { code: 'DRAWER_UNIT_3',   label: '3-Drawer Unit',                     modes: ['HINGED','CABINA'],                   weight: 0.05 },
  { code: 'TROUSER_RACK',    label: 'Trouser Rack',                      modes: ['HINGED'],                            weight: 0.05 },
  { code: 'TIE_RACK',        label: 'Tie Rack',                          modes: ['HINGED','CABINA','SLIDING'],         weight: 0.05 },
  { code: 'SHOE_SHELF',      label: 'Shoe Shelf',                        modes: ['HINGED'],                            weight: 0.05 },
  { code: 'LED_LIGHT',       label: 'LED Interior Light',                modes: ['HINGED','CABINA','SLIDING'],         weight: 0.10 },
  { code: 'TIE_SLIDING',     label: 'Tie Rack (Sliding)',                modes: ['SLIDING'],                           weight: 0.05 },
  { code: 'SLIDING_CHEST_3', label: 'Sliding Internal 3-Drawer Chest',  modes: ['SLIDING'],                           weight: 0.15 },
  { code: 'SHELF_133',       label: 'Internal Shelf 133',               modes: ['SLIDING'], onlyOptions: ['SLIDING_2D_173','SLIDING_2D_274'], weight: 0.05 },
  { code: 'CORNICE_LED',     label: 'Cornice LED',                       modes: ['HINGED'], onlyOptions: ['W6'],       weight: 0.10 },
  { code: 'UNDER_PONTE',     label: 'Under-Ponte Framing Shelf',         modes: ['PONTE'],                             weight: 0.15 },
  { code: 'SERV',            label: 'Pull-Down Rail Servetto',           modes: ['HINGED','CABINA'],                   weight: 0.10 },
];

/* ─────────────── Ponte outer-door layout ───────────────────────────────── */
// Ponte wardrobes have 4 fixed small centre doors (bridge, no handles) plus
// outer large doors on each side that DO require handles.
// P6 = 1 large single LEFT + 4 small centre + 1 large single RIGHT
// P7 = 1 large single (one side) + 4 small centre + 1 large pair (other side)
// type:'ponte' marks the bridge piece — configurable finish, never gets a handle.
const PONTE_OUTER_DOOR_GROUPS = {
  P6: [
    { type: 'single', label: 'Side Door — Left'  },
    { type: 'single', label: 'Side Door — Right' },
    { type: 'ponte',  label: '4 Small Centre Doors (no handles)' },
  ],
  P7: [
    { type: 'single', label: 'Single Side Door' },
    { type: 'pair',   label: 'Side Door Pair'   },
    { type: 'ponte',  label: '4 Small Centre Doors (no handles)' },
  ],
};

/* ─────────────── Door group builder (HINGED / CABINA / PONTE) ───────────── */
function buildDoorGroups(optionCode, mode) {
  // Ponte: only the outer large doors are configurable; the 4 centre small
  // doors are always handled automatically as the bridge piece (DOOR-4).
  if (mode === 'PONTE') return PONTE_OUTER_DOOR_GROUPS[optionCode] || [];

  const allOptions = Object.values(OPTIONS).flat();
  const opt = allOptions.find(o => o.code === optionCode);
  const doorCount = opt?.doors || 0;
  if (doorCount === 0) return [];
  const pairs   = Math.floor(doorCount / 2);
  const singles = doorCount % 2;
  const groups  = [];
  for (let i = 0; i < pairs;   i++) groups.push({ type: 'pair',   label: `Door Pair ${i + 1}` });
  if (singles > 0)                   groups.push({ type: 'single', label: 'Single Door' });
  return groups;
}

/* ─────────────── Structure weight lookup ────────────────────────────────── */
const STRUCT_WEIGHTS = {
  W1: 1.80, W2: 1.80, W3: 1.80, W4: 1.80, W5: 1.80, W6: 1.80,
  C1: 2.00, C2: 2.20,
  P6: 2.50, P7: 2.80,
  END_DX: 0.15, END_SX: 0.15,
  SLIDING_2D_173: 3.50, SLIDING_2D_274: 2.50, S3: 4.50,
  OPEN_CABINET: 0.30, END_OPEN_DX: 0.40, END_OPEN_SX: 0.40,
};

function doorWeight(type) { return type === 'pair' ? 0.30 : 0.20; }

/* ─────────────── SKU resolution ─────────────────────────────────────────── */
function resolveSku(nightItems, familyCode, finishCode) {
  const item = nightItems.find(
    it => it.cm_family_code === familyCode && it.cm_finish_code === finishCode
  );
  return item?.item_code || null;
}

function resolveSkuByVariant(nightItems, familyCode, finishCode, variant) {
  const item = nightItems.find(
    it => it.cm_family_code === familyCode
       && it.cm_finish_code === finishCode
       && it.cm_variant     === variant
  );
  return item?.item_code || null;
}

function resolveSkuByProductCode(nightItems, productCode) {
  const item = nightItems.find(it => it.cm_product_code === productCode);
  return item?.item_code || null;
}

/* ─────────────── Structure family / variant maps ────────────────────────── */
const STRUCT_FAMILY = {
  W1: 'STR-45',    W2: 'STR-88',      W3: 'STR-130',   W4: 'STR-173',
  W5: 'STR-216',   W6: 'STR-258',     C1: 'CAB-83',    C2: 'CAB-115',
  P6: 'PONTE-327', P7: 'PONTE-370',
  END_DX: 'TERM-40', END_SX: 'TERM-40',
  SLIDING_2D_173: 'SLIDE-173', SLIDING_2D_274: 'SLIDE-274', S3: 'SLIDE-258',
  OPEN_CABINET: 'OPEN-45', END_OPEN_DX: 'OPEN-53', END_OPEN_SX: 'OPEN-53',
};

const STRUCT_VARIANT = {
  END_DX: 'Term-DX',
  END_SX: 'Term-SX',
};

/* ─────────────── Accessory family map ───────────────────────────────────── */
const ACC_FAMILY = {
  SHELF_45:        { family: 'ACC-SHL',      finishKey: false, finishFixed: 'TX', variant: 'Acc. Shelf 45' },
  SHELF_90:        { family: 'ACC-SHL',      finishKey: false, finishFixed: 'TX', variant: 'Acc. Shelf 90' },
  CABIN_SHELF_1D:  { family: 'ACC-CAB-SHL',  finishKey: false, finishFixed: 'TX', variant: 'Acc. Cab 1-D Shelf' },
  DRAWER_UNIT_3:   { family: 'ACC-CASS',     finishKey: false, finishFixed: 'TX', variant: null },
  TROUSER_RACK:    { family: 'ACC-PANT-BT',  finishKey: false, finishFixed: 'TX', variant: null },
  TIE_RACK:        { family: 'ACC-CRAV-BT',  finishKey: false, finishFixed: 'TX', variant: null },
  TIE_SLIDING:     { family: 'ACC-CRAV-SC',  finishKey: false, finishFixed: 'TX', variant: null },
  SLIDING_CHEST_3: { family: 'ACC-VANO3',    finishKey: false, finishFixed: 'TX', variant: null },
  SHELF_133:       { family: 'ACC-SHL133',   finishKey: false, finishFixed: 'TX', variant: null },
  CORNICE_LED:     { family: 'ACC-LED-CAP',  finishKey: true,  variant: null },
  // finishFallback: grille only exists in 5 finishes; NG/KZ/PD structures fall back in order
  UNDER_PONTE:     { family: 'ACC-GRILLE',   finishKey: true,  variant: null, finishFallback: ['NS', 'LW', 'CE', 'AT', 'PG'] },
  SERV:            { family: 'ACC-SERV',     finishKey: false, finishFixed: 'MO', variant: null },
  // HANG_RAIL_50, HANG_RAIL_100, SHOE_SHELF, LED_LIGHT: no DB item — priced at €0
};

/* ─────────────── Sliding door family resolver ───────────────────────────── */
function resolveSlidingDoorFamily(option, slidingSet) {
  if (option === 'SLIDING_2D_274') {
    const dtDef = SLIDE274_DOOR_TYPES.find(d => d.code === slidingSet.setType);
    const fin   = dtDef?.finishFixed ?? slidingSet.finish;
    return { doorFamily: dtDef?.family || 'SLIDE-SET-2RQ', doorFinish: fin };
  }
  const is3D = option === 'S3';
  if (slidingSet.setType === 'BL') {
    return { doorFamily: is3D ? 'SLIDE-SET-3' : 'SLIDE-SET', doorFinish: 'BL' };
  }
  if (slidingSet.setType === 'WM') {
    return { doorFamily: 'SLIDE-SET-WM',  doorFinish: slidingSet.finish };
  }
  if (slidingSet.setType === '3WM') {
    return { doorFamily: 'SLIDE-SET-3WM', doorFinish: slidingSet.finish };
  }
  // WOOD
  return { doorFamily: is3D ? 'SLIDE-SET-3' : 'SLIDE-SET', doorFinish: slidingSet.finish };
}

/* ─────────────── Bedroom furniture catalogue ─────────────────────────────── */
const BED_SIZES              = [120, 140, 160];
const BED_FINISHES_COMMON    = ['LW','NS','CE','AT','PG'];
const BED_FINISHES_160       = ['LW','NS','CE','AT','PG','KZ','NG'];
const COMPO_BODY_FINISHES    = ['LW','NS','CE','AT','PG'];
const COMPO_FRONT_MAP = {
  LW: ['LW','CE','AT','BL'],
  NS: ['NS','CE','AT','BL'],
  CE: ['CE','AT','BL'],
  AT: ['AT','CE','BL'],
  PG: ['PG','CE','AT','BL'],
};
const NETTUNO_FINISHES        = ['LW','NS','CE','KZ','NG'];
const ACCESSORY_FINISH_LIST   = ['LW','NS','CE','AT','PG','KZ','NG'];

const FURNITURE_TYPES = [
  { code: 'BED',      label: 'Bed',                    role: 'FURNITURE_BED'     },
  { code: 'BEDSIDE',  label: 'Bedside Table',          role: 'FURNITURE_BEDSIDE' },
  { code: 'TALLBOY',  label: 'Tallboy',                role: 'FURNITURE_TALLBOY' },
  { code: 'CHEST',    label: 'Chest',                  role: 'FURNITURE_CHEST'   },
  { code: 'DRESSER',  label: 'Dresser',                role: 'FURNITURE_DRESSER' },
  { code: 'DESK',     label: 'Desk 120',               role: 'FURNITURE_ACC', family: 'ACC-DESK',     noFinish: false },
  { code: 'WUNIT_60', label: 'Wall Cabinet 60×60',     role: 'FURNITURE_ACC', family: 'ACC-WALL-60',  noFinish: false },
  { code: 'OWALL_2',  label: 'Open Wall Unit 2-box',   role: 'FURNITURE_ACC', family: 'ACC-OWALL-2',  noFinish: false },
  { code: 'OWALL_1',  label: 'Open Wall Unit 1-box',   role: 'FURNITURE_ACC', family: 'ACC-OWALL-1',  noFinish: false },
  { code: 'CASTOR',   label: 'Castor Drawers',         role: 'FURNITURE_ACC', family: 'ACC-CASTOR',   noFinish: false },
  { code: 'MIR_RECT', label: 'Rectangular Mirror 60×90', role: 'FURNITURE_ACC', family: 'ACC-MIR-RECT', noFinish: true },
  { code: 'MIR_OVAL', label: 'Oval Mirror 120×70',     role: 'FURNITURE_ACC', family: 'ACC-MIR-OVAL',  noFinish: true },
  { code: 'LED_MIR',  label: 'LED Profile for Mirror', role: 'FURNITURE_ACC', family: 'ACC-LED-MIR',   noFinish: true, fixedFinish: 'CE' },
];

const FURNITURE_WEIGHT = {
  BED: 1.50, BEDSIDE: 0.50, TALLBOY: 0.80, CHEST: 1.00, DRESSER: 1.00,
  DESK: 0.80, WUNIT_60: 0.40, OWALL_2: 0.40, OWALL_1: 0.40, CASTOR: 0.50,
  MIR_RECT: 0.30, MIR_OVAL: 0.30, LED_MIR: 0.10,
};

const BRANDS = [
  { code: 'COMPO',   label: 'Compo (Notte)' },
  { code: 'ORIONE',  label: 'Orione' },
  { code: 'NETTUNO', label: 'Nettuno' },
];

function bedFinishes(size) {
  return parseInt(size) === 160 ? BED_FINISHES_160 : BED_FINISHES_COMMON;
}

const FURN_CATS = [
  { code: 'BED',     label: 'Bed'      },
  { code: 'BEDSIDE', label: 'Bedside'  },
  { code: 'TALLBOY', label: 'Tallboy'  },
  { code: 'CHEST',   label: 'Chest'    },
  { code: 'DRESSER', label: 'Dresser'  },
  { code: 'ACC',     label: 'Extras'   },
];

/* ─────────────── Utility sub-components ────────────────────────────────── */
function StepPill({ current, total }) {
  return (
    <div className="flex items-center gap-1 text-[10px] text-gray-400 mb-3">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 rounded-full transition-all ${
            i + 1 <= current ? 'bg-cm-green w-4' : 'bg-gray-200 w-1.5'
          }`}
        />
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
        className={`px-4 py-1.5 text-xs rounded text-white transition-colors ${
          nextDisabled || loading ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-cm-green hover:bg-green-700'
        }`}
        onClick={onNext}
      >
        {loading ? 'Calculating…' : nextLabel}
      </button>
    </div>
  );
}

function WardrobeCard({ wardrobe, label, onRemove }) {
  const modeLabel  = MODES.find(m => m.code === wardrobe.mode)?.label || wardrobe.mode;
  const uniqueDoors = [...new Set((wardrobe.doors || [])
    .filter(d => d.type !== 'ponte' && d.type !== 'profile' && d.type !== 'sliding')
    .map(d => finLabel(d.finish)))].join(' / ');
  const ponteDoor = (wardrobe.doors || []).find(d => d.type === 'ponte');
  const slidingDoor = (wardrobe.doors || []).find(d => d.type === 'sliding');
  const handleEntry = (wardrobe.handles || [])[0];
  const handleType  = HANDLE_TYPES.find(h => h.code === handleEntry?.type);
  const accItems    = wardrobe.accessories || [];
  return (
    <div className="rounded-lg border border-green-200 bg-emerald-50 p-3">
      <div className="flex items-start justify-between mb-1">
        <div>
          {label && <div className="text-[10px] font-semibold text-green-700 uppercase tracking-wide mb-0.5">{label}</div>}
          <div className="text-xs font-semibold text-gray-800">{modeLabel} — {wardrobe.optionLabel}</div>
        </div>
        {onRemove && (
          <button type="button" onClick={onRemove} className="text-gray-300 hover:text-red-500 ml-2 leading-none">✕</button>
        )}
      </div>
      <div className="text-[11px] text-gray-500 space-y-0.5">
        <div>Structure: <span className="text-gray-700">{finLabel(wardrobe.structure?.finish)}</span></div>
        {['HINGED','CABINA','PONTE'].includes(wardrobe.mode) && handleType && (
          <div>Handle: <span className="text-gray-700">
            {handleType.label}{handleEntry.type !== 'HANDLE-GO' ? ` — ${finLabel(handleEntry.finish)}` : ''}
          </span></div>
        )}
        {uniqueDoors && <div>Doors: <span className="text-gray-700">{uniqueDoors}</span></div>}
        {ponteDoor && <div>Centre Doors: <span className="text-gray-700">{finLabel(ponteDoor.finish)} (no handles)</span></div>}
        {slidingDoor && <div>Sliding Doors: <span className="text-gray-700">{finLabel(slidingDoor.finish)}</span></div>}
        {accItems.length > 0 && (
          <div>+ {accItems.map(a => `${a.qty > 1 ? `${a.qty}× ` : ''}${a.name}`).join(', ')}</div>
        )}
      </div>
    </div>
  );
}

/* ─────────────── Furniture picker sub-component ─────────────────────────── */
function FurniturePicker({ nightItems, furniture, onAdd, onRemove }) {
  const [cat,        setCat]      = useState(null);
  const [brand,      setBrand]    = useState('COMPO');
  const [size,       setSize]     = useState('160');
  const [storage,    setStorage]  = useState(false);
  const [bodyFinish, setBodyFin]  = useState('LW');
  const [frontFinish,setFrontFin] = useState('LW');
  const [finish,     setFinish]   = useState('LW');
  const [accType,    setAccType]  = useState('DESK');
  const [qty,        setQty]      = useState(1);

  const accTypes = FURNITURE_TYPES.filter(t => t.role === 'FURNITURE_ACC');
  const accDef   = accTypes.find(a => a.code === accType);

  useEffect(() => {
    setSize('160'); setStorage(false); setBrand('COMPO'); // eslint-disable-line react-hooks/set-state-in-effect
    setBodyFin('LW'); setFrontFin('LW'); setFinish('LW'); setQty(1); setAccType('DESK');
  }, [cat]);

  useEffect(() => {
    const opts = COMPO_FRONT_MAP[bodyFinish] || [];
    if (!opts.includes(frontFinish)) setFrontFin(opts[0] || 'LW'); // eslint-disable-line react-hooks/set-state-in-effect
  }, [bodyFinish]); // eslint-disable-line react-hooks/exhaustive-deps

  function catCount(catCode) {
    return furniture.filter(f => f.catCode === catCode).length;
  }

  function buildAndAdd() {
    const effectiveCat = cat;
    const typeDef = FURNITURE_TYPES.find(t => t.code === (effectiveCat === 'ACC' ? accType : effectiveCat));
    let sku, name, usedFinish;

    if (effectiveCat === 'BED') {
      const stor = storage ? 'C' : '';
      sku = resolveSkuByProductCode(nightItems, `BED-BED${size}${stor}-${finish}`)
         || resolveSku(nightItems, `BED-${size}${stor}`, finish);
      name       = `Bed ${size}cm${storage ? ' w/ Storage' : ''} — ${finLabel(finish)}`;
      usedFinish = finish;
    } else if (['BEDSIDE','TALLBOY','CHEST'].includes(effectiveCat)) {
      if (brand === 'COMPO') {
        sku = resolveSkuByProductCode(nightItems, `NOT-${effectiveCat}-${bodyFinish}-${frontFinish}`)
           || resolveSku(nightItems, `${effectiveCat}-COMPO-${bodyFinish}`, frontFinish);
        name       = `Compo ${typeDef?.label} — ${finLabel(bodyFinish)} / ${finLabel(frontFinish)}`;
        usedFinish = `${bodyFinish}/${frontFinish}`;
      } else if (brand === 'ORIONE') {
        sku = resolveSkuByProductCode(nightItems, `ORE-${effectiveCat}-KZ`)
           || resolveSku(nightItems, `${effectiveCat}-ORIONE`, 'KZ');
        name       = `Orione ${typeDef?.label} — ${finLabel('KZ')}`;
        usedFinish = 'KZ';
      } else {
        sku = resolveSkuByProductCode(nightItems, `NET-${effectiveCat}-${finish}`)
           || resolveSku(nightItems, `${effectiveCat}-NETTUNO`, finish);
        name       = `Nettuno ${typeDef?.label} — ${finLabel(finish)}`;
        usedFinish = finish;
      }
    } else if (effectiveCat === 'DRESSER') {
      sku        = resolveSkuByProductCode(nightItems, 'ORE-DRESSER-KZ') || resolveSku(nightItems, 'DRESSER-ORIONE', 'KZ');
      name       = `Orione Dresser — ${finLabel('KZ')}`;
      usedFinish = 'KZ';
    } else if (effectiveCat === 'ACC') {
      if (accDef?.noFinish && !accDef?.fixedFinish) {
        sku        = resolveSkuByProductCode(nightItems, accDef.family) || resolveSku(nightItems, accDef.family, '');
        name       = accDef.label;
        usedFinish = '';
      } else if (accDef?.fixedFinish) {
        sku        = resolveSku(nightItems, accDef.family, accDef.fixedFinish);
        name       = `${accDef.label} — ${finLabel(accDef.fixedFinish)}`;
        usedFinish = accDef.fixedFinish;
      } else {
        sku        = resolveSkuByProductCode(nightItems, `${accDef?.family}-${finish}`)
                  || resolveSku(nightItems, accDef?.family, finish);
        name       = `${accDef?.label} — ${finLabel(finish)}`;
        usedFinish = finish;
      }
    }

    if (!name) return;
    onAdd({
      sku:     sku || `MISSING-${effectiveCat}`,
      name,
      finish:  usedFinish,
      qty:     parseInt(qty) || 1,
      weight:  FURNITURE_WEIGHT[effectiveCat === 'ACC' ? accType : effectiveCat] || 0.40,
      role:    typeDef?.role || 'FURNITURE',
      catCode: effectiveCat,
    });
    setQty(1);
  }

  const showFinishAcc = accDef && !accDef.noFinish && !accDef.fixedFinish;

  return (
    <div>
      {/* Two-column layout: category list + picker panel */}
      <div className="flex gap-2 min-h-[11rem]">
        {/* Left: category list */}
        <div className="w-24 flex-shrink-0 space-y-1">
          {FURN_CATS.map(c => {
            const count = catCount(c.code);
            return (
              <button key={c.code} type="button"
                className={`w-full flex justify-between items-center rounded px-2 py-1.5 text-[11px] transition-colors ${
                  cat === c.code
                    ? 'bg-cm-green text-white font-semibold'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                onClick={() => setCat(cat === c.code ? null : c.code)}>
                <span>{c.label}</span>
                {count > 0 && (
                  <span className={`text-[9px] rounded-full px-1 leading-none py-0.5 ${
                    cat === c.code ? 'bg-white text-cm-green' : 'bg-green-100 text-green-700'
                  }`}>{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right: picker panel */}
        <div className="flex-1 min-w-0">
          {!cat ? (
            <div className="flex items-center justify-center h-full text-[11px] text-gray-300">← Select a category</div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-2.5 space-y-2">
              {/* BED */}
              {cat === 'BED' && (<>
                <div className="grid grid-cols-3 gap-1">
                  {BED_SIZES.map(s => (
                    <button key={s} type="button"
                      className={`border rounded py-1 text-[11px] font-medium transition-colors ${
                        size == s ? 'border-cm-green bg-green-50 text-cm-green' : 'border-gray-200 bg-white hover:bg-gray-50'
                      }`}
                      onClick={() => setSize(String(s))}>
                      {s}cm
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-1.5 text-[11px] text-gray-700 cursor-pointer">
                  <input type="checkbox" className="h-3 w-3 accent-cm-green"
                    checked={storage} onChange={e => setStorage(e.target.checked)} />
                  With Storage
                </label>
                {finImg(finish) && (
                  <div className="flex items-center gap-2 mb-1">
                    <img src={finImg(finish)} alt={finLabel(finish)} className="w-7 h-7 rounded object-cover border border-gray-200" />
                    <span className="text-[10px] text-gray-600">{finLabel(finish)}</span>
                  </div>
                )}
                <select className="w-full border border-gray-300 rounded px-2 py-1 text-xs bg-white"
                  value={finish} onChange={e => setFinish(e.target.value)}>
                  {bedFinishes(size).map(f => <option key={f} value={f}>{finLabel(f)}</option>)}
                </select>
              </>)}

              {/* BEDSIDE / TALLBOY / CHEST */}
              {['BEDSIDE','TALLBOY','CHEST'].includes(cat) && (<>
                <div className="grid grid-cols-3 gap-1">
                  {BRANDS.map(b => (
                    <button key={b.code} type="button"
                      className={`border rounded py-1 text-[10px] font-medium transition-colors ${
                        brand === b.code ? 'border-cm-green bg-green-50 text-cm-green' : 'border-gray-200 bg-white hover:bg-gray-50'
                      }`}
                      onClick={() => setBrand(b.code)}>
                      {b.label.split(' ')[0]}
                    </button>
                  ))}
                </div>
                {brand === 'COMPO' && (
                  <div className="grid grid-cols-2 gap-1.5">
                    <div>
                      <label className="block text-[9px] font-semibold text-gray-500 mb-0.5">Body</label>
                      {finImg(bodyFinish) && (
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <img src={finImg(bodyFinish)} alt={finLabel(bodyFinish)} className="w-6 h-6 rounded object-cover border border-gray-200" />
                        </div>
                      )}
                      <select className="w-full border border-gray-300 rounded px-1.5 py-1 text-[11px] bg-white"
                        value={bodyFinish} onChange={e => setBodyFin(e.target.value)}>
                        {COMPO_BODY_FINISHES.map(f => <option key={f} value={f}>{finLabel(f)}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[9px] font-semibold text-gray-500 mb-0.5">Front</label>
                      {finImg(frontFinish) && (
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <img src={finImg(frontFinish)} alt={finLabel(frontFinish)} className="w-6 h-6 rounded object-cover border border-gray-200" />
                        </div>
                      )}
                      <select className="w-full border border-gray-300 rounded px-1.5 py-1 text-[11px] bg-white"
                        value={frontFinish} onChange={e => setFrontFin(e.target.value)}>
                        {(COMPO_FRONT_MAP[bodyFinish] || []).map(f => <option key={f} value={f}>{finLabel(f)}</option>)}
                      </select>
                    </div>
                  </div>
                )}
                {brand === 'NETTUNO' && (<>
                  {finImg(finish) && (
                    <div className="flex items-center gap-2 mb-1">
                      <img src={finImg(finish)} alt={finLabel(finish)} className="w-7 h-7 rounded object-cover border border-gray-200" />
                      <span className="text-[10px] text-gray-600">{finLabel(finish)}</span>
                    </div>
                  )}
                  <select className="w-full border border-gray-300 rounded px-2 py-1 text-xs bg-white"
                    value={finish} onChange={e => setFinish(e.target.value)}>
                    {NETTUNO_FINISHES.map(f => <option key={f} value={f}>{finLabel(f)}</option>)}
                  </select>
                </>)}
                {brand === 'ORIONE' && (
                  <p className="text-[11px] text-gray-500 bg-white rounded p-1.5 border border-gray-200">
                    Rovere Kadiz (KZ) only
                  </p>
                )}
              </>)}

              {/* DRESSER */}
              {cat === 'DRESSER' && (
                <p className="text-[11px] text-gray-500 bg-white rounded p-2 border border-gray-200">
                  Orione Dresser — Rovere Kadiz (KZ) only
                </p>
              )}

              {/* ACC */}
              {cat === 'ACC' && (<>
                <div className="grid grid-cols-1 gap-1 max-h-28 overflow-y-auto">
                  {accTypes.map(a => (
                    <button key={a.code} type="button"
                      className={`border rounded px-2 py-1 text-[10px] text-left transition-colors ${
                        accType === a.code
                          ? 'border-cm-green bg-green-50 text-cm-green'
                          : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-600'
                      }`}
                      onClick={() => setAccType(a.code)}>
                      {a.label}
                    </button>
                  ))}
                </div>
                {showFinishAcc && (<>
                  {finImg(finish) && (
                    <div className="flex items-center gap-2 mb-1">
                      <img src={finImg(finish)} alt={finLabel(finish)} className="w-7 h-7 rounded object-cover border border-gray-200" />
                      <span className="text-[10px] text-gray-600">{finLabel(finish)}</span>
                    </div>
                  )}
                  <select className="w-full border border-gray-300 rounded px-2 py-1 text-xs bg-white"
                    value={finish} onChange={e => setFinish(e.target.value)}>
                    {ACCESSORY_FINISH_LIST.map(f => <option key={f} value={f}>{finLabel(f)}</option>)}
                  </select>
                </>)}
                {accDef?.fixedFinish && (
                  <p className="text-[10px] text-gray-500">Finish: CE — Grigio Cenere (fixed)</p>
                )}
                {accDef?.noFinish && !accDef?.fixedFinish && (
                  <p className="text-[10px] text-gray-500">Single SKU — no finish choice</p>
                )}
              </>)}

              {/* Qty + Add */}
              <div className="flex items-center gap-1.5 pt-1 border-t border-gray-200">
                <button type="button"
                  className="w-6 h-6 border border-gray-300 rounded text-sm leading-none hover:bg-gray-100 flex-shrink-0"
                  onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
                <span className="w-6 text-center text-xs font-medium">{qty}</span>
                <button type="button"
                  className="w-6 h-6 border border-gray-300 rounded text-sm leading-none hover:bg-gray-100 flex-shrink-0"
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

      {/* Cart rows */}
      {furniture.length > 0 && (
        <div className="mt-2 border-t border-gray-100 pt-2 space-y-1 max-h-36 overflow-y-auto">
          <div className="text-[10px] font-semibold text-gray-500 mb-1">
            {furniture.length} item{furniture.length !== 1 ? 's' : ''} in set
          </div>
          {furniture.map((f, i) => (
            <div key={i} className="flex items-center justify-between text-[11px] bg-white border border-gray-100 rounded px-2 py-1.5">
              <span className="flex-1 text-gray-800 truncate">{f.qty > 1 ? `${f.qty}× ` : ''}{f.name}</span>
              {(!f.sku || f.sku.startsWith('MISSING')) && (
                <span className="text-orange-400 text-[10px] mr-1.5 flex-shrink-0" title="SKU not resolved">⚠</span>
              )}
              <button type="button" className="text-gray-300 hover:text-red-500 flex-shrink-0"
                onClick={() => onRemove(i)}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────── Description builder ────────────────────────────────────── */
/**
 * Returns { title, body } where:
 *   title — "Night Collection | wardrobe(s)" — goes into item_name (≤140 chars)
 *   body  — "Furniture: item, item" — goes into description (no length limit)
 *
 * Keeping them separate prevents CharacterLengthExceededError on item_name (Data 140).
 */
function buildDescription({ wardrobes, furniture, furnitureOnly }) {
  if (furnitureOnly) {
    const items = (furniture || []).map(f => `${f.qty > 1 ? `${f.qty}× ` : ''}${f.name}`).join(', ');
    return {
      title: 'Night Collection – Bedroom Furniture',
      body:  items || '',
    };
  }
  const wardParts = (wardrobes || []).map(w =>
    `${MODES.find(m => m.code === w.mode)?.label || w.mode}: ${w.optionLabel} (${finLabel(w.structure?.finish)})`
  );
  const titleParts = ['Night Collection'];
  if (wardParts.length) titleParts.push(wardParts.join(' + '));
  const furnitureBody = (furniture || []).length
    ? `Furniture: ${furniture.map(f => f.name).join(', ')}`
    : '';
  return {
    title: titleParts.join(' | '),
    body:  furnitureBody,
  };
}

/* ─────────────── Main export ─────────────────────────────────────────────── */
export function NightCollectionConfigurator({ onBuilt, onBack }) {
  /* ── Navigation ── */
  const [step, setStep] = useState(1);   // 1–5 outer; 10–16 wardrobe sub-flow

  /* ── Wardrobe draft (for the piece currently being configured) ── */
  const [wMode,      setWMode]      = useState('HINGED');
  const [wOption,    setWOption]    = useState('');
  const [wStrFin,    setWStrFin]    = useState('LW');
  const [wHandleCode,setWHandle]    = useState('HANDLE-SM');
  const [wHandleFin, setWHandleFin] = useState('LW');
  const [wHandleOvr, setWHandleOvr] = useState(false);
  const [wDoors,     setWDoors]     = useState([]);       // [{type,label,tier,finish}]
  const [wSlidingSet,setWSlidingSet]= useState({ setType: 'WOOD', finish: 'LW' });
  const [wAccessories,setWAcc]      = useState({});       // { code: qty }
  const [wAccFinishes, setWAccFin]  = useState({});       // { code: finishCode } — per-acc finish overrides

  /* ── Committed wardrobes ── */
  const [wardrobes,    setWardrobes]  = useState([]);

  /* ── Furniture & delivery ── */
  const [furniture,    setFurniture]  = useState([]);
  const [gozoDelivery, setGozo]       = useState(false);
  const [furnitureOnly,setFurnOnly]   = useState(false);

  /* ── Pricing ── */
  const [pricing,     setPricing]    = useState(null);
  const [pricingErr,  setPricingErr] = useState(null);
  const [pricingLoad, setPricingLoad]= useState(false);

  /* ── Night Collection item catalogue ── */
  const [nightItems, setNightItems] = useState([]);

  useEffect(() => {
    frappe.callGet(
      'casamoderna_dms.configurator_pricing_api.get_night_collection_items'
    ).then(data => setNightItems(data || [])).catch(() => {/* non-fatal */});
  }, []);

  /* ── Handle finish auto-sync ── */
  useEffect(() => {
    if (!wHandleOvr) {
      const allowed = wHandleCode === 'HANDLE-GO' ? ['CE'] : ['LW','NS','CE','AT','PD','PG','KZ','NG'];
      setWHandleFin(allowed.includes(wStrFin) ? wStrFin : allowed[0]);
    }
  }, [wStrFin, wHandleCode, wHandleOvr]);

  /* ── Door groups (derived) ── */
  const doorGroups = useMemo(
    () => ['HINGED','CABINA','PONTE'].includes(wMode) ? buildDoorGroups(wOption, wMode) : [],
    [wOption, wMode]
  );

  /* ── Reset wDoors when option / mode changes ── */
  useEffect(() => {
    setWDoors(doorGroups.map(g => ({ ...g, tier: 'WOOD', finish: 'LW' })));
  }, [doorGroups.length, wOption, wMode]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Reset sliding set when option changes ── */
  useEffect(() => {
    setWSlidingSet({ setType: 'WOOD', finish: 'LW' });
  }, [wOption]);

  /* ── Accessible accessories for current mode/option ── */
  const accessoryList = useMemo(() => ACCESSORIES_CATALOG.filter(a => {
    if (!a.modes.includes(wMode))                                  return false;
    if (a.onlyOptions && !a.onlyOptions.includes(wOption)) return false;
    return true;
  }), [wMode, wOption]);

  /* ── Structure finishes for current option ── */
  const strFinOptions = (wMode === 'SLIDING' && wOption === 'SLIDING_2D_274')
    ? SLIDE274_STRUCT_FINISHES
    : STRUCT_FINISHES;

  /* ── Step navigation helpers ── */
  function nextStepFrom(s) {
    switch (s) {
      case 10: return 11;
      case 11: return 12;
      case 12:
        if (wMode === 'TERMINALE')                         return 16;
        if (wMode === 'OPEN')                              return 15;
        if (['HINGED','CABINA','PONTE'].includes(wMode))   return 13;
        return 14;  // SLIDING
      case 13: return 14;
      case 14: return 15;
      case 15: return 16;
      default: return s + 1;
    }
  }

  function prevStepFrom(s) {
    switch (s) {
      case 11: return 10;
      case 12: return 11;
      case 13: return 12;
      case 14:
        if (['HINGED','CABINA','PONTE'].includes(wMode)) return 13;
        return 12;  // SLIDING
      case 15:
        if (wMode === 'OPEN') return 12;
        return 14;
      case 16:
        if (wMode === 'TERMINALE') return 12;
        if (wMode === 'OPEN')      return 15;
        return 15;
      default: return s - 1;
    }
  }

  /* ── Build draft wardrobe into a plain BOM object ── */
  function buildCurrentWardrobe() {
    const allOpts  = Object.values(OPTIONS).flat();
    const optDef   = allOpts.find(o => o.code === wOption);
    const optLabel = optDef?.label || wOption;
    const isGola   = wHandleCode === 'HANDLE-GO';

    // Structure
    const strFamily  = STRUCT_FAMILY[wOption] || `STR-${wOption}`;
    const strVariant = STRUCT_VARIANT[wOption] || null;
    const strSku     = strVariant
      ? resolveSkuByVariant(nightItems, strFamily, wStrFin, strVariant)
      : resolveSku(nightItems, strFamily, wStrFin);
    const strWeight  = STRUCT_WEIGHTS[wOption] || 1.80;

    // Handles — HINGED / CABINA: 1 per door GROUP (pair or single door), not per leaf.
    // A 4-door wardrobe has 2 pairs → 2 handles. A 3-door has 1 pair + 1 single → 2 handles.
    // PONTE outer doors: 1 per outer group (bridge centre doors never get handles).
    const handles = [];
    if (['HINGED','CABINA'].includes(wMode)) {
      const handleGroupCount = wDoors.length; // wDoors already contains groups (pair/single)
      if (handleGroupCount > 0) {
        handles.push({
          sku:    resolveSku(nightItems, wHandleCode, isGola ? 'CE' : wHandleFin) || `MISSING-HDL`,
          finish: isGola ? 'CE' : wHandleFin,
          type:   wHandleCode,
          qty:    handleGroupCount,
          weight: 0.05,
        });
      }
    } else if (wMode === 'PONTE') {
      const outerGroups = (PONTE_OUTER_DOOR_GROUPS[wOption] || []).filter(g => g.type !== 'ponte');
      if (outerGroups.length > 0) {
        handles.push({
          sku:    resolveSku(nightItems, wHandleCode, isGola ? 'CE' : wHandleFin) || `MISSING-HDL`,
          finish: isGola ? 'CE' : wHandleFin,
          type:   wHandleCode,
          qty:    outerGroups.length,   // 2 for both P6 and P7 (bridge excluded)
          weight: 0.05,
        });
      }
    }

    // Doors
    let doors = [];
    if (['HINGED','CABINA','PONTE'].includes(wMode)) {
      doors = wDoors.map(dg => {
        const fin = dg.tier === 'SP' ? 'SP' : dg.tier === 'BL' ? 'BL' : dg.finish;
        // Ponte centre bridge doors: always DOOR-4, never gola variant
        if (dg.type === 'ponte') {
          return {
            sku:    resolveSku(nightItems, 'DOOR-4 PONTE', fin) || 'MISSING-DOOR-4',
            finish: fin,
            type:   'ponte',
            qty:    1,
            weight: 0.50,
            name:   dg.label,
          };
        }
        const family = isGola
          ? (dg.type === 'pair' ? 'DOOR-G2' : 'DOOR-G1')
          : (dg.type === 'pair' ? 'DOOR-2'  : 'DOOR-1');
        return {
          sku:    resolveSku(nightItems, family, fin) || `MISSING-DOOR-${dg.type}`,
          finish: fin,
          type:   dg.type,
          qty:    1,
          weight: doorWeight(dg.type),
          name:   dg.label,
        };
      });
    } else if (wMode === 'SLIDING' && wSlidingSet) {
      const { doorFamily, doorFinish } = resolveSlidingDoorFamily(wOption, wSlidingSet);
      doors.push({
        sku:    resolveSku(nightItems, doorFamily, doorFinish) || `MISSING-SLIDE-DOOR`,
        finish: doorFinish,
        type:   'sliding',
        qty:    1,
        weight: wOption === 'S3' ? 0.60 : 0.45,
        name:   'Sliding Door Set',
      });
      // SLIDE-274 Riquadrate: auto-add profile
      if (wOption === 'SLIDING_2D_274' && wSlidingSet.setType === 'RQ') {
        doors.push({
          sku:    resolveSku(nightItems, 'RQ-PROFILE', wStrFin) || 'MISSING-RQ-PROFILE',
          finish: wStrFin,
          type:   'profile',
          qty:    1,
          weight: 0.10,
          name:   'Riquadrata Profile',
        });
      }
    }

    // Accessories (not for TERMINALE)
    const accLines = [];
    if (wMode !== 'TERMINALE') {
      for (const [code, qty] of Object.entries(wAccessories)) {
        if (!qty || qty <= 0) continue;
        const def    = ACCESSORIES_CATALOG.find(a => a.code === code);
        const accMap = ACC_FAMILY[code];
        let sku = null;
        let resolvedFin = '';
        if (accMap) {
          // Use per-accessory finish override if set, otherwise derive from structure
          const baseFin = wAccFinishes[code] || (accMap.finishKey ? wStrFin : (accMap.finishFixed || ''));
          resolvedFin = baseFin;
          sku = accMap.variant
            ? resolveSkuByVariant(nightItems, accMap.family, baseFin, accMap.variant)
            : resolveSku(nightItems, accMap.family, baseFin);
          // If exact finish has no item (e.g. NG/KZ/PD for ACC-GRILLE), try fallbacks
          if (!sku && accMap.finishFallback) {
            for (const fb of accMap.finishFallback) {
              sku = resolveSku(nightItems, accMap.family, fb);
              if (sku) { resolvedFin = fb; break; }
            }
          }
        }
        accLines.push({
          code,
          sku:    sku || `ACC-${code}`,
          name:   def?.label || code,
          qty:    parseInt(qty),
          weight: def?.weight || 0.05,
          ...(resolvedFin ? { finish: resolvedFin } : {}),
        });
      }
    }

    return {
      mode: wMode, option: wOption, optionLabel: optLabel,
      structure: { sku: strSku || `MISSING-STR-${wOption}`, finish: wStrFin, qty: 1, weight: strWeight },
      doors, handles, accessories: accLines,
    };
  }

  function resetDraftWardrobe() {
    setWMode('HINGED'); setWOption(''); setWStrFin('LW');
    setWHandle('HANDLE-SM'); setWHandleFin('LW'); setWHandleOvr(false);
    setWDoors([]); setWSlidingSet({ setType: 'WOOD', finish: 'LW' }); setWAcc({}); setWAccFin({});
  }

  function restoreLastWardrobe() {
    if (wardrobes.length === 0) return;
    const last = wardrobes[wardrobes.length - 1];
    setWardrobes(prev => prev.slice(0, -1));
    setWMode(last.mode);
    setWOption(last.option);
    setWStrFin(last.structure?.finish || 'LW');
    const hEntry = (last.handles || [])[0];
    setWHandle(hEntry?.type || 'HANDLE-SM');
    setWHandleFin(hEntry?.finish || 'LW');
    setWHandleOvr(false);
    const doorState = (last.doors || [])
      .filter(d => !['ponte','profile','sliding'].includes(d.type))
      .map(d => ({
        type:  d.type,
        label: d.name,
        tier:  d.finish === 'SP' ? 'SP' : d.finish === 'BL' ? 'BL' : 'WOOD',
        finish: (d.finish === 'SP' || d.finish === 'BL') ? 'LW' : d.finish,
      }));
    setWDoors(doorState);
    const slideDoor = (last.doors || []).find(d => d.type === 'sliding');
    if (slideDoor) setWSlidingSet({ setType: 'WOOD', finish: slideDoor.finish });
    const accMap = {};
    const accFinMap = {};
    for (const a of (last.accessories || [])) {
      if (a.code) {
        accMap[a.code] = a.qty;
        if (a.finish) accFinMap[a.code] = a.finish;
      }
    }
    setWAcc(accMap);
    setWAccFin(accFinMap);
  }

  /* ── BOM object ── */
  function buildBom() {
    return {
      configurator_type: 'Night Collection',
      gozo_delivery: gozoDelivery,
      wardrobes: furnitureOnly ? [] : wardrobes,
      furniture,
    };
  }

  /* ── Pricing API call ── */
  const fetchPricing = useCallback(async (bom) => {
    setPricingLoad(true); setPricingErr(null);
    try {
      const result = await frappe.call(
        'casamoderna_dms.configurator_pricing_api.resolve_night_collection_bom_price',
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

  /* ── "Add to Document" ── */
  async function handleAddToDocument() {
    const bom = buildBom();
    let pr = pricing;
    if (!pr) pr = await fetchPricing(bom);
    onBuilt?.({
      ...bom,
      ...(() => { const d = buildDescription({ wardrobes, furniture, furnitureOnly }); return { description: d.title, descriptionBody: d.body }; })(),
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
        rrpExVat:       Math.round((pr.rrp_inc_vat         / (1 + pr.vat_rate / 100)) * 100) / 100,
      } : null,
    });
  }

  /* ── Item count footer ── */
  const showFooter = [10,11,12,13,14,15,16,3,4].includes(step);
  const itemCount  = wardrobes.length + furniture.length;

  /* ── Wardrobe sub-flow step display (internal steps 10–16 map to sub-step 1–7) ── */
  const _wSubStep  = step >= 10 ? step - 9 : 0;
  const wSubTotal = (() => {
    if (wMode === 'TERMINALE') return 4;   // 10,11,12,16
    if (wMode === 'OPEN')      return 5;   // 10,11,12,15,16
    if (['HINGED','CABINA','PONTE'].includes(wMode)) return 7;
    return 6;  // SLIDING
  })();

  /* ════════════════════ STEP RENDERERS ════════════════════════════════════ */
  function renderStep() {
    switch (step) {

      /* ══════════════════════════════════════════════════════════════════
         STEP 1 — Choose: wardrobe or furniture only
         ══════════════════════════════════════════════════════════════════ */
      case 1:
        return (
          <div>
            <div className="text-sm font-semibold text-gray-800 mb-2">
              {wardrobes.length > 0
                ? `Add Wardrobe Piece ${wardrobes.length + 1}`
                : 'What would you like to configure?'}
            </div>

            {wardrobes.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-2 mb-3 text-[11px] text-gray-500 space-y-0.5">
                <div className="font-semibold text-gray-600 mb-0.5">Already in set:</div>
                {wardrobes.map((w, i) => (
                  <div key={i}>· {MODES.find(m => m.code === w.mode)?.label}: {w.optionLabel} — {finLabel(w.structure?.finish)}</div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <button type="button"
                className="w-full text-left border border-gray-200 rounded-lg px-4 py-3 text-sm hover:bg-gray-50 transition-colors"
                onClick={() => { setFurnOnly(false); setStep(10); }}>
                <div className="font-medium">Configure a Wardrobe</div>
                <div className="text-[11px] text-gray-400 mt-0.5">Hinged, Sliding, Cabina, Ponte, Open or Terminal End Panel</div>
              </button>

              {wardrobes.length === 0 && (
                <button type="button"
                  className={`w-full text-left border rounded-lg px-4 py-3 text-sm transition-colors ${
                    furnitureOnly ? 'border-cm-green bg-green-50 font-semibold' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                  onClick={() => { setFurnOnly(true); setStep(3); }}>
                  <div className="font-medium">Bedroom Furniture Only</div>
                  <div className="text-[11px] font-normal text-gray-400 mt-0.5">Beds, bedsides, chests and accessories — no wardrobe</div>
                </button>
              )}

              {wardrobes.length > 0 && (
                <button type="button"
                  className="w-full text-left border border-cm-green text-cm-green rounded-lg px-4 py-3 text-sm hover:bg-green-50 transition-colors font-semibold"
                  onClick={() => setStep(3)}>
                  Continue to Furniture →
                  <div className="text-[11px] font-normal text-gray-400 mt-0.5">
                    {wardrobes.length} wardrobe piece{wardrobes.length !== 1 ? 's' : ''} configured
                  </div>
                </button>
              )}
            </div>

            <div className="flex justify-between mt-4">
              <button type="button"
                className="px-3 py-1.5 text-xs border border-gray-200 rounded hover:bg-gray-50"
                onClick={onBack}>
                ← Back
              </button>
            </div>
          </div>
        );

      /* ══════════════════════════════════════════════════════════════════
         STEP 10 — Wardrobe Type
         ══════════════════════════════════════════════════════════════════ */
      case 10:
        return (
          <div>
            <StepPill current={1} total={wSubTotal} />
            <div className="text-sm font-semibold text-gray-800 mb-3">Wardrobe Type</div>
            <div className="grid grid-cols-2 gap-2">
              {MODES.map(m => (
                <button key={m.code} type="button"
                  className={`border rounded-lg px-3 py-2.5 text-[12px] text-left transition-colors ${
                    wMode === m.code ? 'border-cm-green bg-green-50 font-semibold text-cm-green' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                  onClick={() => { setWMode(m.code); setWOption(''); }}>
                  {m.label}
                </button>
              ))}
            </div>
            <NavButtons
              onBack={() => setStep(1)}
              onNext={() => setStep(11)}
            />
          </div>
        );

      /* ══════════════════════════════════════════════════════════════════
         STEP 11 — Size / Option Selection
         ══════════════════════════════════════════════════════════════════ */
      case 11: {
        const optList = OPTIONS[wMode] || [];
        return (
          <div>
            <StepPill current={2} total={wSubTotal} />
            <div className="text-sm font-semibold text-gray-800 mb-2">
              {MODES.find(m => m.code === wMode)?.label} — Size
            </div>
            <div className="grid grid-cols-1 gap-1.5 max-h-64 overflow-y-auto">
              {optList.map(o => (
                <button key={o.code} type="button"
                  className={`border rounded-lg px-3 py-2 text-[12px] text-left transition-colors ${
                    wOption === o.code ? 'border-cm-green bg-green-50 font-semibold text-cm-green' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                  onClick={() => setWOption(o.code)}>
                  {o.label}
                </button>
              ))}
            </div>
            <NavButtons
              onBack={() => setStep(10)}
              onNext={() => setStep(12)}
              nextDisabled={!wOption}
            />
          </div>
        );
      }

      /* ══════════════════════════════════════════════════════════════════
         STEP 12 — Structure Finish
         ══════════════════════════════════════════════════════════════════ */
      case 12:
        return (
          <div>
            <StepPill current={3} total={wSubTotal} />
            <div className="text-sm font-semibold text-gray-800 mb-3">Structure Finish</div>
            <div className="grid grid-cols-4 gap-1.5">
              {strFinOptions.map(f => (
                <button key={f} type="button"
                  className={`border rounded overflow-hidden text-center transition-colors ${
                    wStrFin === f ? 'border-cm-green ring-2 ring-cm-green' : 'border-gray-200 hover:border-gray-400'
                  }`}
                  onClick={() => setWStrFin(f)}>
                  {finImg(f) && (
                    <img src={finImg(f)} alt={finLabel(f)} className="w-full h-10 object-cover" />
                  )}
                  <div className={`text-[10px] py-1 px-0.5 leading-tight ${wStrFin === f ? 'font-semibold text-cm-green bg-green-50' : 'text-gray-700'}`}>
                    {finLabel(f)}
                  </div>
                </button>
              ))}
            </div>
            {wMode === 'SLIDING' && wOption === 'SLIDING_2D_274' && (
              <p className="text-[10px] text-gray-400 mt-1.5">Slide 274: Antracite (AT) not available in this width.</p>
            )}
            <NavButtons
              onBack={() => setStep(11)}
              onNext={() => setStep(nextStepFrom(12))}
            />
          </div>
        );

      /* ══════════════════════════════════════════════════════════════════
         STEP 13 — Handle Type + Finish  (HINGED / CABINA / PONTE)
         ══════════════════════════════════════════════════════════════════ */
      case 13: {
        const isGola = wHandleCode === 'HANDLE-GO';
        return (
          <div>
            <StepPill current={4} total={wSubTotal} />
            <div className="text-sm font-semibold text-gray-800 mb-3">Handle</div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                {HANDLE_TYPES.map(h => (
                  <button key={h.code} type="button"
                    className={`w-full text-left border rounded-lg px-3 py-2 text-[12px] transition-colors ${
                      wHandleCode === h.code ? 'border-cm-green bg-green-50 font-semibold text-cm-green' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                    onClick={() => { setWHandle(h.code); setWHandleOvr(false); }}>
                    {h.label}
                  </button>
                ))}
              </div>
              {!isGola ? (
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                    Handle Finish
                    {!wHandleOvr && <span className="ml-1 text-gray-400 font-normal">(auto-matched to structure)</span>}
                  </label>
                  {finImg(wHandleFin) && (
                    <div className="flex items-center gap-2 mb-1.5">
                      <img src={finImg(wHandleFin)} alt={finLabel(wHandleFin)} className="w-8 h-8 rounded object-cover border border-gray-200" />
                      <span className="text-[11px] text-gray-600">{finLabel(wHandleFin)}</span>
                    </div>
                  )}
                  <select
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                    value={wHandleFin}
                    onChange={e => { setWHandleFin(e.target.value); setWHandleOvr(true); }}>
                    {['LW','NS','CE','AT','PD','PG','KZ','NG'].map(f => (
                      <option key={f} value={f}>{finLabel(f)}</option>
                    ))}
                  </select>
                  {wHandleOvr && (
                    <button type="button" className="text-[10px] text-cm-green mt-0.5"
                      onClick={() => setWHandleOvr(false)}>
                      Reset to structure finish
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-[11px] text-gray-500 bg-gray-50 rounded p-2">
                  Gola handles are always in <strong>CE – Grigio Cenere</strong> finish.
                </div>
              )}
            </div>
            <NavButtons onBack={() => setStep(prevStepFrom(13))} onNext={() => setStep(14)} />
          </div>
        );
      }

      /* ══════════════════════════════════════════════════════════════════
         STEP 14 — Door Configuration
         ══════════════════════════════════════════════════════════════════ */
      case 14: {
        const isGola = wHandleCode === 'HANDLE-GO';

        /* ── SLIDING doors ── */
        if (wMode === 'SLIDING') {
          const is274  = wOption === 'SLIDING_2D_274';
          const is3D   = wOption === 'S3';
          const setOpts = is274
            ? SLIDE274_DOOR_TYPES
            : is3D ? SLIDING_DOOR_SETS_3D : SLIDING_DOOR_SETS_2D;
          const curSet = setOpts.find(s => s.code === wSlidingSet.setType) || setOpts[0];
          const needFinish = !is274
            ? (curSet.code !== 'BL')
            : (wSlidingSet.setType === 'RQ');
          const finOpts = is274 && wSlidingSet.setType === 'RQ'
            ? SLIDE274_RQ_FINISHES
            : DOOR_STD_FINISHES;

          return (
            <div>
              <StepPill current={is274 ? 4 : 4} total={wSubTotal} />
              <div className="text-sm font-semibold text-gray-800 mb-2">Sliding Door Set</div>
              <div className="space-y-1.5 mb-3">
                {setOpts.map(s => (
                  <button key={s.code} type="button"
                    className={`w-full text-left border rounded-lg px-3 py-2 text-[12px] transition-colors ${
                      wSlidingSet.setType === s.code
                        ? 'border-cm-green bg-green-50 font-semibold text-cm-green'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                    onClick={() => setWSlidingSet(prev => ({ ...prev, setType: s.code }))}>
                    {s.label}
                  </button>
                ))}
              </div>
              {needFinish && (
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">Door Finish</label>
                  {finImg(wSlidingSet.finish) && (
                    <div className="flex items-center gap-2 mb-1.5">
                      <img src={finImg(wSlidingSet.finish)} alt={finLabel(wSlidingSet.finish)} className="w-8 h-8 rounded object-cover border border-gray-200" />
                      <span className="text-[11px] text-gray-600">{finLabel(wSlidingSet.finish)}</span>
                    </div>
                  )}
                  <select
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                    value={wSlidingSet.finish}
                    onChange={e => setWSlidingSet(prev => ({ ...prev, finish: e.target.value }))}>
                    {finOpts.map(f => <option key={f} value={f}>{finLabel(f)}</option>)}
                  </select>
                </div>
              )}
              {!needFinish && curSet?.finishFixed && (
                <p className="text-[11px] text-gray-500 bg-gray-50 rounded p-2">
                  Finish fixed: <strong>{finLabel(curSet.finishFixed)}</strong>
                </p>
              )}
              {is274 && wSlidingSet.setType === 'RQ' && (
                <p className="text-[10px] text-gray-400 mt-1">
                  Profile matching structure finish will be included automatically.
                </p>
              )}
              <NavButtons onBack={() => setStep(prevStepFrom(14))} onNext={() => setStep(15)} />
            </div>
          );
        }

        /* ── HINGED / CABINA / PONTE doors ── */
        if (doorGroups.length === 0) {
          return (
            <div>
              <StepPill current={5} total={wSubTotal} />
              <div className="text-sm font-semibold text-gray-800 mb-3">Door Finishes</div>
              <div className="text-[11px] text-gray-400 py-4 text-center">No door selection for this configuration.</div>
              <NavButtons onBack={() => setStep(prevStepFrom(14))} onNext={() => setStep(15)} />
            </div>
          );
        }

        return (
          <div>
            <StepPill current={5} total={wSubTotal} />
            <div className="text-sm font-semibold text-gray-800 mb-2">Door Finishes</div>
            {wMode === 'PONTE' && (
              <p className="text-[10px] text-gray-400 mb-2">
                Select a finish for each door group. The 4 small centre doors are always without handles.
              </p>
            )}
            <div className="space-y-3">
              {doorGroups.map((g, idx) => {
                const dState = wDoors[idx] || { tier: 'WOOD', finish: 'LW' };
                const spDisabled = isGola || g.type !== 'pair';
                return (
                  <div key={idx} className="border border-gray-100 rounded-lg p-2.5 bg-gray-50">
                    <div className="text-[11px] font-semibold text-gray-700 mb-1.5">{g.label}</div>

                    {/* Three-tier selector */}
                    <div className="flex gap-1 mb-2">
                      {[
                        { code: 'WOOD', label: 'Wood' },
                        { code: 'BL',   label: 'Bianco Lucido' },
                        { code: 'SP',   label: 'Specchio' },
                      ].map(t => (
                        <button key={t.code} type="button"
                          disabled={t.code === 'SP' && spDisabled}
                          className={`flex-1 py-1 text-[10px] rounded border transition-colors ${
                            t.code === 'SP' && spDisabled
                              ? 'border-gray-100 bg-gray-100 text-gray-300 cursor-not-allowed'
                              : dState.tier === t.code
                                ? 'border-cm-green bg-green-50 font-semibold text-cm-green'
                                : 'border-gray-200 bg-white hover:bg-gray-50'
                          }`}
                          onClick={() => {
                            const newDoors = [...wDoors];
                            newDoors[idx] = { ...newDoors[idx], tier: t.code };
                            setWDoors(newDoors);
                          }}>
                          {t.label}
                        </button>
                      ))}
                    </div>

                    {/* Finish dropdown — only for WOOD tier */}
                    {dState.tier === 'WOOD' && (
                      <>
                      {finImg(dState.finish) && (
                        <div className="flex items-center gap-2 mb-1">
                          <img src={finImg(dState.finish)} alt={finLabel(dState.finish)} className="w-7 h-7 rounded object-cover border border-gray-200" />
                          <span className="text-[10px] text-gray-600">{finLabel(dState.finish)}</span>
                        </div>
                      )}
                      <select
                        className="w-full border border-gray-300 rounded px-2 py-1 text-xs bg-white"
                        value={dState.finish}
                        onChange={e => {
                          const newDoors = [...wDoors];
                          newDoors[idx] = { ...newDoors[idx], finish: e.target.value };
                          setWDoors(newDoors);
                        }}>
                        {DOOR_STD_FINISHES.map(f => <option key={f} value={f}>{finLabel(f)}</option>)}
                      </select>
                      </>
                    )}
                    {dState.tier === 'BL' && (
                      <p className="text-[10px] text-gray-500 bg-white rounded px-2 py-1 border border-gray-200">
                        Bianco Lucido — high gloss white
                      </p>
                    )}
                    {dState.tier === 'SP' && !spDisabled && (
                      <p className="text-[10px] text-gray-500 bg-white rounded px-2 py-1 border border-gray-200">
                        Specchio — mirror finish (pairs only)
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <NavButtons onBack={() => setStep(prevStepFrom(14))} onNext={() => setStep(15)} />
          </div>
        );
      }

      /* ══════════════════════════════════════════════════════════════════
         STEP 15 — Internal Accessories
         ══════════════════════════════════════════════════════════════════ */
      case 15:
        return (
          <div>
            <StepPill current={wMode === 'OPEN' ? 4 : 6} total={wSubTotal} />
            <div className="text-sm font-semibold text-gray-800 mb-2">Wardrobe Accessories</div>
            {accessoryList.length === 0 ? (
              <div className="text-[11px] text-gray-400 py-4 text-center">No accessories available for this configuration.</div>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {accessoryList.map(a => {
                  const qty = wAccessories[a.code] || 0;
                  const accMapEntry = ACC_FAMILY[a.code];
                  // Show finish picker for accessories that have a finishFallback list (i.e. UNDER_PONTE)
                  const finishOptions = accMapEntry?.finishFallback || null;
                  return (
                    <div key={a.code} className="py-0.5">
                      <div className="flex items-center gap-2">
                        <label className="flex-1 text-xs text-gray-700 cursor-pointer" htmlFor={`acc_${a.code}`}>{a.label}</label>
                        <div className="flex items-center gap-1">
                          <button type="button"
                            className="w-6 h-6 border border-gray-200 rounded text-xs hover:bg-gray-50 leading-none"
                            onClick={() => setWAcc(prev => ({ ...prev, [a.code]: Math.max(0, (prev[a.code] || 0) - 1) }))}>
                            −
                          </button>
                          <span className={`w-5 text-center text-xs font-medium ${qty > 0 ? 'text-cm-green' : 'text-gray-300'}`}>
                            {qty}
                          </span>
                          <button type="button"
                            className="w-6 h-6 border border-gray-200 rounded text-xs hover:bg-gray-50 leading-none"
                            onClick={() => setWAcc(prev => ({ ...prev, [a.code]: (prev[a.code] || 0) + 1 }))}>
                            +
                          </button>
                        </div>
                      </div>
                      {/* Inline finish picker — shown when item has finish options and qty > 0 */}
                      {finishOptions && qty > 0 && (
                        <div className="mt-1.5 ml-0 pl-0">
                          <div className="text-[9px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">Finish</div>
                          <div className="flex flex-wrap gap-1">
                            {finishOptions.map(fin => {
                              const active = wAccFinishes[a.code] ? wAccFinishes[a.code] === fin : fin === wStrFin;
                              return (
                                <button key={fin} type="button"
                                  className={`border rounded overflow-hidden flex items-center gap-1 px-1.5 py-0.5 text-[10px] transition-colors ${active ? 'border-cm-green bg-green-50 font-semibold text-cm-green' : 'border-gray-200 hover:border-gray-400'}`}
                                  onClick={() => setWAccFin(prev => ({ ...prev, [a.code]: fin }))}>
                                  {finImg(fin) && <img src={finImg(fin)} alt={finLabel(fin)} className="w-4 h-4 rounded object-cover border border-gray-200 flex-shrink-0" />}
                                  {finLabel(fin)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <NavButtons
              onBack={() => setStep(prevStepFrom(15))}
              onNext={() => setStep(16)}
              nextLabel="Review Wardrobe"
            />
          </div>
        );

      /* ══════════════════════════════════════════════════════════════════
         STEP 16 — Wardrobe Summary Card
         ══════════════════════════════════════════════════════════════════ */
      case 16: {
        const currentWardrobe = buildCurrentWardrobe();
        const continueLabel   = `Continue to Furniture${wardrobes.length > 0 ? ` (${wardrobes.length + 1} pieces)` : ''}`;
        return (
          <div>
            <StepPill current={wSubTotal} total={wSubTotal} />
            <div className="text-sm font-semibold text-gray-800 mb-2">Wardrobe Summary</div>

            <WardrobeCard wardrobe={currentWardrobe} label="Just configured" />

            {/* Add another piece button */}
            <button type="button"
              className="w-full mt-2 border border-dashed border-gray-300 rounded-lg py-2.5 text-[11px] text-gray-500 hover:bg-gray-50 hover:border-gray-400 transition-colors"
              onClick={() => {
                setWardrobes(prev => [...prev, currentWardrobe]);
                resetDraftWardrobe();
                setStep(10);
              }}>
              + Add Another Wardrobe Piece
            </button>

            {/* Previously added pieces */}
            {wardrobes.length > 0 && (
              <div className="mt-3">
                <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  In set — {wardrobes.length} previous piece{wardrobes.length !== 1 ? 's' : ''}
                </div>
                <div className="space-y-1.5">
                  {wardrobes.map((w, i) => (
                    <WardrobeCard key={i} wardrobe={w} label={`Piece ${i + 1}`}
                      onRemove={() => setWardrobes(prev => prev.filter((_, j) => j !== i))} />
                  ))}
                </div>
              </div>
            )}

            <NavButtons
              onBack={() => setStep(prevStepFrom(16))}
              onNext={() => { setWardrobes(prev => [...prev, currentWardrobe]); setStep(3); }}
              nextLabel={continueLabel}
            />
          </div>
        );
      }

      /* ══════════════════════════════════════════════════════════════════
         STEP 3 — Bedroom Furniture (cart)
         ══════════════════════════════════════════════════════════════════ */
      case 3:
        return (
          <div>
            <div className="text-sm font-semibold text-gray-800 mb-1">Bedroom Furniture</div>
            <p className="text-[11px] text-gray-400 mb-3">
              {furnitureOnly
                ? 'Select the pieces you need.'
                : 'Add pieces to complete the set — or skip for wardrobe only.'}
            </p>

            {/* Recap of configured wardrobes */}
            {!furnitureOnly && wardrobes.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {wardrobes.map((w, i) => (
                  <WardrobeCard key={i} wardrobe={w}
                    label={wardrobes.length > 1 ? `Wardrobe ${i + 1}` : 'Configured Wardrobe'} />
                ))}
              </div>
            )}

            <FurniturePicker
              nightItems={nightItems}
              furniture={furniture}
              onAdd={item => setFurniture(prev => [...prev, item])}
              onRemove={idx => setFurniture(prev => prev.filter((_, j) => j !== idx))}
            />

            <NavButtons
              onBack={() => {
                if (furnitureOnly) { onBack?.(); }
                else { restoreLastWardrobe(); setStep(16); }
              }}
              onNext={() => setStep(4)}
              nextLabel="Delivery Options →"
              nextDisabled={furnitureOnly && furniture.length === 0}
            />
          </div>
        );

      /* ══════════════════════════════════════════════════════════════════
         STEP 4 — Delivery Options
         ══════════════════════════════════════════════════════════════════ */
      case 4:
        return (
          <div>
            <div className="text-sm font-semibold text-gray-800 mb-3">Delivery Options</div>

            <div className="space-y-2">
              <div className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                !gozoDelivery ? 'border-cm-green bg-green-50' : 'border-gray-200 hover:bg-gray-50'
              }`} onClick={() => setGozo(false)}>
                <div className="flex items-center gap-2">
                  <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                    !gozoDelivery ? 'border-cm-green' : 'border-gray-300'
                  }`}>
                    {!gozoDelivery && <div className="w-1.5 h-1.5 rounded-full bg-cm-green" />}
                  </div>
                  <div className="text-sm font-medium text-gray-800">Malta Delivery</div>
                </div>
                <div className="text-[11px] text-gray-400 ml-5.5 mt-0.5">Standard delivery</div>
              </div>

              <div className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                gozoDelivery ? 'border-amber-500 bg-amber-50' : 'border-gray-200 hover:bg-gray-50'
              }`} onClick={() => setGozo(true)}>
                <div className="flex items-center gap-2">
                  <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                    gozoDelivery ? 'border-amber-500' : 'border-gray-300'
                  }`}>
                    {gozoDelivery && <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                  </div>
                  <div className="text-sm font-medium text-gray-800">Gozo Delivery</div>
                </div>
                <div className="text-[11px] text-gray-400 ml-5.5 mt-0.5">+€80 surcharge applied to order</div>
              </div>
            </div>

            <NavButtons
              onBack={() => setStep(3)}
              onNext={() => { setPricing(null); fetchPricing(buildBom()); setStep(5); }}
              nextLabel="Review & Price →"
            />
          </div>
        );

      /* ══════════════════════════════════════════════════════════════════
         STEP 5 — Summary + Pricing
         ══════════════════════════════════════════════════════════════════ */
      case 5: {
        const bom = buildBom();
        return (
          <div>
            <div className="text-sm font-semibold text-gray-800 mb-3">Summary</div>

            {/* Wardrobe breakdown */}
            <div className="text-[11px] space-y-1 bg-gray-50 rounded p-3 mb-3">
              {furnitureOnly ? (
                <div><span className="text-gray-500">Type:</span> <span className="font-medium">Bedroom Furniture Only</span></div>
              ) : wardrobes.length === 0 ? (
                <div className="text-gray-400">No wardrobe configured</div>
              ) : (
                wardrobes.map((w, i) => (
                  <div key={i} className={wardrobes.length > 1 ? 'pb-1 border-b border-gray-200 last:border-0' : ''}>
                    {wardrobes.length > 1 && <div className="font-semibold text-gray-600 mb-0.5">Wardrobe {i + 1}</div>}
                    <div><span className="text-gray-500">Mode:</span> <span className="font-medium">{MODES.find(m => m.code === w.mode)?.label}</span></div>
                    <div><span className="text-gray-500">Option:</span> <span className="font-medium">{w.optionLabel}</span></div>
                    <div><span className="text-gray-500">Structure:</span> <span className="font-medium">{finLabel(w.structure?.finish)}</span></div>
                    {['HINGED','CABINA','PONTE'].includes(w.mode) && (w.handles || []).length > 0 && (
                      <div><span className="text-gray-500">Handle:</span> <span className="font-medium">
                        {HANDLE_TYPES.find(h => h.code === w.handles[0].type)?.label}
                        {w.handles[0].type !== 'HANDLE-GO' ? ` — ${finLabel(w.handles[0].finish)}` : ''}
                      </span></div>
                    )}
                    {(w.doors || []).filter(d => !['ponte','profile'].includes(d.type)).length > 0 && (
                      <div><span className="text-gray-500">Doors:</span> <span className="font-medium">
                        {[...new Set(w.doors.filter(d => !['ponte','profile'].includes(d.type)).map(d => finLabel(d.finish)))].join(', ')}
                      </span></div>
                    )}
                    {(w.accessories || []).length > 0 && (
                      <div><span className="text-gray-500">Accessories:</span> <span className="font-medium">
                        {w.accessories.map(a => `${a.name}${a.qty > 1 ? ` ×${a.qty}` : ''}`).join(', ')}
                      </span></div>
                    )}
                  </div>
                ))
              )}
              {furniture.length > 0 && (
                <div className="pt-1 border-t border-gray-200">
                  <div className="text-gray-500 mb-0.5">Furniture:</div>
                  {furniture.map((f, i) => (
                    <div key={i} className="ml-2">{f.qty > 1 ? `${f.qty}× ` : ''}{f.name}</div>
                  ))}
                </div>
              )}
              {gozoDelivery && <div className="pt-1 text-amber-600 font-medium">+ Gozo delivery surcharge</div>}
            </div>

            {/* Pricing block */}
            {pricingLoad && (
              <div className="text-[11px] text-gray-400 text-center py-4 animate-pulse">Calculating price…</div>
            )}
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

      default:
        return null;
    }
  }

  /* ── Persistent item-count footer ── */
  const footer = showFooter && itemCount > 0 ? (
    <div className="mt-3 pt-2 border-t border-gray-100 text-[10px] text-gray-400 text-right">
      {itemCount} item{itemCount !== 1 ? 's' : ''} in set
      {wardrobes.length > 0 && ` (${wardrobes.length} wardrobe${wardrobes.length !== 1 ? 's' : ''}${furniture.length > 0 ? `, ${furniture.length} furniture` : ''})`}
    </div>
  ) : null;

  return (
    <div>
      {renderStep()}
      {footer}
    </div>
  );
}
