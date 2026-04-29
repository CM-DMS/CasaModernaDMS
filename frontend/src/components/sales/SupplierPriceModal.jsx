/**
 * SupplierPriceModal — lets a salesperson enter a supplier price from design
 * software, pick the applicable Pricing Calculator and (optionally) LM, then
 * see a live formula trace, add VAT, apply a discount, and set the line rate.
 *
 * Props:
 *   rowIdx              {number}    — which item row this applies to
 *   initialRow          {object}    — current row values (for pre-fill)
 *   onApply             {function}  — called with { rate, cm_rrp_inc_vat,
 *                                     cm_effective_discount_percent,
 *                                     cm_supplier_price, cm_price_calculator, cm_lm }
 *   onClose             {function}
 */
import { useState, useEffect } from 'react';
import { priceCalculatorApi } from '../../api/priceCalculator';
import { CM } from '../ui/CMClassNames';
import { CMButton } from '../ui/CMComponents';

function fmt(n) {
  return Number.isFinite(Number(n)) ? `€${Number(n).toFixed(2)}` : '—';
}

// Local formula engine — mirrors Python implementation
function applyFormula(steps, basePrice, lm) {
  let total = parseFloat(basePrice || 0);
  const trace = [];
  for (const step of steps || []) {
    const prev = total;
    const v  = parseFloat(step.value  ?? 0);
    const v2 = parseFloat(step.value2 ?? 0);
    switch (step.step_type) {
      case 'DISCOUNT_PCT':        total = total * (1 - v / 100); break;
      case 'INCREASE_PCT':        total = total * (1 + v / 100); break;
      case 'ADD_FIXED':           total = total + v;             break;
      case 'ADD_INSTALL_FROM_LM': total = total + (v * parseFloat(lm || 0)) + v2; break;
      case 'MULTIPLY':            total = total * v;             break;
      default: break;
    }
    trace.push({ label: step.label, step_type: step.step_type, prev, total });
  }
  return { total, trace };
}

