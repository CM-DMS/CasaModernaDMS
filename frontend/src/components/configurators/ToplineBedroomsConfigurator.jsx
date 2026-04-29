/**
 * ToplineBedroomsConfigurator — bedroom set configurator for the Topline Mobili range.
 *
 * Supports 9 collections: Nicole, Zoe, Luisa, Giulia, Ischia, Olympia, Vanessa, Tiffany, Emma.
 * Follows the same multi-step pattern as LorellaCollectionConfigurator.
 *
 * Flow:
 *   Step 1  — Choose range (9 collection cards)
 *   Step 2  — Choose finish variant (per-range options)
 *   Step 3  — Full Set or Individual Pieces?
 *   Step 4  — Select wardrobe (individual path)
 *   Step 5  — Select bed (individual path)
 *   Step 6  — Bedroom furniture checkboxes (individual path)
 *   Step 7  — Review, pricing & Add to Quotation
 *
 * Props: { onBuilt(config), onBack }
 */
import { useState, useMemo, useCallback } from 'react';
import { frappe } from '../../api/frappe';

/* ─────────────── Utility sub-components ─────────────────────────────────── */
function StepPill({ current, total }) {
  return (
    <div className="flex items-center gap-1 text-[10px] text-gray-400 mb-3">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 rounded-full transition-all ${i + 1 <= current ? 'bg-cm-green w-4' : 'bg-gray-200 w-1.5'}`}
        />
      ))}
      <span className="ml-1">Step {current} of {total}</span>
    </div>
  );
}

function NavButtons({ onBack, onNext, nextLabel = 'Next →', nextDisabled = false, loading = false }) {
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

/* ─────────────── Collection catalogue ───────────────────────────────────── */

const RANGES = [
  {
    code: 'NICOLE',
    label: 'Nicole',
    image: '/dms/images/topline/Nicole_2.webp',
    finishSummary: 'Rovere Natura / BL · Noce Ghiaccio / BL',
    finishes: [
      { code: 'RN_BL', label: 'Rovere Natura / Bianco Legno' },
      { code: 'NG_BL', label: 'Noce Ghiaccio / Bianco Legno' },
    ],
  },
  {
    code: 'ZOE',
    label: 'Zoe',
    image: '/dms/images/topline/Zoe_2.webp',
    finishSummary: 'Noce Brunito/Talco · NB/Grigio Legno · GL/CG · GL/NB',
    finishes: [
      { code: 'NB_TC', label: 'Noce Brunito / Talco' },
      { code: 'NB_GL', label: 'Noce Brunito / Grigio Legno' },
      { code: 'GL_CG', label: 'Grigio Legno / Cemento Gres' },
      { code: 'GL_NB', label: 'Grigio Legno / Noce Brunito' },
    ],
  },
  {
    code: 'LUISA',
    label: 'Luisa',
    image: '/dms/images/topline/Louisa_2.webp',
    finishSummary: 'Grigio Legno/Cemento Gres · Bianco Graffiato · Olmo',
    finishes: [
      { code: 'GC', label: 'Grigio Legno / Cemento Gres' },
      { code: 'BG', label: 'Bianco Graffiato' },
      { code: 'OL', label: 'Olmo' },
    ],
  },
  {
    code: 'GIULIA',
    label: 'Giulia',
    image: '/dms/images/topline/Giulia_2.webp',
    finishSummary: 'Bianco Graffiato · Olmo',
    finishes: [
      { code: 'BG', label: 'Bianco Graffiato' },
      { code: 'OL', label: 'Olmo' },
    ],
  },
  {
    code: 'ISCHIA',
    label: 'Ischia',
    image: '/dms/images/topline/Ischia_2.webp',
    finishSummary: 'Patina Beige · Patina Beige Serigrafata',
    finishes: [
      { code: 'BP',  label: 'Patina Beige' },
      { code: 'PBS', label: 'Patina Beige Serigrafata' },
    ],
  },
  {
    code: 'OLYMPIA',
    label: 'Olympia',
    image: '/dms/images/topline/Olymipia_2.webp',
    finishSummary: 'Patina Beige · Patina Beige Serigrafata',
    finishes: [
      { code: 'BP',  label: 'Patina Beige' },
      { code: 'PBS', label: 'Patina Beige Serigrafata' },
    ],
  },
  {
    code: 'VANESSA',
    label: 'Vanessa',
    image: '/dms/images/topline/Vanessa_2.webp',
    finishSummary: 'Rovere Grigio / Bianco Neve',
    finishes: [
      { code: 'RG_BN', label: 'Rovere Grigio / Bianco Neve' },
    ],
  },
  {
    code: 'TIFFANY',
    label: 'Tiffany',
    image: '/dms/images/topline/Tiffany_2.webp',
    finishSummary: 'Bianco Neve Serigrafata Glitter',
    finishes: [
      { code: 'BN_BSG', label: 'Bianco Neve Serigrafata Glitter' },
    ],
  },
  {
    code: 'EMMA',
    label: 'Emma',
    image: '/dms/images/topline/Emma_2.webp',
    finishSummary: 'Noce Brunito/CG · Grigio Legno/TC · and more',
    finishes: [
      { code: 'NB_CG', label: 'Noce Brunito / Cemento Gres' },
      { code: 'GL_TC', label: 'Grigio Legno / Talco' },
      { code: 'NB_TC', label: 'Noce Brunito / Talco' },
      { code: 'GL_CG', label: 'Grigio Legno / Cemento Gres' },
    ],
  },
];

/* ─────────────── Per-range item catalogues ──────────────────────────────── */

/**
 * Returns wardrobe options for a given range + finish variant.
 * Each option: { sku, label, dimensions, weight, doorsCount, sliding }
 */
function getWardrobeOptions(rangeCode, finishCode) {
  switch (rangeCode) {
    case 'NICOLE':
      return [
        { sku: `TLNCAR6B_BL`, label: '6-Door Hinged (L.275)', dimensions: 'L.275 P.57 H.245', weight: 2.6 },
        { sku: `TLNCAR5B_BL`, label: '5-Door Hinged (L.229)', dimensions: 'L.229 P.57 H.245', weight: 2.2 },
        { sku: `TLNCAR4B_BL`, label: '4-Door Hinged (L.184)', dimensions: 'L.184 P.57 H.245', weight: 1.8 },
        { sku: `TLNCAR3B_BL`, label: '3-Door Hinged (L.138)', dimensions: 'L.138 P.57 H.245', weight: 1.5 },
        { sku: `TLNCAR2B_BL`, label: '2-Door Hinged (L.93)',  dimensions: 'L.93 P.57 H.245',  weight: 1.2 },
      ];

    case 'ZOE': {
      const cc = finishCode.startsWith('NB') ? 'NB' : 'GL'; // carcass colour prefix
      return [
        { sku: `TLZOCASSA6A_${cc}`, label: '6-Door Carcass (L.258)', dimensions: 'L.258 P.55 H.240', weight: 2.6 },
        { sku: `TLZOCASSA5A_${cc}`, label: '5-Door Carcass (L.215)', dimensions: 'L.215 P.55 H.240', weight: 2.2 },
        { sku: `TLZOCASSA4A_${cc}`, label: '4-Door Carcass (L.173)', dimensions: 'L.173 P.55 H.240', weight: 1.8 },
        { sku: `TLZOCASSA3A_${cc}`, label: '3-Door Carcass (L.130)', dimensions: 'L.130 P.55 H.240', weight: 1.5 },
        { sku: `TLZOCASSA2A_${cc}`, label: '2-Door Carcass (L.87)',  dimensions: 'L.87 P.55 H.240',  weight: 1.2 },
      ];
    }

    case 'LUISA':
      return [
        { sku: `TLLUCAR6B_${finishCode}`, label: '6-Door Hinged', dimensions: 'L.258 P.55 H.240', weight: 2.6 },
      ];

    case 'GIULIA': {
      const fc = finishCode;
      return [
        { sku: `TLGIAR6B_${fc}`, label: '6-Door Hinged', weight: 2.6 },
        { sku: `TLGIAR5B_${fc}`, label: '5-Door Hinged', weight: 2.2 },
        { sku: `TLGIAR4B_${fc}`, label: '4-Door Hinged', weight: 1.8 },
        { sku: `TLGIAR3B_${fc}`, label: '3-Door Hinged', weight: 1.5 },
        { sku: `TLGIAR2B_${fc}`, label: '2-Door Hinged', weight: 1.2 },
      ];
    }

    case 'ISCHIA': {
      const finLabel = finishCode === 'PBS' ? 'Patina Beige Serigrafata' : 'Patina Beige';
      return [
        { sku: `TLISAR6B_${finishCode}`, label: `6-Door Hinged – ${finLabel}`, weight: 2.6 },
        { sku: `TLISAR4B_${finishCode}`, label: `4-Door Hinged – ${finLabel}`, weight: 1.8 },
        { sku: `TLISAR2B_${finishCode}`, label: `2-Door Hinged – ${finLabel}`, weight: 1.2 },
      ];
    }

    case 'OLYMPIA': {
      const finLabel = finishCode === 'PBS' ? 'Patina Beige Serigrafata' : 'Patina Beige';
      return [
        { sku: `TLOLAR6B_${finishCode}`, label: `6-Door Hinged – ${finLabel}`, weight: 2.6 },
        { sku: `TLOLAR4B_${finishCode}`, label: `4-Door Hinged – ${finLabel}`, weight: 1.8 },
        { sku: `TLOLAR2B_${finishCode}`, label: `2-Door Hinged – ${finLabel}`, weight: 1.2 },
      ];
    }

    case 'VANESSA':
      return [
        { sku: 'TLVAAR2S_RG_BN', label: '2-Door Sliding (Rovere Grigio / Bianco Neve)', weight: 3.5 },
      ];

    case 'TIFFANY':
      return [
        { sku: 'TLTFAR3S_BN_BSG', label: '3-Door Sliding (Bianco Neve Serigrafata Glitter)', weight: 4.5 },
      ];

    case 'EMMA': {
      const fc = finishCode;
      return [
        { sku: `TLEMAR2S_${fc}`, label: `2-Door Sliding – ${fc.replace('_', ' / ')}`, weight: 3.5 },
      ];
    }

    default: return [];
  }
}

/**
 * Returns bed options for a given range + finish variant.
 */
function getBedOptions(rangeCode, finishCode) {
  switch (rangeCode) {
    case 'NICOLE':
      return [
        { sku: 'TLNCLC16_RN', label: 'Storage Bed 160 – Rovere Natura', weight: 1.2, available: finishCode === 'RN_BL' },
        { sku: 'TLNCLC16_NG', label: 'Storage Bed 160 – Noce Ghiaccio', weight: 1.2, available: finishCode === 'NG_BL' },
        { sku: 'TLNCLB16_RN', label: 'Box Bed 160 – Rovere Natura', weight: 0.9, available: finishCode === 'RN_BL' },
        { sku: 'TLNCLB16_NG', label: 'Box Bed 160 – Noce Ghiaccio', weight: 0.9, available: finishCode === 'NG_BL' },
      ].filter(b => b.available);

    case 'ZOE':
    case 'EMMA': {
      const fc = (rangeCode === 'ZOE' || rangeCode === 'EMMA')
        ? (finishCode.startsWith('NB') ? 'NB' : 'GL')
        : finishCode;
      return [
        { sku: `TLZELC16_${fc}`, label: `Storage Bed 160 – ${finishCode}`, weight: 1.2 },
        { sku: `TLZELB16_${fc}`, label: `Box Bed 160 – ${finishCode}`, weight: 0.9 },
        { sku: 'TLZELI16P_CO', label: 'Parigi Upholstered Storage Bed – Tessuto Corda', weight: 1.2 },
        { sku: 'TLZELI16P_GR', label: 'Parigi Upholstered Storage Bed – Tessuto Grigio', weight: 1.2 },
        { sku: 'TLZELB16P_CO', label: 'Parigi Upholstered Box Bed – Tessuto Corda', weight: 0.9 },
        { sku: 'TLZELB16P_GR', label: 'Parigi Upholstered Box Bed – Tessuto Grigio', weight: 0.9 },
        { sku: 'TLZELI16N_CO', label: 'Nizza Upholstered Storage Bed – Tessuto Corda', weight: 1.2 },
        { sku: 'TLZELI16N_GR', label: 'Nizza Upholstered Storage Bed – Tessuto Grigio', weight: 1.2 },
        { sku: 'TLZELB16N_CO', label: 'Nizza Upholstered Box Bed – Tessuto Corda', weight: 0.9 },
        { sku: 'TLZELB16N_GR', label: 'Nizza Upholstered Box Bed – Tessuto Grigio', weight: 0.9 },
      ];
    }

    case 'LUISA':
      return [
        { sku: `TLLULC16_${finishCode}`, label: `Storage Bed 160 – ${finishCode}`, weight: 1.2 },
        { sku: `TLLULG16_${finishCode}`, label: `Bed Frame 160 – ${finishCode}`, weight: 0.8 },
        { sku: `TLLULG09_${finishCode}`, label: `Single Bed Frame 90 – ${finishCode}`, weight: 0.5 },
        { sku: `TLLULG09R_${finishCode}`, label: `Single Bed 90 with Slatted Base – ${finishCode}`, weight: 0.5 },
      ];

    case 'GIULIA':
      return [
        { sku: `TLGILC16_${finishCode}`, label: `Storage Bed 160 – ${finishCode}`, weight: 1.2 },
        { sku: `TLGILG16_${finishCode}`, label: `Bed Frame 160 – ${finishCode}`, weight: 0.8 },
      ];

    case 'ISCHIA':
      return [
        { sku: 'TLISLG16_BP', label: 'Bed Frame 160 – Patina Beige', weight: 0.8 },
      ];

    case 'OLYMPIA':
      return [
        { sku: 'TLOLLG16_BP', label: 'Bed Frame 160 – Patina Beige', weight: 0.8 },
      ];

    case 'VANESSA':
      return [
        { sku: 'TLVALC16_RG_BN', label: 'Storage Bed 160 – Rovere Grigio / Bianco Neve', weight: 1.2 },
        { sku: 'TLVALB16_RG_BN', label: 'Box Bed 160 – Rovere Grigio / Bianco Neve', weight: 0.9 },
      ];

    case 'TIFFANY':
      return [
        { sku: 'TLTFLC16_BN_BSG', label: 'Storage Bed 160 – Bianco Neve Serigrafata Glitter', weight: 1.2 },
        { sku: 'TLTFLB16_BN_BSG', label: 'Box Bed 160 – Bianco Neve Serigrafata Glitter', weight: 0.9 },
      ];

    default: return [];
  }
}

/** Returns bedroom furniture options (comodini, comò, specchiera) for a range/finish. */
function getFurnitureOptions(rangeCode, finishCode) {
  const funcs = {
    NICOLE: [
      { sku: 'TLNCCM_RN_BL', label: 'Bedside Table – Rovere Natura / BL', weight: 0.3, available: finishCode === 'RN_BL' },
      { sku: 'TLNCCM_NG_BL', label: 'Bedside Table – Noce Ghiaccio / BL', weight: 0.3, available: finishCode === 'NG_BL' },
      { sku: 'TLNCCO_RN_BL', label: 'Chest of Drawers – Rovere Natura / BL', weight: 0.6, available: finishCode === 'RN_BL' },
      { sku: 'TLNCCO_NG_BL', label: 'Chest of Drawers – Noce Ghiaccio / BL', weight: 0.6, available: finishCode === 'NG_BL' },
      { sku: 'TLNCSP_CR',    label: 'Mirror – Bordo Cromato',                weight: 0.15, available: true },
    ].filter(f => f.available),

    ZOE: [
      ...['NB_TC','NB_CG','NB_GL','GL_TC','GL_CG','GL_NB']
        .filter(fc => finishCode.startsWith('NB') ? fc.startsWith('NB') : fc.startsWith('GL'))
        .map(fc => ({ sku: `TLZECM_${fc}`, label: `Bedside Table – ${fc.replace('_', ' / ')}`, weight: 0.3 })),
      ...['NB_TC','NB_CG','NB_GL','GL_TC','GL_CG','GL_NB']
        .filter(fc => finishCode.startsWith('NB') ? fc.startsWith('NB') : fc.startsWith('GL'))
        .map(fc => ({ sku: `TLZECO_${fc}`, label: `Chest of Drawers – ${fc.replace('_', ' / ')}`, weight: 0.6 })),
      { sku: 'TLZESP_CR', label: 'Mirror – Bordo Cromato', weight: 0.15 },
    ],

    LUISA: [
      { sku: `TLLUCM_${finishCode}`, label: `Bedside Table – ${finishCode}`, weight: 0.3 },
      { sku: `TLLUCO_${finishCode}`, label: `Chest of Drawers – ${finishCode}`, weight: 0.6 },
      { sku: `TLLUCO_KIT_${finishCode}`, label: `Chest of Drawers Kit – ${finishCode}`, weight: 0.6 },
      { sku: 'TLLUSP_CR', label: 'Mirror – Bordo Cromato', weight: 0.15 },
    ],

    GIULIA: [
      { sku: `TLGICM_${finishCode}`, label: `Bedside Table – ${finishCode}`, weight: 0.3 },
      { sku: `TLGICO_${finishCode}`, label: `Chest of Drawers – ${finishCode}`, weight: 0.6 },
      { sku: 'TLGISP_CR', label: 'Mirror – Bordo Cromato', weight: 0.15 },
    ],

    ISCHIA: [
      { sku: 'TLISCM_BP', label: 'Bedside Table – Patina Beige', weight: 0.3 },
      { sku: 'TLISCO_BP', label: 'Chest of Drawers – Patina Beige', weight: 0.6 },
      { sku: 'TLISSP_BP', label: 'Mirror – Patina Beige', weight: 0.15 },
    ],

    OLYMPIA: [
      { sku: 'TLOLCM_BP', label: 'Bedside Table – Patina Beige', weight: 0.3 },
      { sku: 'TLOLCO_BP', label: 'Chest of Drawers – Patina Beige', weight: 0.6 },
      { sku: 'TLOLSP_BP', label: 'Mirror – Patina Beige', weight: 0.15 },
    ],

    VANESSA: [
      { sku: 'TLVACM_RG_BN', label: 'Bedside Table – Rovere Grigio / Bianco Neve', weight: 0.3 },
      { sku: 'TLVACO_RG_BN', label: 'Chest of Drawers – Rovere Grigio / Bianco Neve', weight: 0.6 },
      { sku: 'TLVASP_RG_BN', label: 'Mirror – Rovere Grigio / Bianco Neve', weight: 0.15 },
    ],

    TIFFANY: [
      { sku: 'TLTFCM_BN_BSG', label: 'Bedside Table – Bianco Neve Serigrafata Glitter', weight: 0.3 },
      { sku: 'TLTFCO_BN_BSG', label: 'Chest of Drawers – Bianco Neve Serigrafata Glitter', weight: 0.6 },
      { sku: 'TLTFSP_BN_BSG', label: 'Mirror – Bianco Neve Serigrafata Glitter', weight: 0.15 },
    ],

    EMMA: [
      // Emma shares Zoe furniture — use NB or GL base
      ...['NB_TC','NB_CG','NB_GL','GL_TC','GL_CG','GL_NB']
        .filter(fc => finishCode.startsWith('NB') ? fc.startsWith('NB') : fc.startsWith('GL'))
        .map(fc => ({ sku: `TLZECM_${fc}`, label: `Bedside Table – ${fc.replace('_', ' / ')}`, weight: 0.3 })),
      ...['NB_TC','NB_CG','NB_GL','GL_TC','GL_CG','GL_NB']
        .filter(fc => finishCode.startsWith('NB') ? fc.startsWith('NB') : fc.startsWith('GL'))
        .map(fc => ({ sku: `TLZECO_${fc}`, label: `Chest of Drawers – ${fc.replace('_', ' / ')}`, weight: 0.6 })),
      { sku: 'TLZESP_CR', label: 'Mirror – Bordo Cromato', weight: 0.15 },
    ],
  };
  return funcs[rangeCode] || [];
}

/** Returns wardrobe extras and optional accessories grouped by category for the given range/finish. */
/**
 * Returns wardrobe extras sections for a given range/finish/wardrobe/bed selection.
 *
 * Availability matrix is driven by Section 5 of the product specification.
 *
 * @param {string}      rangeCode        - e.g. 'ZOE', 'NICOLE'
 * @param {string}      finishCode       - e.g. 'NB_TC'
 * @param {Array}       selectedWardrobes - Selected wardrobes array (for door-count in handles)
 * @param {string|null} selectedBed      - SKU of selected bed (wood-bed gate for cushions/fascia)
 * @param {string}      mode             - 'FULLSET' | 'INDIVIDUAL'
 *
 * Returns: Array of section objects:
 *   { key, title, note, items, single_select? }
 * Each item: { sku, label, weight, recommended?, qty?, qty_locked? }
 */
function getExtrasOptions(rangeCode, finishCode, selectedWardrobes, selectedBed, mode) {
  const isNicole  = rangeCode === 'NICOLE';
  const isZoe     = rangeCode === 'ZOE';
  const isLuisa   = rangeCode === 'LUISA';
  const isGiulia  = rangeCode === 'GIULIA';
  const isIschia  = rangeCode === 'ISCHIA';
  const isOlympia = rangeCode === 'OLYMPIA';
  const isVanessa = rangeCode === 'VANESSA';
  const isTiffany = rangeCode === 'TIFFANY';
  const isEmma    = rangeCode === 'EMMA';
  const isZoeOrEmma = isZoe || isEmma;

  // Wood-bed gate: imbottito SKUs contain '16P_' (Parigi) or '16N_' (Nizza)
  // In FULLSET mode Zoe/Emma composition always includes a wood bed → show extras
  const isWoodBed = isZoeOrEmma && (
    mode === 'FULLSET' ||
    (selectedBed && !selectedBed.includes('16P_') && !selectedBed.includes('16N_')
                  && !selectedBed.endsWith('_CO') && !selectedBed.endsWith('_GR'))
  );

  // Zoe wardrobe door count (for door panels + handle auto-multiply in individual mode):
  //   TLZOCASSA6A_NB → 6, etc. Sum across all selected wardrobes × qty.
  const doorCount = (isZoe && mode === 'INDIVIDUAL' && selectedWardrobes?.length > 0)
    ? selectedWardrobes.reduce((sum, w) => {
        const dc = parseInt(w.sku.match(/CASSA(\d)A/)?.[1]) || 0;
        return sum + dc * (w.qty || 1);
      }, 0)
    : 0;
  // Doors sold as pairs (ANTA2) plus a single (ANTA1) for odd remainders.
  // Supplier rule: 1 handle per door unit (single or pair).
  const pairCount   = Math.floor(doorCount / 2);
  const singleCount = doorCount % 2;
  const handleCount = pairCount + singleCount;

  // Frontale finish (second part of Zoe/Emma finish code, e.g. 'NB_TC' → 'TC')
  const frontalCode = isZoeOrEmma ? (finishCode?.split('_')[1] || null) : null;
  const FINISH_LABELS = { TC: 'Talco', CG: 'Cemento Gres', NB: 'Noce Brunito', GL: 'Grigio Legno' };

  const sections = [];

  // ── 1. INTERNAL DRAWER UNITS ─────────────────────────────────────────────
  const drawerItems = [];
  if (isZoe || isGiulia || isIschia || isOlympia || isEmma || isVanessa)
    drawerItems.push({ sku: 'TLOPTARCA0BS',    label: 'Internal Drawer Unit – 2-Drawer Fabric (L.82 P.45 H.46)', weight: 0.1 });
  if (isLuisa)
    drawerItems.push({ sku: 'TLOPTARCA01BL',   label: 'Internal Drawer Unit – 2-Drawer Luisa (L.77 P.41.5 H.46)', weight: 0.1 });
  if (isNicole || isTiffany)
    drawerItems.push({ sku: 'TLOPTOARCANCTBS', label: 'Internal Drawer Unit – 3-Drawer Fabric (L.89 P.45 H.67)', weight: 0.1 });
  if (drawerItems.length)
    sections.push({ key: 'drawers', title: 'Internal Wardrobe Drawer Units', note: 'Fitted inside the wardrobe carcass', items: drawerItems });

  // ── 2. INTERNAL WARDROBE MIRRORS ─────────────────────────────────────────
  const mirrorItems = [];
  if (isNicole) {
    mirrorItems.push({ sku: 'TLOPTOPARNCSP01B', label: 'Internal Mirror ×1 – Nicole 6A (L.45 H.243)', weight: 0.1 });
    mirrorItems.push({ sku: 'TLOPTOPARNCSP02B', label: 'Internal Mirrors ×2 – Nicole 6A (L.45 H.243)', weight: 0.1 });
  }
  if (isGiulia) {
    mirrorItems.push({ sku: 'TLOPTOPARGSP01B', label: 'Internal Mirror ×1 – Giulia 6A (L.42 H.234)', weight: 0.1 });
    mirrorItems.push({ sku: 'TLOPTOPARGSP02B', label: 'Internal Mirrors ×2 – Giulia 6A (L.42 H.234)', weight: 0.1 });
  }
  if (isLuisa)
    mirrorItems.push({ sku: 'TLOPTOPARLSP02B', label: 'Internal Mirrors ×2 – Luisa 6A (L.39 H.234)', weight: 0.1 });
  if (mirrorItems.length)
    sections.push({ key: 'int_mirrors', title: 'Internal Wardrobe Mirrors', note: 'Fits inside hinged wardrobe door panel (6A wardrobe only)', items: mirrorItems });

  // ── 3. ADDITIONAL WARDROBE SHELVES ───────────────────────────────────────
  const shelfItems = [];
  if (isLuisa)
    shelfItems.push({ sku: 'TLOPTOPARRI06BL', label: 'Shelf Set of 3 – Luisa 6A (L.77.6 P.46.5)', weight: 0.1 });
  if (isZoe || isGiulia || isIschia || isOlympia || isEmma)
    shelfItems.push({ sku: 'TLOPTOPARRI06B',  label: 'Shelf Set of 3 – 6A/4A/2A battente (L.83.4 P.48.8)', weight: 0.1 });
  if (isVanessa)
    shelfItems.push({ sku: 'TLOPTOPARRI02SV', label: 'Shelf Set of 2 – Vanessa sliding (L.124.7 P.49.3)', weight: 0.1 });
  if (isEmma)
    shelfItems.push({ sku: 'TLOPTOPARRI02SE', label: 'Shelf Set of 2 – Emma sliding (L.124.7 P.49.3)', weight: 0.1 });
  if (isNicole || isTiffany)
    shelfItems.push({ sku: 'TLOPTOPARRI03BS', label: 'Shelf – Single, Nicole/Tiffany (L.89 P.50)', weight: 0.1 });
  if (isNicole)
    shelfItems.push({ sku: 'TLOPTOPARRI01BNC',  label: 'Shelf – Single 1A, Nicole (L.43.6 P.50)', weight: 0.1 });
  if (isZoe || isGiulia)
    shelfItems.push({ sku: 'TLOPTOPARRI01BZGG', label: 'Shelf – Single 1A, Zoe/Giulia (L.40.8 P.48.8)', weight: 0.1 });
  if (shelfItems.length)
    sections.push({ key: 'shelves', title: 'Additional Wardrobe Shelves', note: 'Internal shelf additions', items: shelfItems });

  // ── 4. ZOE STANDARD DOOR PANELS (carcass only) ───────────────────────────
  //    Zoe wardrobes ship as carcass-only. Colour-matched door panels are
  //    required and auto-calculated: pairs where possible, single for remainder.
  if (isZoe && mode === 'INDIVIDUAL' && doorCount > 0 && frontalCode) {
    const finLabel = FINISH_LABELS[frontalCode] || frontalCode;
    const doorItems = [];
    if (pairCount > 0)
      doorItems.push({
        sku: `TLZOANTA2_${frontalCode}`,
        label: `Zoe Door Pair – ${finLabel} (${pairCount}× pair)`,
        weight: 0.15, qty: pairCount, qty_locked: true, recommended: true,
      });
    if (singleCount > 0)
      doorItems.push({
        sku: `TLZOANTA1_${frontalCode}`,
        label: `Zoe Door Single – ${finLabel} (${singleCount}× single)`,
        weight: 0.08, qty: singleCount, qty_locked: true, recommended: true,
      });
    sections.push({
      key: 'door_panels',
      title: `Wardrobe Door Panels (${doorCount} doors)`,
      note: `Carcass wardrobe – ${pairCount} pair${pairCount !== 1 ? 's' : ''}${singleCount ? ` + ${singleCount} single` : ''} required. Pre-selected; deselect only if sourcing doors separately.`,
      items: doorItems,
    });
  }

  // ── 5. EXTERNAL MIRROR DOOR UPGRADE (Zoe carcass only) ───────────────────
  //    Optional mirror door to replace or supplement colour door panels.
  if (isZoe)
    sections.push({
      key: 'ext_mirror_doors', title: 'External Mirror Door Upgrade',
      note: 'Replaces colour door panel(s) with mirror glass – adjust quantities as needed',
      items: [
        { sku: 'TLZOANTA1_SP', label: 'Zoe Mirror Door – Single (1 pz)', weight: 0.1 },
        { sku: 'TLZOANTA2_SP', label: 'Zoe Mirror Door Pair (2 pz)',     weight: 0.2 },
      ],
    });

  // ── 5. SLIDING WARDROBE INTERNAL KIT ─────────────────────────────────────
  if (isVanessa || isEmma)
    sections.push({
      key: 'sliding_kit', title: 'Sliding Wardrobe Internal Kit',
      note: '2 ripiani + tramezzo – L.42 P.49.2 H.112.5',
      items: [{ sku: 'TLOPTOPARKITO2ST', label: 'Sliding Wardrobe Kit (2 shelves + divider)', weight: 0.1 }],
    });

  // ── 6. WARDROBE VALET STAND ───────────────────────────────────────────────
  if (isNicole || isZoe || isLuisa || isGiulia || isIschia || isOlympia)
    sections.push({
      key: 'valet', title: 'Wardrobe Valet Stand',
      note: 'Pull-out trouser/suit hanger – mounts inside wardrobe',
      items: [{ sku: 'TLOPTSERB', label: 'Wardrobe Valet Stand (Servetto)', weight: 0.1 }],
    });

  // ── 7. BED EXTRAS (Zoe/Emma letto legno only) ─────────────────────────────
  if (isWoodBed)
    sections.push({
      key: 'bed_extras', title: 'Bed Extras',
      note: mode === 'FULLSET'
        ? 'Applicable to the wood-frame bed in the composition'
        : 'Applies to the selected wood-frame (letto legno) bed only',
      items: [
        { sku: 'TLOPTLCCG02',  label: 'Headboard Cushion Pair – Nabuk Grey (L.90 P.10 H.50)',  weight: 0.1 },
        { sku: 'TLOPTLCCB02',  label: 'Headboard Cushion Pair – Nabuk Beige (L.90 P.10 H.50)', weight: 0.1 },
        { sku: 'TLOPTFASCTC01', label: 'Headboard Strip – Talco (L.100 P.1.2 H.12)',           weight: 0.1 },
        { sku: 'TLOPTFASCCG01', label: 'Headboard Strip – Cemento Gres (L.100 P.1.2 H.12)',    weight: 0.1 },
      ],
    });

  // ── 8. COMODINO TOP PANEL (Zoe/Emma) ─────────────────────────────────────
  if (isZoeOrEmma)
    sections.push({
      key: 'top_cmd', title: 'Bedside Table Top Panel',
      note: frontalCode
        ? `Recommended: ${FINISH_LABELS[frontalCode]} (matches frontale finish). Deselect if not needed.`
        : 'Optional top panel for bedside table.',
      items: Object.entries(FINISH_LABELS).map(([fc, lbl]) => ({
        sku: `TLOPTOPCMD${fc}`, label: `Bedside Table Top – ${lbl} (L.53 P.39 H.1.2)`,
        weight: 0.1, recommended: fc === frontalCode,
      })),
    });

  // ── 9. COMÒ TOP PANEL (Zoe/Emma) ─────────────────────────────────────────
  if (isZoeOrEmma)
    sections.push({
      key: 'top_com', title: 'Chest of Drawers Top Panel',
      note: frontalCode
        ? `Recommended: ${FINISH_LABELS[frontalCode]} (matches frontale finish). Deselect if not needed.`
        : 'Optional top panel for chest of drawers.',
      items: Object.entries(FINISH_LABELS).map(([fc, lbl]) => ({
        sku: `TLOPTOPCOM${fc}`, label: `Chest of Drawers Top – ${lbl} (L.117 P.46 H.1.2)`,
        weight: 0.1, recommended: fc === frontalCode,
      })),
    });

  // ── 10. COMODINO HANDLE UPGRADE (Zoe/Emma) ───────────────────────────────
  if (isZoeOrEmma)
    sections.push({
      key: 'handle_cmd', title: 'Comodino Handle',
      note: '1 handle per bedside table · price per unit · select one style',
      single_select: true,
      items: [
        { sku: 'TLOPTCMDMDFSG', label: 'MDF Narrow Grey', weight: 0.0 },
        { sku: 'TLOPTCMDMDFLN', label: 'MDF Wide Noce Brunito', weight: 0.0 },
        { sku: 'TLOPTCMDMDFLG', label: 'MDF Wide Grey', weight: 0.0 },
        { sku: 'TLOPTCMDMETG',  label: 'Metal Grey', weight: 0.0 },
      ],
    });

  // ── 11. COMÒ HANDLE UPGRADE (Zoe/Emma) ───────────────────────────────────
  if (isZoeOrEmma)
    sections.push({
      key: 'handle_com', title: 'Chest of Drawers Handle',
      note: '2 handles per chest of drawers – price shown as pack of 2 · select one style',
      single_select: true,
      items: [
        { sku: 'TLOPTCOMOMDFSG', label: 'MDF Narrow Grey (pack of 2)', weight: 0.0 },
        { sku: 'TLOPTCOMOMDFLN', label: 'MDF Wide Noce Brunito (pack of 2)', weight: 0.0 },
        { sku: 'TLOPTCOMOMDFLG', label: 'MDF Wide Grey (pack of 2)', weight: 0.0 },
        { sku: 'TLOPTCOMOMETG',  label: 'Metal Grey (pack of 2)', weight: 0.0 },
      ],
    });

  // ── 13. ZOE WARDROBE DOOR HANDLES ─────────────────────────────────────────
  //    1 handle per door unit (single or pair) — supplier rule.
  //    handleCount = pairs + singles (not total door panels).
  if (isZoe && mode === 'INDIVIDUAL' && doorCount > 0)
    sections.push({
      key: 'handle_arm',
      title: `Wardrobe Door Handles (${handleCount} unit${handleCount !== 1 ? 's' : ''})`,
      note: `${pairCount} pair${pairCount !== 1 ? 's' : ''}${singleCount ? ` + ${singleCount} single` : ''} = ${handleCount} handle${handleCount !== 1 ? 's' : ''}. Select one style.`,
      single_select: true,
      items: [
        { sku: 'TLZOMAN_MDFSG', label: `MDF Narrow Grey (${handleCount}×)`, weight: 0.0, qty: handleCount, qty_locked: true },
        { sku: 'TLZOMAN_MDFLG', label: `MDF Wide Grey (${handleCount}×)`,   weight: 0.0, qty: handleCount, qty_locked: true },
        { sku: 'TLZOMAN_MDFLN', label: `MDF Wide Noce Brunito (${handleCount}×)`, weight: 0.0, qty: handleCount, qty_locked: true },
        { sku: 'TLZOMAN_METG',  label: `Metal Grey (${handleCount}×)`,      weight: 0.0, qty: handleCount, qty_locked: true },
      ],
    });

  return sections;
}

/** Returns the composition bundle item code for a range + finish, or null if none. */
function getCompositionBundle(rangeCode, finishCode) {
  const map = {
    NICOLE:  { RN_BL: 'TLNCCOMP_RN_BL', NG_BL: 'TLNCCOMP_NG_BL' },
    ZOE:     { NB_TC: 'TLZOCOMP_NB_TC', NB_GL: 'TLZOCOMP_NB_GL', GL_CG: 'TLZOCOMP_GL_CG', GL_NB: 'TLZOCOMP_GL_NB' },
    LUISA:   { GC: 'TLLUCOMP26B_GC', BG: 'TLLUCOMP26B_BG', OL: 'TLLUCOMP26B_OL' },
    GIULIA:  { BG: 'TLGICOMP26B_BG', OL: 'TLGICOMP26B_OL' },
    ISCHIA:  { BP: 'TLISCOMP36B_BP' },
    OLYMPIA: { PBS: 'TLOCOMP36B_PBS' },
    VANESSA: { RG_BN: 'TLVACOMP22S_RG_BN' },
    TIFFANY: { BN_BSG: 'TLTFCOMP23S_BN_BSG' },
    EMMA:    { NB_CG: 'TLEMCOMP22S_NB_CG', GL_TC: 'TLEMCOMP22S_GL_TC' },
  };
  return map[rangeCode]?.[finishCode] || null;
}

/* ─────────────── Main export ─────────────────────────────────────────────── */
export function ToplineBedroomsConfigurator({ onBuilt, onBack }) {
  const TOTAL_STEPS = 8;

  /* ── navigation ── */
  const [step, setStep] = useState(1);

  /* ── selections ── */
  const [selectedRange,   setSelectedRange]   = useState(null); // RANGES entry
  const [selectedFinish,  setSelectedFinish]  = useState(null); // finish code string

  /* ── full-set vs individual mode ── */
  const [mode, setMode] = useState(null); // 'FULLSET' | 'INDIVIDUAL'

  /* ── individual selections ── */
  const [selectedWardrobes, setSelectedWardrobes] = useState([]); // array of { sku, label, weight, qty }
  const [selectedBed,       setSelectedBed]       = useState(null); // sku string or null
  const [selectedFurniture, setSelectedFurniture] = useState([]); // array of { sku, label, weight, qty }
  const [selectedExtras,    setSelectedExtras]    = useState([]); // array of { sku, label, weight, qty }

  /* ── gozo delivery ── */
  const [gozoDelivery, setGozoDelivery] = useState(false);

  /* ── pricing ── */
  const [pricing,    setPricing]    = useState(null);
  const [pricingErr, setPricingErr] = useState(null);
  const [pricingLoad,setPricingLoad]= useState(false);

  const rangeDef  = useMemo(() => RANGES.find(r => r.code === selectedRange?.code), [selectedRange]);

  /* ── derived catalogue for selected range+finish ── */
  const wardrobeOptions = useMemo(
    () => selectedRange && selectedFinish ? getWardrobeOptions(selectedRange.code, selectedFinish) : [],
    [selectedRange, selectedFinish],
  );
  const bedOptions = useMemo(
    () => selectedRange && selectedFinish ? getBedOptions(selectedRange.code, selectedFinish) : [],
    [selectedRange, selectedFinish],
  );
  const furnitureOptions = useMemo(
    () => selectedRange && selectedFinish ? getFurnitureOptions(selectedRange.code, selectedFinish) : [],
    [selectedRange, selectedFinish],
  );
  const compositionSku = useMemo(
    () => selectedRange && selectedFinish ? getCompositionBundle(selectedRange.code, selectedFinish) : null,
    [selectedRange, selectedFinish],
  );
  const extrasOptions = useMemo(
    () => selectedRange && selectedFinish
      ? getExtrasOptions(selectedRange.code, selectedFinish, selectedWardrobes, selectedBed, mode)
      : [],
    [selectedRange, selectedFinish, selectedWardrobes, selectedBed, mode],
  );

  /* ── BOM assembly ── */
  function buildBom() {
    if (mode === 'FULLSET' && compositionSku) {
      // Use composition bundle as a single wardrobe line
      const compWeight = 5.15; // default; pricing API will use actual item weight
      return {
        configurator_type: 'Topline Bedrooms',
        gozo_delivery: gozoDelivery,
        wardrobes: [{ sku: compositionSku, role: 'COMPOSITION', qty: 1, weight: compWeight, name: `${selectedRange.label} Full Bedroom Set – ${selectedFinish}` }],
        furniture: selectedExtras.map(e => ({ sku: e.sku, role: 'EXTRA', qty: e.qty, weight: e.weight, name: e.label })),
      };
    }

    // FULLSET without a composition SKU, or INDIVIDUAL — use individually selected pieces
    const wardrobes = selectedWardrobes.map(w => ({
      sku: w.sku, role: 'WARDROBE', qty: w.qty, weight: w.weight, name: w.label,
    }));

    const furniture = [];
    // Add bed
    if (selectedBed) {
      const bOpt = bedOptions.find(o => o.sku === selectedBed);
      if (bOpt) furniture.push({ sku: bOpt.sku, role: 'FURNITURE_BED', qty: 1, weight: bOpt.weight, name: bOpt.label });
    }
    // Add furniture selections
    for (const sel of selectedFurniture) {
      furniture.push({ sku: sel.sku, role: 'FURNITURE', qty: sel.qty, weight: sel.weight, name: sel.label });
    }

    const extras = selectedExtras.map(e => ({ sku: e.sku, role: 'EXTRA', qty: e.qty, weight: e.weight, name: e.label }));
    return {
      configurator_type: 'Topline Bedrooms',
      gozo_delivery: gozoDelivery,
      wardrobes,
      furniture: [...furniture, ...extras],
    };
  }

  /* ── compute total weight for display ── */
  const totalWeight = useMemo(() => {
    if (!selectedRange || !selectedFinish) return 0;
    let w = 0;
    if (mode === 'FULLSET' && compositionSku) {
      w = 5.15;
    } else {
      for (const sw of selectedWardrobes) w += sw.weight * sw.qty;
      if (selectedBed) {
        const bOpt = bedOptions.find(o => o.sku === selectedBed);
        if (bOpt) w += bOpt.weight;
      }
      for (const sel of selectedFurniture) w += sel.weight * sel.qty;
    }
    for (const ext of selectedExtras) w += ext.weight * ext.qty;
    return Math.round(w * 1000) / 1000;
  }, [mode, selectedWardrobes, selectedBed, selectedFurniture, selectedExtras, compositionSku, wardrobeOptions, bedOptions, selectedRange, selectedFinish]);

  /* ── check if customer is buying individual pieces without a wardrobe ── */
  const isIndividualPiecesOnly = mode === 'INDIVIDUAL' && selectedWardrobes.length === 0;

  /* ── pricing API ── */
  const fetchPricing = useCallback(async (bom) => {
    setPricingLoad(true); setPricingErr(null); setPricing(null);
    try {
      const result = await frappe.call(
        'casamoderna_dms.configurator_pricing_api.resolve_topline_bom_price',
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

  /* ── add to document ── */
  async function handleAddToDocument() {
    const bom = buildBom();
    let pr = pricing;
    if (!pr) pr = await fetchPricing(bom);
    if (!pr) return;

    const rangeName = selectedRange?.label || '';
    const finishedLabel = selectedFinish?.replace(/_/g, ' / ') || '';
    const title = `Topline Bedrooms – ${rangeName} – ${finishedLabel}`;
    const bodyParts = [];
    if (mode === 'FULLSET') bodyParts.push('Full Bedroom Set (Composition Bundle)');
    for (const w of selectedWardrobes) {
      bodyParts.push(`Wardrobe: ${w.qty > 1 ? `${w.qty}× ` : ''}${w.label}`);
    }
    if (selectedBed) {
      const bOpt = bedOptions.find(o => o.sku === selectedBed);
      if (bOpt) bodyParts.push(`Bed: ${bOpt.label}`);
    }
    for (const sel of selectedFurniture) bodyParts.push(`${sel.qty > 1 ? `${sel.qty}× ` : ''}${sel.label}`);
    for (const ext of selectedExtras) bodyParts.push(`${ext.qty > 1 ? `${ext.qty}× ` : ''}${ext.label}`);

    onBuilt?.({
      ...bom,
      description: title.slice(0, 139),
      descriptionBody: bodyParts.join(', '),
      itemCode: 'CM-WARDROBE',
      uom: 'Unit',
      pricing: {
        offerInclVat:   pr.offer_price_inc_vat,
        rrpInclVat:     pr.rrp_inc_vat,
        costPrice:      pr.cost_price,
        vatRate:        pr.vat_rate,
        maxDiscountPct: pr.max_discount_pct,
        calculator:     pr.calculator,
        bomLines:       pr.bom_lines || [],
        offerExVat:     Math.round((pr.offer_price_inc_vat / (1 + pr.vat_rate / 100)) * 100) / 100,
        rrpExVat:       Math.round((pr.rrp_inc_vat / (1 + pr.vat_rate / 100)) * 100) / 100,
      },
    });
  }

  /* ─────────── wardrobe toggle helpers ─────────── */
  function toggleWardrobe(opt) {
    setSelectedWardrobes(prev => {
      const existing = prev.find(w => w.sku === opt.sku);
      if (existing) return prev.filter(w => w.sku !== opt.sku);
      return [...prev, { sku: opt.sku, label: opt.label, weight: opt.weight, qty: 1 }];
    });
  }

  function isWardrobeSelected(sku) {
    return selectedWardrobes.some(w => w.sku === sku);
  }

  /* ─────────── furniture toggle helper ─────────── */
  function toggleFurniture(opt, qty = 1) {
    setSelectedFurniture(prev => {
      const existing = prev.find(f => f.sku === opt.sku);
      if (existing) return prev.filter(f => f.sku !== opt.sku);
      return [...prev, { sku: opt.sku, label: opt.label, weight: opt.weight, qty }];
    });
  }

  function isFurnitureSelected(sku) {
    return selectedFurniture.some(f => f.sku === sku);
  }

  /* ───────────────── extras toggle helpers ───────────────── */
  function toggleExtra(opt, section) {
    setSelectedExtras(prev => {
      const existing = prev.find(e => e.sku === opt.sku);
      if (existing) return prev.filter(e => e.sku !== opt.sku);
      // For single_select sections, remove all other items from the same section first
      const filtered = section?.single_select
        ? prev.filter(e => !section.items.find(i => i.sku === e.sku))
        : prev;
      const qty = opt.qty_locked ? (opt.qty || 1) : 1;
      return [...filtered, { sku: opt.sku, label: opt.label, weight: opt.weight, qty }];
    });
  }

  /* Pre-select tops matching the frontale finish for Zoe/Emma when entering step 7.
   * Also pre-selects Zoe standard door panels (individual mode) with correct qty. */
  function initExtrasPreselect() {
    if (!['ZOE', 'EMMA'].includes(selectedRange?.code)) return;
    const frontalCode = selectedFinish?.split('_')[1];
    if (!frontalCode) return;
    const FINISH_LABELS = { TC: 'Talco', CG: 'Cemento Gres', NB: 'Noce Brunito', GL: 'Grigio Legno' };
    const lbl = FINISH_LABELS[frontalCode] || frontalCode;
    setSelectedExtras(prev => {
      // Always clear stale Zoe door-panel entries so qty refreshes if wardrobe changed
      const base = prev.filter(e => !/^TLZOANTA[12]_(?!SP)/.test(e.sku));
      const toAdd = [];
      const cmdSku = `TLOPTOPCMD${frontalCode}`;
      const comSku = `TLOPTOPCOM${frontalCode}`;
      if (!base.find(e => e.sku === cmdSku))
        toAdd.push({ sku: cmdSku, label: `Bedside Table Top – ${lbl}`, weight: 0.1, qty: 1 });
      if (!base.find(e => e.sku === comSku))
        toAdd.push({ sku: comSku, label: `Chest of Drawers Top – ${lbl}`, weight: 0.1, qty: 1 });
      // Pre-select Zoe standard door panels (individual mode with carcass wardrobes)
      if (selectedRange?.code === 'ZOE' && mode === 'INDIVIDUAL' && selectedWardrobes.length > 0) {
        const totalDoors = selectedWardrobes.reduce((sum, w) => {
          const dc = parseInt(w.sku.match(/CASSA(\d)A/)?.[1]) || 0;
          return sum + dc * (w.qty || 1);
        }, 0);
        const pc = Math.floor(totalDoors / 2);
        const sc = totalDoors % 2;
        if (pc > 0)
          toAdd.push({ sku: `TLZOANTA2_${frontalCode}`, label: `Zoe Door Pair – ${lbl}`, weight: 0.15, qty: pc });
        if (sc > 0)
          toAdd.push({ sku: `TLZOANTA1_${frontalCode}`, label: `Zoe Door Single – ${lbl}`, weight: 0.08, qty: sc });
      }
      return [...base, ...toAdd];
    });
  }

  /* ════════════════════ STEPS ════════════════════ */
  function renderStep() {
    switch (step) {

      /* ── Step 1: Choose range ── */
      case 1:
        return (
          <div>
            <StepPill current={1} total={TOTAL_STEPS} />
            <div className="text-sm font-semibold text-gray-800 mb-3">Choose Bedroom Range</div>
            <div className="grid grid-cols-3 gap-2">
              {RANGES.map(r => (
                <button
                  key={r.code} type="button"
                  className={`border rounded-xl overflow-hidden text-center transition-colors ${selectedRange?.code === r.code ? 'border-cm-green ring-1 ring-cm-green' : 'border-gray-200 hover:border-gray-400'}`}
                  onClick={() => { setSelectedRange(r); setSelectedFinish(null); }}
                >
                  <div className="w-full aspect-[4/3] overflow-hidden">
                    <img src={r.image} alt={r.label} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                  <div className={`px-1 py-1.5 ${selectedRange?.code === r.code ? 'bg-green-50' : 'bg-white'}`}>
                    <div className="text-[11px] font-semibold text-gray-800">{r.label}</div>
                    <div className="text-[9px] text-gray-400 mt-0.5 leading-tight">{r.finishSummary}</div>
                  </div>
                </button>
              ))}
            </div>
            <NavButtons
              onBack={onBack}
              onNext={() => setStep(2)}
              nextDisabled={!selectedRange}
              nextLabel="Choose Finish →"
            />
          </div>
        );

      /* ── Step 2: Choose finish ── */
      case 2: {
        const finishes = rangeDef?.finishes || [];
        return (
          <div>
            <StepPill current={2} total={TOTAL_STEPS} />
            <div className="text-sm font-semibold text-gray-800 mb-1">{rangeDef?.label} — Choose Finish</div>
            <p className="text-[11px] text-gray-400 mb-3">Select the colour/finish combination.</p>
            <div className="grid grid-cols-1 gap-2">
              {finishes.map(f => (
                <button
                  key={f.code} type="button"
                  className={`border rounded-lg px-4 py-3 text-left text-[12px] transition-colors ${selectedFinish === f.code ? 'border-cm-green bg-green-50 font-semibold text-cm-green' : 'border-gray-200 hover:bg-gray-50'}`}
                  onClick={() => setSelectedFinish(f.code)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <NavButtons
              onBack={() => setStep(1)}
              onNext={() => { setMode(null); setStep(3); }}
              nextDisabled={!selectedFinish}
              nextLabel="Continue →"
            />
          </div>
        );
      }

      /* ── Step 3: Full Set or Individual? ── */
      case 3:
        return (
          <div>
            <StepPill current={3} total={TOTAL_STEPS} />
            <div className="text-sm font-semibold text-gray-800 mb-3">How would you like to order?</div>
            <div className="space-y-3">
              <button
                type="button"
                className={`w-full text-left border rounded-xl px-4 py-4 transition-colors ${mode === 'FULLSET' ? 'border-cm-green bg-green-50 ring-1 ring-cm-green' : 'border-gray-200 hover:bg-gray-50'}`}
                onClick={() => setMode('FULLSET')}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🛏️</span>
                  <div>
                    <div className="text-sm font-semibold text-gray-800">Full Bedroom Set</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      Full composition bundle — wardrobe + bed + 2× bedside tables + chest of drawers + mirror.
                      {compositionSku ? (
                        <span className="ml-1 text-green-600 font-semibold">Bundle available (best price)</span>
                      ) : (
                        <span className="ml-1 text-amber-600">Components auto-summed</span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
              <button
                type="button"
                className={`w-full text-left border rounded-xl px-4 py-4 transition-colors ${mode === 'INDIVIDUAL' ? 'border-cm-green bg-green-50 ring-1 ring-cm-green' : 'border-gray-200 hover:bg-gray-50'}`}
                onClick={() => setMode('INDIVIDUAL')}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🛒</span>
                  <div>
                    <div className="text-sm font-semibold text-gray-800">Individual Pieces</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      Select specific items à la carte — wardrobe, bed, bedside tables, chest of drawers, mirror.
                    </div>
                  </div>
                </div>
              </button>
            </div>
            <NavButtons
              onBack={() => setStep(2)}
              nextDisabled={!mode}
              nextLabel={(mode === 'FULLSET' && compositionSku) ? 'Add Wardrobe Extras →' : 'Choose Wardrobe →'}
              onNext={() => {
                if (mode === 'FULLSET' && compositionSku) { initExtrasPreselect(); setStep(7); }
                else setStep(4);
              }}
            />
          </div>
        );

      /* ── Step 4: Select wardrobe(s) (individual) ── */
      case 4:
        return (
          <div>
            <StepPill current={4} total={TOTAL_STEPS} />
            <div className="text-sm font-semibold text-gray-800 mb-2">Select Wardrobe(s)</div>
            <p className="text-[11px] text-gray-400 mb-3">
              Tick one or more wardrobes to include — or leave empty for pieces only.
            </p>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {wardrobeOptions.map(o => {
                const selected  = isWardrobeSelected(o.sku);
                const selEntry  = selectedWardrobes.find(w => w.sku === o.sku);
                return (
                  <div
                    key={o.sku}
                    className={`border rounded-lg px-3 py-2.5 flex items-center gap-2 cursor-pointer transition-colors ${selected ? 'border-cm-green bg-green-50' : 'border-gray-200 hover:bg-gray-50'}`}
                    onClick={() => toggleWardrobe(o)}
                  >
                    <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${selected ? 'border-cm-green bg-cm-green' : 'border-gray-300'}`}>
                      {selected && <span className="text-white text-[9px]">✓</span>}
                    </div>
                    <div className="flex-1">
                      <div className="text-[12px] font-medium text-gray-800">{o.label}</div>
                      {o.dimensions && <div className="text-[10px] text-gray-400 mt-0.5">{o.dimensions}</div>}
                      <div className="text-[10px] text-gray-500 font-mono mt-0.5">{o.sku} · weight {o.weight}</div>
                    </div>
                    {selected && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button type="button" className="w-5 h-5 border border-gray-300 rounded text-[11px] hover:bg-gray-100"
                          onClick={e => { e.stopPropagation(); setSelectedWardrobes(prev => prev.map(w => w.sku === o.sku ? { ...w, qty: Math.max(1, w.qty - 1) } : w)); }}>−</button>
                        <span className="text-[11px] font-medium w-4 text-center">{selEntry?.qty || 1}</span>
                        <button type="button" className="w-5 h-5 border border-gray-300 rounded text-[11px] hover:bg-gray-100"
                          onClick={e => { e.stopPropagation(); setSelectedWardrobes(prev => prev.map(w => w.sku === o.sku ? { ...w, qty: w.qty + 1 } : w)); }}>+</button>
                      </div>
                    )}
                  </div>
                );
              })}
              {wardrobeOptions.length === 0 && (
                <p className="text-[11px] text-amber-600">No wardrobe options for this finish combination. Continue to select bed and furniture.</p>
              )}
            </div>
            {selectedWardrobes.length > 0 && (
              <div className="mt-2 text-[10px] text-cm-green font-medium">
                {selectedWardrobes.length} wardrobe type{selectedWardrobes.length !== 1 ? 's' : ''} selected
                · {selectedWardrobes.reduce((s, w) => s + w.qty, 0)} unit{selectedWardrobes.reduce((s, w) => s + w.qty, 0) !== 1 ? 's' : ''} total
              </div>
            )}
            <NavButtons
              onBack={() => setStep(3)}
              onNext={() => setStep(5)}
              nextLabel="Choose Bed →"
            />
          </div>
        );

      /* ── Step 5: Select bed (individual) ── */
      case 5:
        return (
          <div>
            <StepPill current={5} total={TOTAL_STEPS} />
            <div className="text-sm font-semibold text-gray-800 mb-2">Select Bed</div>
            <p className="text-[11px] text-gray-400 mb-3">Choose a bed type, or skip.</p>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              <button
                type="button"
                className={`w-full text-left border rounded-lg px-3 py-2.5 text-[12px] transition-colors ${selectedBed === null ? 'border-cm-green bg-green-50 font-semibold text-cm-green' : 'border-gray-200 hover:bg-gray-50'}`}
                onClick={() => setSelectedBed(null)}
              >
                No bed
              </button>
              {bedOptions.map(o => (
                <button
                  key={o.sku} type="button"
                  className={`w-full text-left border rounded-lg px-3 py-2.5 text-[12px] transition-colors ${selectedBed === o.sku ? 'border-cm-green bg-green-50 font-semibold text-cm-green' : 'border-gray-200 hover:bg-gray-50'}`}
                  onClick={() => setSelectedBed(o.sku)}
                >
                  <div className="font-medium">{o.label}</div>
                  <div className="text-[10px] text-gray-500 font-mono mt-0.5">{o.sku} · weight {o.weight}</div>
                </button>
              ))}
            </div>
            {bedOptions.length === 0 && (
              <p className="text-[11px] text-amber-600 mt-2">No bed options for this finish.</p>
            )}
            <NavButtons
              onBack={() => setStep(4)}
              onNext={() => setStep(6)}
              nextLabel="Choose Furniture →"
            />
          </div>
        );

      /* ── Step 6: Bedroom furniture checkboxes ── */
      case 6:
        return (
          <div>
            <StepPill current={6} total={TOTAL_STEPS} />
            <div className="text-sm font-semibold text-gray-800 mb-2">Bedroom Furniture</div>
            <p className="text-[11px] text-gray-400 mb-3">
              Tick the pieces to include. Installation cost is applied per-item weight.
            </p>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {furnitureOptions.map(opt => {
                const selected = isFurnitureSelected(opt.sku);
                const selEntry = selectedFurniture.find(f => f.sku === opt.sku);
                return (
                  <div
                    key={opt.sku}
                    className={`border rounded-lg px-3 py-2.5 flex items-center gap-2 cursor-pointer transition-colors ${selected ? 'border-cm-green bg-green-50' : 'border-gray-200 hover:bg-gray-50'}`}
                    onClick={() => toggleFurniture(opt)}
                  >
                    <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${selected ? 'border-cm-green bg-cm-green' : 'border-gray-300'}`}>
                      {selected && <span className="text-white text-[9px]">✓</span>}
                    </div>
                    <div className="flex-1">
                      <div className="text-[12px] font-medium text-gray-800">{opt.label}</div>
                      <div className="text-[10px] text-gray-400 font-mono mt-0.5">{opt.sku} · weight {opt.weight}</div>
                    </div>
                    {selected && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button type="button" className="w-5 h-5 border border-gray-300 rounded text-[11px] hover:bg-gray-100"
                          onClick={e => { e.stopPropagation(); setSelectedFurniture(prev => prev.map(f => f.sku === opt.sku ? { ...f, qty: Math.max(1, f.qty - 1) } : f)); }}>−</button>
                        <span className="text-[11px] font-medium w-4 text-center">{selEntry?.qty || 1}</span>
                        <button type="button" className="w-5 h-5 border border-gray-300 rounded text-[11px] hover:bg-gray-100"
                          onClick={e => { e.stopPropagation(); setSelectedFurniture(prev => prev.map(f => f.sku === opt.sku ? { ...f, qty: f.qty + 1 } : f)); }}>+</button>
                      </div>
                    )}
                  </div>
                );
              })}
              {furnitureOptions.length === 0 && (
                <p className="text-[11px] text-amber-600">No furniture options for this finish.</p>
              )}
            </div>
            <NavButtons
              onBack={() => setStep(5)}
              onNext={() => { initExtrasPreselect(); setStep(7); }}
              nextLabel="Add Extras & Accessories →"
            />
          </div>
        );

      /* ── Step 7: Wardrobe Extras & Optional Accessories ── */
      case 7: {
        const sections = extrasOptions; // already returns section array

        return (
          <div>
            <StepPill current={7} total={TOTAL_STEPS} />
            <div className="text-sm font-semibold text-gray-800 mb-1">Extras & Optional Accessories</div>
            <p className="text-[11px] text-gray-400 mb-3">
              All items are from the pricelist. Tick to include; adjust quantities as needed.
            </p>
            {sections.length === 0 && (
              <p className="text-[11px] text-gray-400 italic mb-3">No optional extras available for this range.</p>
            )}
            <div className="space-y-4 max-h-[340px] overflow-y-auto pr-1">
              {sections.map(section => (
                <div key={section.key}>
                  <div className="text-[10px] font-bold text-gray-600 uppercase tracking-wide mb-0.5">{section.title}</div>
                  {section.note && <div className="text-[9px] text-gray-400 mb-1.5 leading-tight">{section.note}</div>}
                  <div className="space-y-1">
                    {section.items.map(opt => {
                      const selEntry = selectedExtras.find(e => e.sku === opt.sku);
                      const selected = !!selEntry;
                      const isRadio  = !!section.single_select;
                      return (
                        <div
                          key={opt.sku}
                          className={`border rounded-lg px-3 py-2 flex items-center gap-2 cursor-pointer transition-colors ${selected ? 'border-cm-green bg-green-50' : opt.recommended ? 'border-amber-300 bg-amber-50 hover:bg-amber-100' : 'border-gray-200 hover:bg-gray-50'}`}
                          onClick={() => toggleExtra(opt, section)}
                        >
                          {/* checkbox or radio indicator */}
                          <div className={`w-4 h-4 flex-shrink-0 flex items-center justify-center border-2 ${isRadio ? 'rounded-full' : 'rounded'} ${selected ? 'border-cm-green bg-cm-green' : 'border-gray-300'}`}>
                            {selected && <span className="text-white text-[9px]">{isRadio ? '●' : '✓'}</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <span className={`text-[11px] font-medium truncate ${selected ? 'text-cm-green' : 'text-gray-800'}`}>{opt.label}</span>
                              {opt.recommended && !selected && <span className="text-[8px] bg-amber-200 text-amber-800 px-1 rounded flex-shrink-0">suggested</span>}
                            </div>
                            <div className="text-[9px] text-gray-400 font-mono">{opt.sku}</div>
                          </div>
                          {/* qty controls — hidden for qty_locked items */}
                          {selected && !opt.qty_locked && (
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button type="button" className="w-5 h-5 border border-gray-300 rounded text-[11px] hover:bg-gray-100"
                                onClick={e => { e.stopPropagation(); setSelectedExtras(prev => prev.map(f => f.sku === opt.sku ? { ...f, qty: Math.max(1, f.qty - 1) } : f)); }}>−</button>
                              <span className="text-[11px] font-medium w-4 text-center">{selEntry.qty}</span>
                              <button type="button" className="w-5 h-5 border border-gray-300 rounded text-[11px] hover:bg-gray-100"
                                onClick={e => { e.stopPropagation(); setSelectedExtras(prev => prev.map(f => f.sku === opt.sku ? { ...f, qty: f.qty + 1 } : f)); }}>+</button>
                            </div>
                          )}
                          {selected && opt.qty_locked && (
                            <span className="text-[10px] text-gray-500 flex-shrink-0">×{selEntry.qty}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {selectedExtras.length > 0 && (
              <div className="mt-2 text-[10px] text-cm-green font-medium">
                {selectedExtras.length} extra{selectedExtras.length > 1 ? 's' : ''} selected
              </div>
            )}
            <NavButtons
              onBack={() => (mode === 'FULLSET' && compositionSku) ? setStep(3) : setStep(6)}
              onNext={() => { setPricing(null); fetchPricing(buildBom()); setStep(8); }}
              nextLabel="Review & Price →"
            />
          </div>
        );
      }

      /* ── Step 8: Review & add to quote ── */
      case 8: {
        // Safety net: trigger pricing if not already calculated
        if (!pricing && !pricingLoad && !pricingErr) {
          fetchPricing(buildBom());
        }

        return (
          <div>
            <StepPill current={8} total={TOTAL_STEPS} />
            <div className="text-sm font-semibold text-gray-800 mb-3">Review & Price</div>

            {/* Summary */}
            <div className="bg-gray-50 rounded-lg p-3 text-[11px] space-y-1 mb-3">
              <div><span className="text-gray-500">Range:</span> <span className="font-semibold">{selectedRange?.label}</span></div>
              <div><span className="text-gray-500">Finish:</span> <span className="font-semibold">{selectedFinish?.replace(/_/g, ' / ')}</span></div>
              <div><span className="text-gray-500">Mode:</span> <span className="font-semibold">{mode === 'FULLSET' ? 'Full Bedroom Set' : 'Individual Pieces'}</span></div>

              {mode === 'FULLSET' && compositionSku && (
                <div><span className="text-gray-500">Bundle:</span> <span className="font-mono text-green-700 font-semibold">{compositionSku}</span></div>
              )}

              {mode === 'INDIVIDUAL' && (
                <>
                  {selectedWardrobes.length > 0 ? (
                    selectedWardrobes.map((w, i) => (
                      <div key={i}>
                        <span className="text-gray-500">Wardrobe:</span>{' '}
                        <span className="font-mono text-[10px]">{w.qty > 1 ? `${w.qty}× ` : ''}{w.sku}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-amber-600">No wardrobe</div>
                  )}
                  {selectedBed ? (
                    <div><span className="text-gray-500">Bed:</span> <span className="font-mono text-[10px]">{selectedBed}</span></div>
                  ) : (
                    <div className="text-gray-400">No bed</div>
                  )}
                  {selectedFurniture.map((f, i) => (
                    <div key={i}><span className="text-gray-500">+</span> {f.qty > 1 ? `${f.qty}× ` : ''}{f.label}</div>
                  ))}
                </>
              )}

              {selectedExtras.length > 0 && (
                <>
                  <div className="text-gray-500 mt-1">Extras:</div>
                  {selectedExtras.map((e, i) => (
                    <div key={i}><span className="text-gray-500">·</span> {e.qty > 1 ? `${e.qty}× ` : ''}{e.label}</div>
                  ))}
                </>
              )}

              {gozoDelivery && <div className="text-amber-600 font-medium">+ Gozo delivery surcharge</div>}
            </div>

            {/* Delivery toggle */}
            <div className="flex gap-2 mb-3">
              {[
                { key: false, label: 'Malta', cls: !gozoDelivery ? 'border-cm-green bg-green-50 text-cm-green' : 'border-gray-200 text-gray-600' },
                { key: true,  label: 'Gozo',  cls: gozoDelivery ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-600' },
              ].map(opt => (
                <button key={String(opt.key)} type="button"
                  className={`flex-1 border rounded text-[11px] py-1.5 font-medium transition-colors ${opt.cls}`}
                  onClick={() => { setGozoDelivery(opt.key); setPricing(null); }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Pricing block */}
            {pricingLoad && <div className="text-[11px] text-gray-400 text-center py-4 animate-pulse">Calculating price…</div>}
            {pricingErr && (
              <div className="text-[11px] text-red-600 bg-red-50 rounded p-2 mb-2">
                Pricing error: {pricingErr}
                <button type="button" className="ml-2 underline" onClick={() => fetchPricing(buildBom())}>Retry</button>
              </div>
            )}
            {pricing && !pricingLoad && (
              <div className="rounded border border-gray-200 bg-white text-[12px] overflow-hidden mb-3">
                <div className="flex justify-between px-3 py-2 border-b border-gray-100">
                  <span className="text-gray-500">RRP (inc. {pricing.vat_rate}% VAT)</span>
                  <span className="font-semibold">€{pricing.rrp_inc_vat?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between px-3 py-2 border-b border-gray-100">
                  <span className="text-gray-500">Max Discount</span>
                  <span className="font-semibold">{pricing.max_discount_pct ?? 0}%</span>
                </div>
                <div className="flex justify-between px-3 py-2 bg-green-50">
                  <span className="font-semibold text-green-800">Offer Price (inc. VAT)</span>
                  <span className="font-bold text-green-800">€{pricing.offer_price_inc_vat}</span>
                </div>
              </div>
            )}

            <NavButtons
              onBack={() => setStep(7)}
              onNext={handleAddToDocument}
              nextLabel="Add to Document"
              loading={pricingLoad}
              nextDisabled={pricingLoad || (!pricing && !pricingErr)}
            />
          </div>
        );
      }

      default: return null;
    }
  }

  return (
    <div>
      {renderStep()}
    </div>
  );
}
