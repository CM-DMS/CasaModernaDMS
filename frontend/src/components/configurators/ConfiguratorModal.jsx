/**
 * ConfiguratorModal — top-level modal that lets the user choose which configurator to open.
 *
 * Props:
 *   isOpen         {boolean}
 *   onClose        {function}
 *   onBuilt        {function(config)} — called with the final configuration when user completes
 *   jumpToWardrobe {boolean}          — if true, skip the menu and open Night Collection directly
 *   jumpTo         {string|null}      — 'SOFA' | 'WARDROBE' | 'LORELLA' — skip menu to this view
 *
 * config.type is either 'SOFA' or 'WARDROBE' so the caller can use the right item_code
 * and description when adding to a document line.
 */
import { useState, useEffect } from 'react';
import SofaConfigurator from './SofaConfigurator';
import { NightCollectionConfigurator } from './NightCollectionConfigurator';
import { LorellaCollectionConfigurator } from './LorellaCollectionConfigurator';
import { ToplineBedroomsConfigurator } from './ToplineBedroomsConfigurator';

const VIEWS = { MENU: 'MENU', SOFA: 'SOFA', WARDROBE: 'WARDROBE', LORELLA: 'LORELLA', TOPLINE: 'TOPLINE' };

export function ConfiguratorModal({ isOpen, onClose, onBuilt, jumpToWardrobe = false, jumpTo = null }) {
  const [view, setView] = useState(VIEWS.MENU);

  // When jumpToWardrobe or jumpTo is set, skip the menu on open.
  useEffect(() => {
    if (isOpen) {
      if (jumpTo && VIEWS[jumpTo]) {
        setView(VIEWS[jumpTo]); // eslint-disable-line react-hooks/set-state-in-effect
      } else if (jumpToWardrobe) {
        setView(VIEWS.WARDROBE); // eslint-disable-line react-hooks/set-state-in-effect
      }
    }
    if (!isOpen) setView(VIEWS.MENU);
  }, [isOpen, jumpToWardrobe, jumpTo]);

  const handleBack = () => setView(VIEWS.MENU);

  const handleBuilt = (type, config) => {
    onBuilt?.({ ...config, type });
    setView(VIEWS.MENU);
    onClose();
  };

  const handleClose = () => {
    setView(VIEWS.MENU);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-800">Product Configurator</div>
            {view !== VIEWS.MENU && (
              <div className="text-[11px] text-gray-500">
                {view === VIEWS.SOFA ? 'Sofa'
                  : view === VIEWS.LORELLA ? 'Lorella Collection – Bedroom Set'
                  : view === VIEWS.TOPLINE ? 'Topline Bedrooms – Bedroom Set'
                  : 'Night Collection – Bedroom Set'}
              </div>
            )}
          </div>
          <button type="button" className="text-gray-400 hover:text-gray-700" onClick={handleClose}>✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {view === VIEWS.MENU && (
            <div className="space-y-3">
              <p className="text-[12px] text-gray-500 mb-4">Select the product category to configure:</p>
              <button
                type="button"
                className="w-full text-left border border-gray-200 rounded-xl px-4 py-4 hover:border-cm-green hover:bg-green-50 transition-colors"
                onClick={() => setView(VIEWS.SOFA)}
              >
                <div className="text-2xl mb-1">🛋️</div>
                <div className="text-sm font-semibold text-gray-800">Sofa</div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  Configure model, orientation, fabric range, colour and options.
                </div>
              </button>
              <button
                type="button"
                className="w-full text-left border border-gray-200 rounded-xl px-4 py-4 hover:border-cm-green hover:bg-green-50 transition-colors"
                onClick={() => setView(VIEWS.WARDROBE)}
              >
                <div className="text-2xl mb-1">🛏️</div>
                <div className="text-sm font-semibold text-gray-800">Night Collection — Bedroom Set</div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  Configure wardrobe (hinged/sliding/open), finishes, accessories, and bedroom furniture.
                </div>
              </button>
              <button
                type="button"
                className="w-full text-left border border-gray-200 rounded-xl px-4 py-4 hover:border-cm-green hover:bg-green-50 transition-colors"
                onClick={() => setView(VIEWS.LORELLA)}
              >
                <div className="text-2xl mb-1">🪞</div>
                <div className="text-sm font-semibold text-gray-800">Lorella Collection — Bedroom Set</div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  Configure Lorella wardrobe (hinged/cabina/ponte), structure &amp; front finishes, and bedroom furniture.
                </div>
              </button>
              <button
                type="button"
                className="w-full text-left border border-gray-200 rounded-xl px-4 py-4 hover:border-cm-green hover:bg-green-50 transition-colors"
                onClick={() => setView(VIEWS.TOPLINE)}
              >
                <div className="text-2xl mb-1">🪵</div>
                <div className="text-sm font-semibold text-gray-800">Topline Bedrooms — Bedroom Set</div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  Configure Topline Mobili bedroom (Nicole, Zoe, Luisa, Giulia, Ischia, Olympia, Vanessa, Tiffany, Emma).
                </div>
              </button>
            </div>
          )}

          {view === VIEWS.SOFA && (
            <SofaConfigurator
              onBuilt={(config) => handleBuilt('SOFA', config)}
              onBack={handleBack}
              onClose={handleClose}
            />
          )}

          {view === VIEWS.WARDROBE && (
            <NightCollectionConfigurator
              onBuilt={(config) => handleBuilt('WARDROBE', config)}
              onBack={handleBack}
              onClose={handleClose}
            />
          )}

          {view === VIEWS.LORELLA && (
            <LorellaCollectionConfigurator
              onBuilt={(config) => handleBuilt('WARDROBE', config)}
              onBack={handleBack}
            />
          )}

          {view === VIEWS.TOPLINE && (
            <ToplineBedroomsConfigurator
              onBuilt={(config) => handleBuilt('WARDROBE', config)}
              onBack={handleBack}
            />
          )}
        </div>
      </div>
    </div>
  );
}
