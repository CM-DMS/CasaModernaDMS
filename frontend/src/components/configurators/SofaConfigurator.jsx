import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  SOFA_GROUPS,
  SOFA_MODELS,
  FABRIC_RANGES,
  OPTION_PRICES,
  getModelsByGroup,
  getBasePrice,
  calculateTotalPrice,
  SOFA_VAT_RATE,
} from './sofaPricingData';
import { priceListsApi } from '../../api/priceLists';
import { getSofaMeasurementImage } from '../../utils/sofaMeasurementImage';

// ── Formatters ──────────────────────────────────────────────────────────────
const fmt = (n) => `€${n.toLocaleString('en-IE')}`;

// ── Step Indicator ──────────────────────────────────────────────────────────
function StepIndicator({ current, labels }) {
  return (
    <div className="flex items-center justify-center gap-1 mb-6">
      {labels.map((label, i) => {
        const stepNum = i + 1;
        const isActive = stepNum === current;
        const isDone = stepNum < current;
        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-200 ${
                  isActive
                    ? 'bg-stone-800 text-white ring-2 ring-stone-300'
                    : isDone
                    ? 'bg-stone-600 text-white'
                    : 'bg-stone-200 text-stone-400'
                }`}
              >
                {isDone ? '✓' : stepNum}
              </div>
              <span
                className={`text-[10px] mt-1 whitespace-nowrap ${
                  isActive ? 'text-stone-800 font-medium' : 'text-stone-400'
                }`}
              >
                {label}
              </span>
            </div>
            {i < labels.length - 1 && (
              <div
                className={`w-8 h-px mx-1 mt-[-12px] ${
                  isDone ? 'bg-stone-500' : 'bg-stone-200'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Price Badge ─────────────────────────────────────────────────────────────
function PriceBadge({ rrp, offer, compact = false }) {
  if (!offer || offer === 0) return null;
  const hasDiscount = rrp > offer;
  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5">
        {hasDiscount && (
          <span className="text-stone-400 line-through text-xs">{fmt(rrp)}</span>
        )}
        <span className="text-stone-800 font-semibold text-sm">{fmt(offer)}</span>
      </span>
    );
  }
  return (
    <div className="flex flex-col items-end">
      {hasDiscount && (
        <span className="text-stone-400 line-through text-xs">{fmt(rrp)}</span>
      )}
      <span className="text-stone-800 font-bold text-base">{fmt(offer)}</span>
      {hasDiscount && (
        <span className="text-emerald-600 text-[10px] font-medium">
          Save {fmt(rrp - offer)}
        </span>
      )}
    </div>
  );
}

// ── Step 1: Sofa Group ──────────────────────────────────────────────────────
function StepGroup({ onSelect }) {
  return (
    <div>
      <h3 className="text-lg font-semibold text-stone-800 mb-1">Choose Sofa Type</h3>
      <p className="text-sm text-stone-500 mb-4">Select the style of sofa you're looking for</p>
      <div className="grid grid-cols-2 gap-3">
        {SOFA_GROUPS.map((g) => {
          const count = getModelsByGroup(g.key).length;
          return (
            <button
              key={g.key}
              onClick={() => onSelect(g.key)}
              className="flex flex-col items-start p-4 rounded-xl border border-stone-200 hover:border-stone-400 hover:shadow-md transition-all duration-150 text-left bg-white"
            >
              <span className="text-base font-semibold text-stone-800">{g.label}</span>
              <span className="text-xs text-stone-400 mt-0.5">{g.description}</span>
              <span className="text-[10px] text-stone-300 mt-2">{count} models</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Step 2: Model ───────────────────────────────────────────────────────────
function StepModel({ group, onSelect }) {
  const models = useMemo(() => getModelsByGroup(group), [group]);

  // Group by family for cleaner display
  const families = useMemo(() => {
    const map = {};
    models.forEach((m) => {
      if (!map[m.family]) map[m.family] = [];
      map[m.family].push(m);
    });
    return Object.entries(map);
  }, [models]);

  // Show starting price (cheapest finish category A)
  const startingPrice = useCallback((modelKey) => {
    const p = getBasePrice(modelKey, 'A');
    return p?.offerInclVat || null;
  }, []);

  return (
    <div>
      <h3 className="text-lg font-semibold text-stone-800 mb-1">Choose Model</h3>
      <p className="text-sm text-stone-500 mb-4">
        {models.length} models available
      </p>
      <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
        {families.map(([family, familyModels]) => (
          <div key={family}>
            <h4 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2">
              {family}
            </h4>
            <div className="space-y-2">
              {familyModels.map((m) => {
                const sp = startingPrice(m.modelKey);
                return (
                  <button
                    key={m.modelKey}
                    onClick={() => onSelect(m.modelKey)}
                    className="w-full flex items-center justify-between p-3 rounded-lg border border-stone-200 hover:border-stone-400 hover:shadow-sm transition-all duration-150 text-left bg-white"
                  >
                    <div>
                      <span className="text-sm font-medium text-stone-800">
                        {m.displayName}
                      </span>
                      <div className="flex gap-2 mt-0.5">
                        {m.seatModules && (
                          <span className="text-[10px] text-stone-400">
                            {m.seatModules} seats
                          </span>
                        )}
                        {m.seatWidthCm && (
                          <span className="text-[10px] text-stone-400">
                            {m.seatWidthCm}cm wide
                          </span>
                        )}
                        {m.isElectricRecliner && (
                          <span className="text-[10px] text-amber-600 font-medium">
                            ⚡ Electric
                          </span>
                        )}
                      </div>
                    </div>
                    {sp > 0 && (
                      <span className="text-xs text-stone-500">
                        from <span className="font-semibold text-stone-700">{fmt(sp)}</span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Step 3: Orientation ─────────────────────────────────────────────────────
function StepOrientation({ model, modelKey, onSelect }) {
  return (
    <div>
      <h3 className="text-lg font-semibold text-stone-800 mb-1">Choose Orientation</h3>
      <p className="text-sm text-stone-500 mb-4">
        Facing the {model.displayName}, which side is the longer section?
      </p>
      <div className="grid grid-cols-2 gap-3">
        {[
          { key: 'L', label: 'Left Hand Facing', abbr: 'LHF' },
          { key: 'R', label: 'Right Hand Facing', abbr: 'RHF' },
        ].map((o) => {
          const imgSrc = getSofaMeasurementImage(modelKey, o.key, false);
          return (
            <button
              key={o.key}
              onClick={() => onSelect(o.key)}
              className="flex flex-col items-center justify-center p-4 rounded-xl border border-stone-200 hover:border-stone-400 hover:shadow-md transition-all duration-150 bg-white"
            >
              {imgSrc ? (
                <div className="w-full aspect-[4/3] mb-2 overflow-hidden rounded-lg bg-stone-50">
                  <img
                    src={imgSrc}
                    alt={o.label}
                    className="w-full h-full object-contain"
                    onError={(e) => { e.target.parentElement.style.display = 'none'; }}
                  />
                </div>
              ) : (
                <span className="text-2xl mb-2">{o.key === 'L' ? '◧' : '◨'}</span>
              )}
              <span className="text-sm font-semibold text-stone-800">{o.label}</span>
              <span className="text-xs text-stone-400">{o.abbr}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Step 4: Fabric & Colour ─────────────────────────────────────────────────
function StepFabric({ modelKey, onSelect }) {
  const [selectedRange, setSelectedRange] = useState(null);
  const ranges = Object.values(FABRIC_RANGES);

  // Show price for this model in each fabric category
  const rangePrices = useMemo(() => {
    const map = {};
    ranges.forEach((r) => {
      const p = getBasePrice(modelKey, r.finishCategory);
      map[r.rangeCode] = p;
    });
    return map;
  }, [modelKey, ranges]);

  if (!selectedRange) {
    return (
      <div>
        <h3 className="text-lg font-semibold text-stone-800 mb-1">Choose Fabric Range</h3>
        <p className="text-sm text-stone-500 mb-4">
          Each range has a different price tier and texture
        </p>
        <div className="space-y-2">
          {ranges.map((r) => {
            const price = rangePrices[r.rangeCode];
            return (
              <button
                key={r.rangeCode}
                onClick={() => setSelectedRange(r.rangeCode)}
                className="w-full flex items-center justify-between p-3 rounded-lg border border-stone-200 hover:border-stone-400 hover:shadow-sm transition-all duration-150 text-left bg-white"
              >
                <div>
                  <span className="text-sm font-medium text-stone-800">{r.rangeCode}</span>
                  <span className="text-xs text-stone-400 ml-2">
                    Category {r.finishCategory} · {r.colours.length} colours
                  </span>
                </div>
                {price && price.offerInclVat > 0 && (
                  <PriceBadge rrp={price.rrpInclVat} offer={price.offerInclVat} />
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const range = FABRIC_RANGES[selectedRange];
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-stone-800">
            {selectedRange} Colours
          </h3>
          <p className="text-xs text-stone-400">
            Category {range.finishCategory} · {range.colours.length} options
          </p>
        </div>
        <button
          onClick={() => setSelectedRange(null)}
          className="text-xs text-stone-500 hover:text-stone-800 underline"
        >
          ← Change range
        </button>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[380px] overflow-y-auto pr-1">
        {range.colours.map((c) => (
          <button
            key={c.colourKey}
            onClick={() =>
              onSelect({
                fabricRange: selectedRange,
                colourKey: c.colourKey,
                colourName: c.colourName,
                finishCategory: range.finishCategory,
              })
            }
            className="flex flex-col items-center p-2 rounded-lg border border-stone-200 hover:border-stone-400 hover:shadow-sm transition-all duration-150 bg-white"
          >
            <div
              className="w-full aspect-square rounded-md bg-stone-100 mb-1.5 overflow-hidden"
              title={c.colourName}
            >
              <img
                src={`${import.meta.env.BASE_URL.replace(/\/$/, '')}${c.imagePath}`}
                alt={c.colourName}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            </div>
            <span className="text-[10px] text-stone-600 text-center leading-tight line-clamp-2">
              {c.colourName}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Step 5: Options & Extras ────────────────────────────────────────────────
function StepOptions({ model, onComplete, onPreview }) {
  const isAmanda = model.isElectricRecliner;
  const seatModules = model.seatModules;
  const canHaveRecliner = !isAmanda && seatModules && (seatModules === 2 || seatModules === 3);

  const [storagePouffe, setStoragePouffe] = useState(false);
  const [extraSeat, setExtraSeat] = useState(false);
  const [elecRecliner, setElecRecliner] = useState(0);

  const buildOptions = (sp, es, er) => ({
    STORAGE_POUFFE: isAmanda ? false : sp,
    EXTRA_SEAT:     isAmanda ? false : es,
    ELEC_RECLINER:  isAmanda ? null  : canHaveRecliner ? (er || null) : null,
  });

  const handlePouffeChange = (checked) => {
    setStoragePouffe(checked);
    onPreview?.(buildOptions(checked, extraSeat, elecRecliner));
  };
  const handleExtraSeatChange = (checked) => {
    setExtraSeat(checked);
    onPreview?.(buildOptions(storagePouffe, checked, elecRecliner));
  };
  const handleElecReclinerChange = (val) => {
    setElecRecliner(val);
    onPreview?.(buildOptions(storagePouffe, extraSeat, val));
  };

  const pouffe = OPTION_PRICES.STORAGE_POUFFE;
  const extra = OPTION_PRICES.EXTRA_SEAT;

  return (
    <div>
      <h3 className="text-lg font-semibold text-stone-800 mb-1">Options & Extras</h3>
      <p className="text-sm text-stone-500 mb-4">Add optional extras to your sofa</p>

      {isAmanda && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800">
          <strong>Amanda Electric Recliner</strong> — Storage pouffe and extra seat options
          are not available for this model. Electric recliner mechanism is included.
        </div>
      )}

      {!isAmanda && (
        <div className="space-y-3 mb-6">
          {/* Storage Pouffe */}
          <label className="flex items-center justify-between p-3 rounded-lg border border-stone-200 cursor-pointer hover:bg-stone-50 transition-colors">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={storagePouffe}
                onChange={(e) => handlePouffeChange(e.target.checked)}
                className="w-4 h-4 accent-stone-700"
              />
              <div>
                <span className="text-sm font-medium text-stone-800">Storage Pouffe</span>
                <span className="block text-[10px] text-stone-400">
                  Matching fabric ottoman with storage
                </span>
              </div>
            </div>
            <PriceBadge rrp={pouffe.rrpInclVat} offer={pouffe.offerInclVat} compact />
          </label>

          {/* Extra Seat */}
          <label className="flex items-center justify-between p-3 rounded-lg border border-stone-200 cursor-pointer hover:bg-stone-50 transition-colors">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={extraSeat}
                onChange={(e) => handleExtraSeatChange(e.target.checked)}
                className="w-4 h-4 accent-stone-700"
              />
              <div>
                <span className="text-sm font-medium text-stone-800">Extra Seat</span>
                <span className="block text-[10px] text-stone-400">
                  Additional seating module
                </span>
              </div>
            </div>
            <PriceBadge rrp={extra.rrpInclVat} offer={extra.offerInclVat} compact />
          </label>

          {/* Electric Recliner Seats */}
          {canHaveRecliner && (
            <div className="p-3 rounded-lg border border-stone-200">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-stone-800">
                    Electric Recliner Seats
                  </span>
                  <span className="block text-[10px] text-stone-400">
                    Number of powered reclining seats
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleElecReclinerChange(Math.max(0, elecRecliner - 1))}
                    disabled={elecRecliner === 0}
                    className="w-7 h-7 rounded-full border border-stone-300 flex items-center justify-center text-stone-600 hover:bg-stone-100 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    −
                  </button>
                  <span className="text-sm font-semibold text-stone-800 w-4 text-center">
                    {elecRecliner}
                  </span>
                  <button
                    onClick={() =>
                      handleElecReclinerChange(Math.min(seatModules, elecRecliner + 1))
                    }
                    disabled={elecRecliner >= seatModules}
                    className="w-7 h-7 rounded-full border border-stone-300 flex items-center justify-center text-stone-600 hover:bg-stone-100 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    +
                  </button>
                </div>
              </div>
              {elecRecliner > 0 && (
                <p className="text-[10px] text-amber-600 mt-2">
                  ⚠ Electric recliner pricing is pending — price shown as €0 until confirmed
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => onComplete(buildOptions(storagePouffe, extraSeat, elecRecliner))}
        className="w-full py-3 rounded-xl bg-stone-800 text-white font-semibold text-sm hover:bg-stone-700 transition-colors"
      >
        Complete Configuration
      </button>
    </div>
  );
}

// ── Price Summary Bar ───────────────────────────────────────────────────────
function PriceSummaryBar({ modelKey, fabricRange, options }) {
  const pricing = useMemo(() => {
    if (!modelKey || !fabricRange) return null;
    return calculateTotalPrice(modelKey, fabricRange, options || {});
  }, [modelKey, fabricRange, options]);

  if (!pricing || pricing.offerInclVat === 0) return null;

  return (
    <div className="mt-4 p-3 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between">
      <div>
        <span className="text-[10px] text-stone-400 uppercase tracking-wider">Running Total</span>
        {pricing.baseNeedsReview && (
          <span className="text-[10px] text-amber-600 ml-2">⚠ Price pending review</span>
        )}
      </div>
      <PriceBadge rrp={pricing.rrpInclVat} offer={pricing.offerInclVat} />
    </div>
  );
}

// ── Sofa Top View Image Lightbox ────────────────────────────────────────────
function SofaImageLightbox({ imgSrc, altText, onClose }) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handlePrint = () => {
    const win = window.open('', '_blank');
    win.document.write(`
      <!DOCTYPE html><html><head>
        <title>Sofa Top View — ${altText}</title>
        <style>
          body { margin: 0; display: flex; flex-direction: column; align-items: center; padding: 24px; font-family: sans-serif; }
          img { max-width: 100%; height: auto; }
          h2 { font-size: 14px; color: #555; margin-bottom: 12px; }
        </style>
      </head><body>
        <h2>${altText}</h2>
        <img src="${imgSrc}" />
        <script>window.onload = () => { window.print(); window.close(); }</script>
      </body></html>
    `);
    win.document.close();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-stone-700">Technical Top View</span>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50 hover:border-stone-400 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a1 1 0 001 1h8a1 1 0 001-1v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9h8v3H6v-3zm9-5a1 1 0 110 2 1 1 0 010-2z" clipRule="evenodd"/>
              </svg>
              Print
            </button>
            <button
              onClick={onClose}
              className="text-xs px-3 py-1.5 rounded-lg border border-stone-200 text-stone-500 hover:bg-stone-50 hover:border-stone-400 transition-colors"
            >
              ✕ Close
            </button>
          </div>
        </div>
        {/* Image */}
        <div className="bg-stone-50 rounded-xl overflow-hidden flex items-center justify-center">
          <img
            src={imgSrc}
            alt={altText}
            className="w-full h-auto object-contain"
          />
        </div>
        <p className="text-[10px] text-stone-400 text-center mt-2">{altText}</p>
      </div>
    </div>
  );
}

// ── Sofa Top View Panel ─────────────────────────────────────────────────────
// Displays the technical top-view diagram; click to enlarge or print.
function SofaTopViewPanel({ modelKey, orientation, extraSeat }) {
  const model = SOFA_MODELS[modelKey];
  const imgSrc = getSofaMeasurementImage(modelKey, orientation, extraSeat);
  const [visible, setVisible] = useState(true);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    setVisible(true); // eslint-disable-line react-hooks/set-state-in-effect
  }, [imgSrc]);

  if (!imgSrc || !visible) return null;

  const altText = [
    model?.displayName,
    orientation === 'L' ? 'Left Hand Facing' : orientation === 'R' ? 'Right Hand Facing' : null,
    extraSeat ? '+ Extra Seat' : null,
  ].filter(Boolean).join(' · ');

  return (
    <>
      <div className="mb-4 rounded-xl border border-stone-100 bg-stone-50 overflow-hidden relative group">
        <img
          src={imgSrc}
          alt={altText}
          className="w-full object-contain max-h-44 cursor-zoom-in"
          onClick={() => setLightboxOpen(true)}
          onError={() => setVisible(false)}
        />
        {/* Expand hint */}
        <button
          onClick={() => setLightboxOpen(true)}
          className="absolute bottom-2 right-2 flex items-center gap-1 text-[10px] bg-white/90 border border-stone-200 text-stone-500 px-2 py-1 rounded-lg shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
            <path d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 11-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zM17 4a1 1 0 00-1-1h-4a1 1 0 000 2h1.586l-2.293 2.293a1 1 0 001.414 1.414L15 6.414V8a1 1 0 002 0V4zM3 16a1 1 0 001 1h4a1 1 0 000-2H6.414l2.293-2.293a1 1 0 00-1.414-1.414L5 13.586V12a1 1 0 00-2 0v4zM17 16a1 1 0 01-1 1h-4a1 1 0 010-2h1.586l-2.293-2.293a1 1 0 011.414-1.414L15 13.586V12a1 1 0 012 0v4z"/>
          </svg>
          Enlarge
        </button>
      </div>
      {lightboxOpen && (
        <SofaImageLightbox
          imgSrc={imgSrc}
          altText={altText}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
}

// ── Main Configurator ───────────────────────────────────────────────────────
export default function SofaConfigurator({ onBuilt, onBack }) {
  const [step, setStep] = useState(1);
  const [resolving, setResolving] = useState(false);
  const [previewOptions, setPreviewOptions] = useState(null);
  const [config, setConfig] = useState({
    groupKey: null,
    modelKey: null,
    orientation: null,
    fabricRange: null,
    colourKey: null,
    colourName: null,
    finishCategory: null,
    options: {},
  });

  const model = config.modelKey ? SOFA_MODELS[config.modelKey] : null;
  const requiresOrientation = model?.requiresOrientation ?? false;

  // Determine actual steps (skip orientation for linear sofas)
  const stepLabels = useMemo(() => {
    const labels = ['Type', 'Model'];
    if (requiresOrientation) labels.push('Orientation');
    labels.push('Fabric', 'Options');
    return labels;
  }, [requiresOrientation]);

  const totalSteps = stepLabels.length;

  // Map logical step number to actual step component
  const _getStepOffset = useCallback(
    (s) => {
      if (!requiresOrientation && s >= 3) return s + 1;
      return s;
    },
    [requiresOrientation]
  );

  const logicalStep = requiresOrientation
    ? step
    : step <= 2
    ? step
    : step + 1; // skip orientation numbering

  const handleBack = () => {
    setPreviewOptions(null);
    if (step === 1) {
      onBack?.();
    } else {
      setStep(step - 1);
    }
  };

  const handleGroupSelect = (groupKey) => {
    setConfig((c) => ({ ...c, groupKey, modelKey: null, orientation: null }));
    setStep(2);
  };

  const handleModelSelect = (modelKey) => {
    setConfig((c) => ({
      ...c,
      modelKey,
      orientation: null,
      fabricRange: null,
      colourKey: null,
      colourName: null,
      finishCategory: null,
    }));
    const m = SOFA_MODELS[modelKey];
    setStep(m.requiresOrientation ? 3 : 3); // step 3 either way; logicalStep handles mapping
  };

  const handleOrientationSelect = (orientation) => {
    setConfig((c) => ({ ...c, orientation }));
    setStep(requiresOrientation ? 4 : 3);
  };

  const handleFabricSelect = ({ fabricRange, colourKey, colourName, finishCategory }) => {
    setConfig((c) => ({ ...c, fabricRange, colourKey, colourName, finishCategory }));
    setStep(requiresOrientation ? 5 : 4);
  };

  const handleOptionsComplete = async (options) => {
    setConfig((c) => ({ ...c, options }));

    const m = SOFA_MODELS[config.modelKey];

    // Build description
    const parts = [m.displayName];
    if (config.orientation) parts.push(config.orientation === 'L' ? 'LHF' : 'RHF');
    parts.push(`${config.fabricRange} — ${config.colourName}`);
    if (options.STORAGE_POUFFE) parts.push('+ Storage Pouffe');
    if (options.EXTRA_SEAT) parts.push('+ Extra Seat');
    if (options.ELEC_RECLINER) parts.push(`+ ${options.ELEC_RECLINER}× Electric Recliner`);

    // Resolve pricing from the server (authoritative, admin-maintainable).
    // Falls back to the local JS data if the API is unreachable, so the
    // configurator always produces a result even in offline/dev scenarios.
    let pricing = null;
    setResolving(true);
    try {
      const result = await priceListsApi.resolveConfiguredPrice({
        configurator_type: 'Sofa',
        dimensions: { mode: config.modelKey, finish_code: config.finishCategory },
      });
      const vatFactor = 1 + SOFA_VAT_RATE / 100;
      // Base price from server
      let offerInclVat = result.offer_price_inc_vat || 0;
      let rrpInclVat   = result.rrp_inc_vat || 0;
      // Add option prices (currently 0; will be non-zero once configured in admin)
      if (options.STORAGE_POUFFE) {
        offerInclVat += OPTION_PRICES.STORAGE_POUFFE.offerInclVat;
        rrpInclVat   += OPTION_PRICES.STORAGE_POUFFE.rrpInclVat;
      }
      if (options.EXTRA_SEAT) {
        offerInclVat += OPTION_PRICES.EXTRA_SEAT.offerInclVat;
        rrpInclVat   += OPTION_PRICES.EXTRA_SEAT.rrpInclVat;
      }
      if (options.ELEC_RECLINER && options.ELEC_RECLINER > 0) {
        offerInclVat += OPTION_PRICES.ELEC_RECLINER_PER_SEAT.offerInclVat * options.ELEC_RECLINER;
        rrpInclVat   += OPTION_PRICES.ELEC_RECLINER_PER_SEAT.rrpInclVat   * options.ELEC_RECLINER;
      }
      pricing = {
        rrpInclVat,
        offerInclVat,
        rrpExVat:    Math.round((rrpInclVat   / vatFactor) * 100) / 100,
        offerExVat:  Math.round((offerInclVat / vatFactor) * 100) / 100,
        vatRate:     SOFA_VAT_RATE,
        savings:     rrpInclVat - offerInclVat,
      };
    } catch (err) {
      // Fallback: use local JS data so the user can still add the product
      console.error('[SofaConfigurator] Server pricing unavailable, using local data:', err);
      const jsPrice = calculateTotalPrice(config.modelKey, config.fabricRange, options);
      if (jsPrice) {
        pricing = {
          rrpInclVat:   jsPrice.rrpInclVat,
          offerInclVat: jsPrice.offerInclVat,
          rrpExVat:     jsPrice.rrpExVat,
          offerExVat:   jsPrice.offerExVat,
          vatRate:      jsPrice.vatRate,
          savings:      jsPrice.savings,
        };
      }
    } finally {
      setResolving(false);
    }

    onBuilt?.({
      modelKey: config.modelKey,
      displayName: m.displayName,
      orientation: config.orientation,
      fabricRange: config.fabricRange,
      colourKey: config.colourKey,
      colourName: config.colourName,
      finishCategory: config.finishCategory,
      options,
      description: parts.join(' · '),
      itemCode: 'CM-SOFA',
      pricing,
    });
  };

  // Render the appropriate step
  const renderStep = () => {
    if (logicalStep === 1) {
      return <StepGroup onSelect={handleGroupSelect} />;
    }
    if (logicalStep === 2) {
      return <StepModel group={config.groupKey} onSelect={handleModelSelect} />;
    }
    if (logicalStep === 3 && requiresOrientation) {
      return <StepOrientation model={model} modelKey={config.modelKey} onSelect={handleOrientationSelect} />;
    }
    if (logicalStep === 3 && !requiresOrientation) {
      // This shouldn't happen due to step mapping, but fallback
      return <StepFabric modelKey={config.modelKey} onSelect={handleFabricSelect} />;
    }
    if (logicalStep === 4) {
      return <StepFabric modelKey={config.modelKey} onSelect={handleFabricSelect} />;
    }
    if (logicalStep === 5) {
      return (
        <StepOptions
          model={model}
          fabricRange={config.fabricRange}
          onComplete={handleOptionsComplete}
          onPreview={setPreviewOptions}
        />
      );
    }
    return null;
  };

  return (
    <div className="max-w-lg mx-auto relative">
      {/* Pricing resolution overlay — shown while the server resolves the final price */}
      {resolving && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/80">
          <div className="flex flex-col items-center gap-2">
            <div className="h-6 w-6 rounded-full border-2 border-stone-300 border-t-stone-700 animate-spin" />
            <span className="text-[11px] text-stone-500">Confirming price…</span>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={handleBack}
          className="text-sm text-stone-500 hover:text-stone-800 transition-colors"
        >
          ← Back
        </button>
        <span className="text-[10px] text-stone-400">
          Step {step} of {totalSteps}
        </span>
      </div>

      <StepIndicator current={step} total={totalSteps} labels={stepLabels} />

      {/* Top-view diagram — shown once orientation is confirmed (or immediately for linear sofas) */}
      {config.modelKey && (config.orientation || !requiresOrientation) && (
        <SofaTopViewPanel
          modelKey={config.modelKey}
          orientation={config.orientation ?? 'R'}
          extraSeat={!!(previewOptions?.EXTRA_SEAT)}
        />
      )}

      {/* Step Content */}
      {renderStep()}

      {/* Running Price Summary */}
      {config.modelKey && config.fabricRange && (
        <PriceSummaryBar
          modelKey={config.modelKey}
          fabricRange={config.fabricRange}
          options={previewOptions ?? config.options}
        />
      )}
    </div>
  );
}