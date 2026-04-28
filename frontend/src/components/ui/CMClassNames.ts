// Centralised className tokens — aligns with V2 CMClassNames.js

export const CM = {
  // Page / layout
  page: 'p-3 md:p-4',
  grid: 'grid grid-cols-1 md:grid-cols-2 gap-3',
  grid3: 'grid grid-cols-1 md:grid-cols-3 gap-3',

  // Cards / sections
  card: 'bg-white rounded border border-gray-200 p-4',
  section: 'border rounded bg-white p-3',
  sectionHeader: 'flex items-center justify-between mb-2',
  sectionTitle: 'text-[11px] font-bold uppercase tracking-wider text-gray-500',

  // Typography
  subtle: 'text-[11px] text-gray-500',
  linkAction: 'text-[11px] text-cm-green hover:underline cursor-pointer',
  value: 'text-sm text-gray-800',
  label: 'block text-[11px] font-semibold text-gray-700 mb-1',

  // Form controls
  input:
    'w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white ' +
    'focus:outline-none focus:ring-1 focus:ring-cm-green disabled:bg-gray-50 disabled:text-gray-400',
  select:
    'w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white ' +
    'focus:outline-none focus:ring-1 focus:ring-cm-green disabled:bg-gray-50 disabled:text-gray-400',
  textarea:
    'w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white ' +
    'focus:outline-none focus:ring-1 focus:ring-cm-green resize-y',

  // Buttons
  btn: {
    primary:
      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold ' +
      'bg-cm-green text-white hover:bg-cm-green-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
    secondary:
      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold border border-gray-300 ' +
      'bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
    danger:
      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold ' +
      'bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
    ghost:
      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold ' +
      'text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
    warning:
      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold ' +
      'bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
    success:
      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold ' +
      'bg-cm-green text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
  },

  // Misc
  divider: 'border-t border-gray-100 my-3',
  pill: 'inline-flex items-center rounded-full border border-gray-200 px-2 py-[2px] text-[11px] text-gray-600 bg-gray-50',
  pillGreen:
    'inline-flex items-center rounded-full border border-cm-green px-2 py-[2px] text-[11px] text-cm-green bg-cm-green-light',

  // Table
  table: {
    wrapper: 'overflow-x-auto',
    table: 'w-full text-xs',
    thead: 'bg-gray-50',
    th: 'text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-3 py-2 border-b border-gray-200 whitespace-nowrap',
    thRight:
      'text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-3 py-2 border-b border-gray-200 whitespace-nowrap',
    tr: 'border-b border-gray-100 hover:bg-gray-50 transition-colors',
    td: 'px-3 py-2 text-gray-800',
    tdRight: 'px-3 py-2 text-gray-800 text-right tabular-nums',
    tdMuted: 'px-3 py-2 text-gray-400',
  },
}