export function SupplierPriceModal({ rowIdx, initialRow, onApply, onClose }) {
  // ── Calculator state ───────────────────────────────────────────────────────
  const [calculators, setCalculators]   = useState([]);
  const [vatRate, setVatRate]           = useState(18);
  const [loadingCalcs, setLoadingCalcs] = useState(true);
  const [selected, setSelected]         = useState(initialRow?.cm_price_calculator || '');
  const [supplierPrice, setSupplierPrice] = useState(
    initialRow?.cm_supplier_price ? String(initialRow.cm_supplier_price) : ''
  );
  const [lm, setLm]           = useState(initialRow?.cm_lm ? String(initialRow.cm_lm) : '');
  // Sales rep inputs — override the calculated RRP and/or discount
  const [customRrp, setCustomRrp]       = useState('');
  const [discount, setDiscount]         = useState(
    initialRow?.cm_effective_discount_percent
      ? String(parseFloat(initialRow.cm_effective_discount_percent).toFixed(1))
      : '0'
  );
  const [customOffer, setCustomOffer]   = useState(''); // direct price override
  const [offerMode, setOfferMode]       = useState('discount'); // 'discount' | 'direct'
  const [gozoDelivery, setGozoDelivery] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      priceCalculatorApi.listCalculators(),
      priceCalculatorApi.getVatRate(),
    ])
      .then(([calcs, vat]) => {
        setCalculators(calcs ?? []);
        if (Number.isFinite(Number(vat))) setVatRate(Number(vat));
        const ladder = (calcs ?? []).filter(c => !c.pricing_mechanism || c.pricing_mechanism === 'Supplier Ladder');
        if (!selected && ladder.length === 1) setSelected(ladder[0].name);
      })
      .catch(e => setError(e.userMessage ?? e.message ?? 'Failed to load calculators.'))
      .finally(() => setLoadingCalcs(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedCalc = calculators.find(c => c.name === selected);
  const needsLm = !!selectedCalc?.requires_lm;
  const gozoSurcharge = parseFloat(selectedCalc?.gozo_surcharge ?? 0) || 0;

  // Only show Supplier Ladder calculators in the picker (hide Configurator BOM ones)
  const ladderCalcs = calculators.filter(
    c => !c.pricing_mechanism || c.pricing_mechanism === 'Supplier Ladder'
  );

  const formulaResult = selected && supplierPrice !== ''
    ? applyFormula(selectedCalc?.steps ?? [], supplierPrice, lm)
    : null;

  // Derived pricing — Gozo surcharge is added ex-VAT before applying VAT
  const calcRrpExVat  = formulaResult
    ? formulaResult.total + (gozoDelivery ? gozoSurcharge : 0)
    : null;
  const calcRrpIncVat = calcRrpExVat !== null ? calcRrpExVat * (1 + vatRate / 100) : null;

  // Sales rep may override the presented RRP (must be >= calculated)
  const customRrpVal  = customRrp !== '' ? parseFloat(customRrp) : null;
  const activeRrp     = (customRrpVal !== null && Number.isFinite(customRrpVal) && customRrpVal > 0)
    ? customRrpVal
    : calcRrpIncVat;

  // Floor price = what the formula says at max_discount_percent
  const maxDiscPct    = parseFloat(selectedCalc?.max_discount_percent ?? 0) || 0;
  const floorPrice    = calcRrpIncVat !== null ? calcRrpIncVat * (1 - maxDiscPct / 100) : null;

  // Offer price — either from discount % applied to activeRrp, or typed directly
  const discPct       = Math.min(100, Math.max(0, parseFloat(discount || 0) || 0));
  const offerFromDisc = activeRrp !== null ? activeRrp * (1 - discPct / 100) : null;
  const offerFromDirect = customOffer !== '' ? parseFloat(customOffer) : null;
  const offerPrice    = offerMode === 'direct' && offerFromDirect !== null && Number.isFinite(offerFromDirect)
    ? offerFromDirect
    : offerFromDisc;

  // Effective discount % shown back to rep when they enter a direct price
  const effectiveDiscPct = (activeRrp && offerPrice && activeRrp > 0)
    ? Math.max(0, (1 - offerPrice / activeRrp) * 100)
    : discPct;

  // Warning if offer is below the floor
  const belowFloor = floorPrice !== null && offerPrice !== null && offerPrice < floorPrice - 0.005;
  const canApply   = offerPrice !== null && Number.isFinite(offerPrice) && offerPrice > 0;

  function handleApply() {
    if (!canApply) return;
    onApply({
      rate:                          parseFloat(offerPrice.toFixed(2)),
      cm_rrp_inc_vat:                parseFloat((activeRrp ?? calcRrpIncVat ?? 0).toFixed(2)),
      cm_effective_discount_percent: parseFloat(effectiveDiscPct.toFixed(2)),
      cm_supplier_price:             parseFloat(parseFloat(supplierPrice).toFixed(2)),
      cm_price_calculator:           selected,
      cm_lm:                         needsLm ? parseFloat(parseFloat(lm || 0).toFixed(2)) : 0,
      cm_gozo_delivery:              gozoDelivery ? 1 : 0,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-2xl rounded-xl bg-white shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="font-semibold text-gray-900">Price Calc</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Enter the supplier design price — the formula calculates the CM RRP, then apply your discount.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded">✕</button>
        </div>

        {/* ── Supplier Ladder panel ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && (
            <div className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          {/* Calculator selector */}
          <div>
            <label className={CM.label}>Pricing Calculator <span className="text-red-500">*</span></label>
            {loadingCalcs ? (
              <p className="text-xs text-gray-400 animate-pulse">Loading calculators…</p>
            ) : ladderCalcs.length === 0 ? (
              <p className="text-xs text-yellow-700 bg-yellow-50 rounded p-2">
                No pricing calculators configured yet.{' '}
                <a href="/admin/pricing-calculators" className="underline" target="_blank">Set one up →</a>
              </p>
            ) : (
              <div className="mt-1 space-y-1.5">
                {ladderCalcs.map(c => (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => { setSelected(c.name); setLm(''); }}
                    className={`w-full text-left rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                      selected === c.name
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900">{c.calculator_name}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-gray-400">{c.calculator_code}</span>
                        {!!c.requires_lm && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">LM</span>
                        )}
                        <span className="text-xs text-gray-400">{c.steps?.length ?? 0} steps</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Price inputs */}
          {selected && (
            <div className={`grid gap-3 items-end ${needsLm ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <div>
                <label className={CM.label}>
                  Supplier Price (from design software) <span className="text-red-500">*</span>
                </label>
                <div className="relative mt-1">
                  <span className="absolute inset-y-0 left-2.5 flex items-center text-gray-400 text-sm pointer-events-none">€</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    autoFocus
                    value={supplierPrice}
                    onChange={e => setSupplierPrice(e.target.value)}
                    placeholder="0.00"
                    className={`${CM.input} pl-7`}
                  />
                </div>
              </div>
              {needsLm && (
                <div>
                  <label className={CM.label}>
                    Linear Metres (LM) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={lm}
                    onChange={e => setLm(e.target.value)}
                    placeholder="0.0"
                    className={`mt-1 ${CM.input}`}
                  />
                </div>
              )}
            </div>
          )}

          {/* ── Gozo Delivery toggle (shown when calculator has a surcharge configured) ── */}
          {selected && gozoSurcharge > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
              <div>
                <span className="text-xs font-semibold text-amber-800">Gozo Delivery Surcharge</span>
                <span className="ml-2 text-[11px] text-amber-600">+€{gozoSurcharge.toFixed(2)} ex. VAT</span>
              </div>
              <button
                type="button"
                onClick={() => setGozoDelivery(v => !v)}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                  gozoDelivery ? 'bg-amber-500' : 'bg-gray-300'
                }`}
                role="switch"
                aria-checked={gozoDelivery}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition-transform duration-200 ${
                    gozoDelivery ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          )}

          {/* ── Offer section ── */}
          {formulaResult && (
            <div className="rounded-lg border border-gray-200 overflow-hidden space-y-0 text-sm">

              {/* Optional: sales rep raises the RRP */}
              <div className="px-3 py-2.5 bg-gray-50 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-600">
                    Presented RRP Inc. VAT
                    <span className="ml-1 text-gray-400 font-normal">(leave blank to use calculated)</span>
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-400 text-xs">€</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={customRrp}
                      onChange={e => { setCustomRrp(e.target.value); setOfferMode('discount'); }}
                      placeholder={calcRrpIncVat ? calcRrpIncVat.toFixed(2) : ''}
                      className="w-28 text-right text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-indigo-400"
                    />
                  </div>
                </div>
                {customRrpVal !== null && calcRrpIncVat !== null && (
                  <p className="mt-1 text-[10px] text-indigo-600">
                    Active RRP: {fmt(activeRrp)}
                    {customRrpVal < calcRrpIncVat - 0.005 && (
                      <span className="ml-1 text-amber-600">⚠ below calculated RRP</span>
                    )}
                  </p>
                )}
              </div>

              {/* Mode toggle */}
              <div className="flex border-b border-gray-200">
                <button
                  type="button"
                  onClick={() => setOfferMode('discount')}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${
                    offerMode === 'discount'
                      ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-500'
                      : 'bg-white text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  Discount %
                </button>
                <button
                  type="button"
                  onClick={() => setOfferMode('direct')}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${
                    offerMode === 'direct'
                      ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-500'
                      : 'bg-white text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  Direct Price
                </button>
              </div>

              {/* Discount % input */}
              {offerMode === 'discount' && (
                <div className="flex items-center justify-between px-3 py-2.5 bg-white border-b border-gray-100">
                  <div>
                    <span className="text-xs font-medium text-gray-700">Discount</span>
                    {floorPrice !== null && (
                      <span className="ml-2 text-[10px] text-gray-400">max {maxDiscPct.toFixed(1)}% = floor {fmt(floorPrice)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={discount}
                      onChange={e => setDiscount(e.target.value)}
                      className="w-20 text-right text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-indigo-400"
                    />
                    <span className="text-sm text-gray-500">%</span>
                  </div>
                </div>
              )}

              {/* Direct price input */}
              {offerMode === 'direct' && (
                <div className="flex items-center justify-between px-3 py-2.5 bg-white border-b border-gray-100">
                  <div>
                    <span className="text-xs font-medium text-gray-700">Offer Price Inc. VAT</span>
                    {floorPrice !== null && (
                      <span className="ml-2 text-[10px] text-gray-400">floor {fmt(floorPrice)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-400 text-xs">€</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={customOffer}
                      onChange={e => setCustomOffer(e.target.value)}
                      placeholder={offerFromDisc ? offerFromDisc.toFixed(2) : ''}
                      className="w-28 text-right text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-indigo-400"
                    />
                  </div>
                </div>
              )}

              {/* Warning */}
              {belowFloor && (
                <div className="px-3 py-2 bg-red-50 border-b border-red-200 flex items-start gap-2">
                  <span className="text-red-500 text-base leading-none mt-0.5">⚠</span>
                  <div className="text-xs text-red-700">
                    <span className="font-semibold">Below minimum floor price.</span>{' '}
                    The calculated floor is {fmt(floorPrice)} ({maxDiscPct}% off {fmt(calcRrpIncVat)}).
                    You can still apply, but this will be recorded as a below-floor offer.
                  </div>
                </div>
              )}

              {/* Result row */}
              <div className={`flex justify-between items-center px-3 py-3 ${
                belowFloor ? 'bg-red-50' : 'bg-green-50'
              }`}>
                <div>
                  <span className={`font-bold ${belowFloor ? 'text-red-900' : 'text-green-900'}`}>
                    Offer Price (Inc. VAT)
                  </span>
                  {activeRrp && offerPrice && (
                    <span className="ml-2 text-[11px] text-gray-500">
                      {effectiveDiscPct.toFixed(1)}% off RRP
                    </span>
                  )}
                </div>
                <span className={`tabular-nums font-bold text-lg ${
                  belowFloor ? 'text-red-700' : 'text-green-900'
                }`}>{fmt(offerPrice)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <CMButton variant="secondary" onClick={onClose}>Cancel</CMButton>
          <CMButton
            variant="primary"
            onClick={handleApply}
            disabled={!canApply}
          >
            {rowIdx < 0 ? 'Apply' : `Apply to Line ${rowIdx + 1}`}
          </CMButton>
        </div>
      </div>
    </div>
  );
}

