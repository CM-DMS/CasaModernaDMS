import { useState, useCallback, useEffect } from 'react'
import { PageHeader } from '../../components/shared/ui'
import { CM } from '../../components/ui/CMClassNames'
import { frappe } from '../../api/frappe'
import { useAuth } from '../../auth/AuthProvider'
import * as XLSX from 'xlsx'

const API = 'casamoderna_dms.data_reset_api'

interface DataSummary {
  export_counts: Record<string, number>
  wipe_counts:   Record<string, number>
  preserved:     string[]
}

function today() { return new Date().toISOString().slice(0, 10) }

function downloadAsExcel(data: Record<string, unknown>[], sheetName: string, filename: string) {
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
  XLSX.writeFile(wb, filename)
}

function downloadAllAsExcel(allData: Record<string, { data: Record<string, unknown>[]; count: number }>, filename: string) {
  const wb = XLSX.utils.book_new()
  for (const [dt, { data }] of Object.entries(allData)) {
    if (data.length > 0) {
      const ws = XLSX.utils.json_to_sheet(data)
      XLSX.utils.book_append_sheet(wb, ws, dt.slice(0, 31))
    }
  }
  XLSX.writeFile(wb, filename)
}

function WipeLogPanel({ log }: { log: string[] }) {
  return (
    <div className="bg-gray-900 text-green-400 font-mono text-[11px] rounded p-3 max-h-72 overflow-y-auto">
      {log.length === 0 && <div className="text-gray-500">Waiting for output…</div>}
      {log.map((line, i) => <div key={i} className="whitespace-pre-wrap">{line}</div>)}
    </div>
  )
}

