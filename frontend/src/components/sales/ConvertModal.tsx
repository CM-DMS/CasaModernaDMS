/**
 * ConvertModal — lets user pick a conversion target for the current document.
 */
import { CM } from '../ui/CMClassNames'

const DOC_ICONS: Record<string, string> = {
  Quotation: '📋',
  'Sales Order': '🛒',
  'Delivery Note': '📦',
  'Sales Invoice': '🧾',
  'Payment Entry': '💳',
}

const DOC_DESCRIPTIONS: Record<string, string> = {
  'Sales Order': 'Convert this quotation into a confirmed sales order.',
  'Delivery Note': 'Create a delivery note to record goods dispatched.',
  'Sales Invoice': 'Generate a tax invoice from this document.',
  'Payment Entry': 'Record a payment received against this invoice.',
}

interface ConvertModalProps {
  isOpen: boolean
  targets: string[]
  doctype: string
  onSelect: (target: string) => void
  onClose: () => void
}

export function ConvertModal({ isOpen, targets, doctype, onSelect, onClose }: ConvertModalProps) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-800">Convert Document</div>
            <div className="text-[11px] text-gray-500">Convert {doctype} to one of the following:</div>
          </div>
          <button type="button" className="text-gray-400 hover:text-gray-700" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="p-4 space-y-2">
          {targets.length === 0 ? (
            <div className="text-sm text-gray-500 text-center py-4">
              No conversion targets available.
            </div>
          ) : (
            targets.map((target) => (
              <button
                key={target}
                type="button"
                className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:border-cm-green hover:bg-green-50 transition-colors"
                onClick={() => onSelect(target)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{DOC_ICONS[target] || '📄'}</span>
                  <div>
                    <div className="text-sm font-semibold text-gray-800">{target}</div>
                    {DOC_DESCRIPTIONS[target] && (
                      <div className="text-[11px] text-gray-500">{DOC_DESCRIPTIONS[target]}</div>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="px-4 pb-3 flex justify-end">
          <button type="button" className={CM.btn.ghost} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