function ExportTab({ summary, exporting, onExportOne, onExportAll }: {
  summary: DataSummary | null
  exporting: string | null
  onExportOne: (dt: string) => void
  onExportAll: () => void
}) {
  const exportCounts = summary?.export_counts ?? {}
  return (
    <div>
      <p className="text-sm text-gray-600 mb-4">Download current data as Excel files before performing a system reset.</p>
      <div className="mb-4">
        <button onClick={onExportAll} disabled={!!exporting} className={CM.btn.primary}>
          {exporting === 'all' ? 'Exporting…' : '📦 Export All Data (single workbook)'}
        </button>
      </div>
      <div className={CM.card}>
        <table className="w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className={`${CM.table.th} text-left`}>Category</th>
              <th className={`${CM.table.thRight}`}>Records</th>
              <th className={`${CM.table.thRight}`}>Action</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(exportCounts).map(([dt, count]) => (
              <tr key={dt} className={CM.table.tr}>
                <td className={CM.table.td}>{dt}</td>
                <td className={CM.table.tdRight}>{count >= 0 ? count.toLocaleString() : '—'}</td>
                <td className={CM.table.tdRight}>
                  <button onClick={() => onExportOne(dt)} disabled={!!exporting || count <= 0}
                    className="text-cm-green hover:text-cm-green-dark text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed">
                    {exporting === dt ? 'Exporting…' : 'Download .xlsx'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function DataReset() {
  const { user } = useAuth()
  const [tab, setTab]           = useState<'export' | 'reset'>('export')
  const [summary, setSummary]   = useState<DataSummary | null>(null)
  const [loading, setLoading]   = useState(true)
  const [message, setMessage]   = useState<{ type: string; text: string } | null>(null)
  const [exporting, setExporting] = useState<string | null>(null)
  const [step, setStep]         = useState(1)
  const [ackExported, setAckExported]           = useState(false)
  const [ackIrreversible, setAckIrreversible]   = useState(false)
  const [typedPhrase, setTypedPhrase]           = useState('')
  const [wipeCode, setWipeCode]                 = useState<string | null>(null)
  const [wiping, setWiping]                     = useState(false)
  const [wipeLog, setWipeLog]                   = useState<string[]>([])
  const [wipeDone, setWipeDone]                 = useState(false)

  const loadSummary = useCallback(async () => {
    setLoading(true)
    try {
      const res = await frappe.callGet<DataSummary>(`${API}.get_data_summary`)
      setSummary(res as DataSummary)
    } catch (e: unknown) {
      setMessage({ type: 'error', text: (e as Error).message || 'Failed to load data summary' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadSummary() }, [loadSummary])

  const handleExportOne = async (doctype: string) => {
    setExporting(doctype)
    setMessage(null)
    try {
      const res = await frappe.callGet<{ data: Record<string, unknown>[]; count: number }>(`${API}.export_doctype_data`, { doctype })
      const data = (res as { data?: Record<string, unknown>[] }).data ?? []
      downloadAsExcel(data, doctype, `CasaModerna_${doctype.replace(/ /g, '_')}_${today()}.xlsx`)
      setMessage({ type: 'success', text: `Exported ${(res as { count?: number }).count} ${doctype} records` })
    } catch (e: unknown) {
      setMessage({ type: 'error', text: (e as Error).message || `Failed to export ${doctype}` })
    } finally {
      setExporting(null)
    }
  }

  const handleExportAll = async () => {
    setExporting('all')
    setMessage(null)
    try {
      const res = await frappe.callGet<Record<string, { data: Record<string, unknown>[]; count: number }>>(`${API}.export_all_data`)
      const allData = res as Record<string, { data: Record<string, unknown>[]; count: number }>
      downloadAllAsExcel(allData, `CasaModerna_Full_Export_${today()}.xlsx`)
      const total = Object.values(allData).reduce((s, v) => s + v.count, 0)
      setMessage({ type: 'success', text: `Exported ${total} records across ${Object.keys(allData).length} doctypes` })
    } catch (e: unknown) {
      setMessage({ type: 'error', text: (e as Error).message || 'Failed to export all data' })
    } finally {
      setExporting(null)
    }
  }

  const handleRequestCode = async () => {
    try {
      const res = await frappe.call<{ code: string }>(`${API}.request_wipe_code`)
      setWipeCode((res as { code?: string }).code ?? null)
      setStep(3)
    } catch (e: unknown) {
      setMessage({ type: 'error', text: (e as Error).message || 'Failed to generate confirmation code' })
    }
  }

  const handleExecuteWipe = async () => {
    setWiping(true)
    setWipeLog([])
    setMessage(null)
    try {
      const res = await frappe.call<{ log: string[] }>(`${API}.execute_wipe`, {
        confirmation_code: wipeCode,
        typed_phrase: typedPhrase,
      })
      setWipeLog((res as { log?: string[] }).log ?? [])
      setWipeDone(true)
      setMessage({ type: 'success', text: 'Data wipe completed successfully.' })
    } catch (e: unknown) {
      setMessage({ type: 'error', text: (e as Error).message || 'Wipe failed' })
    } finally {
      setWiping(false)
    }
  }

  const phraseMatch = typedPhrase === 'RESET CASAMODERNA'
  const wipeCounts  = summary?.wipe_counts ?? {}
  const preserved   = summary?.preserved ?? []
  const totalWipe   = Object.values(wipeCounts).reduce((s, v) => s + Math.max(v, 0), 0)

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader title="Data Reset Console" subtitle="Export training data and prepare for production cutover" />

      {message && (
        <div className={`mb-4 px-4 py-3 rounded text-sm ${
          message.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'
        }`}>{message.text}</div>
      )}

      <div className="flex gap-1 mb-6 border-b border-gray-200">
        <button onClick={() => setTab('export')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'export' ? 'border-cm-green text-cm-green' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          📥 Export &amp; Preserve
        </button>
        <button onClick={() => setTab('reset')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'reset' ? 'border-red-500 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          ⚠️ System Reset
        </button>
      </div>

      {loading && <div className="text-sm text-gray-500 animate-pulse py-8 text-center">Loading data summary…</div>}

      {!loading && tab === 'export' && (
        <ExportTab summary={summary} exporting={exporting} onExportOne={handleExportOne} onExportAll={handleExportAll} />
      )}

      {!loading && tab === 'reset' && (
        <div>
          {wipeDone ? (
            <div>
              <div className="bg-green-50 border border-green-200 rounded p-4 mb-4">
                <h3 className="text-green-800 font-semibold text-sm mb-2">✅ Data wipe complete</h3>
                <p className="text-green-700 text-xs">Run bench migrate and bench clear-cache to finalize.</p>
              </div>
              <WipeLogPanel log={wipeLog} />
            </div>
          ) : (
            <div>
              <div className="bg-red-50 border border-red-200 rounded p-4 mb-6">
                <h3 className="text-red-800 font-semibold text-sm mb-1">⚠️ Danger Zone</h3>
                <p className="text-red-700 text-xs">
                  This will permanently delete <strong>{totalWipe.toLocaleString()}</strong> records, remove all uploaded files, and reset all counters. Cannot be undone.
                </p>
              </div>

              {preserved.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded p-4 mb-6">
                  <h3 className="text-blue-800 font-semibold text-sm mb-2">🔒 What is preserved</h3>
                  <ul className="text-blue-700 text-xs space-y-0.5">
                    {preserved.map((item, i) => <li key={i}>✓ {item}</li>)}
                  </ul>
                </div>
              )}

              <div className={`${CM.card} mb-6`}>
                <h3 className="text-sm font-semibold text-gray-700 px-3 py-2 border-b border-gray-100">Records to be deleted</h3>
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className={`${CM.table.th} text-left`}>Doctype</th>
                        <th className={CM.table.thRight}>Records</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(wipeCounts).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]).map(([dt, count]) => (
                        <tr key={dt} className={CM.table.tr}>
                          <td className={CM.table.td}>{dt}</td>
                          <td className={CM.table.tdRight}>{count.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  {[1, 2, 3].map((s) => (
                    <div key={s} className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                      s === step ? 'bg-red-500 text-white' : s < step ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
                    }`}>{s < step ? '✓' : s}</div>
                  ))}
                  <span className="text-xs text-gray-500 ml-2">Step {step} of 3</span>
                </div>

                {step === 1 && (
                  <div className="border border-gray-200 rounded p-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">Step 1: Confirm data has been exported</h4>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input type="checkbox" checked={ackExported} onChange={(e) => setAckExported(e.target.checked)} className="mt-0.5" />
                      <span className="text-xs text-gray-600">I have exported all data I need. Training data cannot be recovered after reset.</span>
                    </label>
                    <div className="mt-4">
                      <button onClick={() => setStep(2)} disabled={!ackExported} className={CM.btn.secondary}>Continue →</button>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="border border-red-200 rounded p-4 bg-red-50/30">
                    <h4 className="text-sm font-semibold text-red-700 mb-3">Step 2: Confirm this is irreversible</h4>
                    <label className="flex items-start gap-2 cursor-pointer mb-4">
                      <input type="checkbox" checked={ackIrreversible} onChange={(e) => setAckIrreversible(e.target.checked)} className="mt-0.5" />
                      <span className="text-xs text-gray-600">I understand this will permanently delete all customers, products, documents, invoices, stock entries, and uploaded files.</span>
                    </label>
                    <div className="mb-4">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Type <code className="bg-red-100 px-1.5 py-0.5 rounded text-red-700 font-mono">RESET CASAMODERNA</code> to confirm:
                      </label>
                      <input type="text" value={typedPhrase} onChange={(e) => setTypedPhrase(e.target.value)}
                        placeholder="Type confirmation phrase here"
                        className={`${CM.input} max-w-xs font-mono ${phraseMatch ? 'border-green-400' : ''}`}
                        autoComplete="off" spellCheck={false} />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setStep(1); setAckIrreversible(false); setTypedPhrase('') }} className="text-xs text-gray-500 hover:text-gray-700">← Back</button>
                      <button onClick={handleRequestCode} disabled={!ackIrreversible || !phraseMatch} className={CM.btn.danger}>
                        Generate Reset Code →
                      </button>
                    </div>
                  </div>
                )}

                {step === 3 && !wiping && (
                  <div className="border-2 border-red-400 rounded p-4 bg-red-50">
                    <h4 className="text-sm font-semibold text-red-700 mb-3">Step 3: Execute reset</h4>
                    <p className="text-xs text-gray-600 mb-3">
                      Your confirmation code is: <code className="bg-white px-2 py-1 rounded border border-red-200 font-mono font-bold text-red-700">{wipeCode}</code>
                    </p>
                    <p className="text-xs text-gray-500 mb-4">
                      This code expires in 5 minutes. Logged in as <strong>{(user as { name?: string })?.name}</strong>.
                    </p>
                    <div className="flex gap-2">
                      <button onClick={() => { setStep(2); setWipeCode(null) }} className="text-xs text-gray-500 hover:text-gray-700">← Back</button>
                      <button onClick={handleExecuteWipe} className={CM.btn.danger}>🗑️ Execute Data Reset Now</button>
                    </div>
                  </div>
                )}

                {wiping && (
                  <div className="border border-yellow-300 rounded p-4 bg-yellow-50">
                    <h4 className="text-sm font-semibold text-yellow-700 mb-2">⏳ Reset in progress…</h4>
                    <WipeLogPanel log={wipeLog} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
