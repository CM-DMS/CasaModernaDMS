/**
 * BankReconciliation — Match bank statement lines to payment entries.
 * Workflow: select bank account → import/paste CSV → auto-match → confirm / mark exception.
 * Route: /finance/bank-reconciliation
 */
import { useState, useCallback } from 'react'
import { frappe } from '../../api/frappe'
import { PageHeader, ErrorBox, Btn, inputCls, selectCls } from '../../components/shared/ui'
import { fmtMoney, fmtDate } from '../../utils/fmt'

const STATUS_COLOR: Record<string, string> = {
  'Unmatched':    'bg-gray-100 text-gray-500',
  'Auto-Matched': 'bg-amber-100 text-amber-700',
  'Reconciled':   'bg-green-100 text-green-700',
  'Exception':    'bg-red-100 text-red-600',
}

const thisMonthFirst = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
const today = () => new Date().toISOString().slice(0, 10)

interface StatementLine {
  name: string
  transaction_date: string
  description: string
  reference_number: string
  credit: number
  debit: number
  reconciliation_status: string
  matched_document?: string
}

interface SummaryRow { reconciliation_status: string; cnt: number }
interface ReconciliationSummary { summary: SummaryRow[] }

function parseCsv(text: string) {
  const lines = text.trim().split('\n').filter(Boolean)
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase())
  return lines.slice(1).map(line => {
    const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = cols[i] ?? '' })
    return {
      transaction_date: obj['date'] ?? obj['transaction_date'] ?? obj['value date'] ?? '',
      description:      obj['description'] ?? obj['narrative'] ?? obj['details'] ?? '',
      debit:            parseFloat(obj['debit'] ?? obj['out'] ?? '0') || 0,
      credit:           parseFloat(obj['credit'] ?? obj['in'] ?? '0') || 0,
      balance:          parseFloat(obj['balance'] ?? obj['running balance'] ?? '0') || 0,
      reference_number: obj['reference'] ?? obj['ref'] ?? obj['cheque'] ?? '',
    }
  }).filter(r => r.transaction_date)
}

export function BankReconciliation() {
  const [account, setAccount]     = useState('')
  const [from, setFrom]           = useState(thisMonthFirst())
  const [to, setTo]               = useState(today())
  const [statusFilter, setSF]     = useState('')
  const [lines, setLines]         = useState<StatementLine[]>([])
  const [summary, setSummary]     = useState<ReconciliationSummary | null>(null)
  const [loading, setLoading]     = useState(false)
  const [csvText, setCsvText]     = useState('')
  const [importMsg, setImportMsg] = useState('')
  const [error, setError]         = useState<string | null>(null)

  const loadLines = useCallback(async () => {
    if (!account) return
    setLoading(true)
    setError(null)
    try {
      const res = await frappe.call<StatementLine[]>(
        'casamoderna_dms.bank_reconciliation_api.get_statement_lines',
        { account, date_from: from, date_to: to, status: statusFilter, limit: 300 },
      )
      setLines(res ?? [])
      const s = await frappe.call<ReconciliationSummary>(
        'casamoderna_dms.bank_reconciliation_api.get_reconciliation_summary',
        { bank_account: account },
      )
      setSummary(s)
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [account, from, to, statusFilter])

  async function importCsv() {
    const parsed = parseCsv(csvText)
    if (!parsed.length) { setImportMsg('No valid rows found — check CSV format.'); return }
    try {
      const res = await frappe.call<{ created: number; duplicates: number }>(
        'casamoderna_dms.bank_reconciliation_api.import_statement_lines',
        { lines: parsed, bank_account: account },
      )
      setImportMsg(`Imported ${res.created} rows (${res.duplicates} duplicates skipped).`)
      setCsvText('')
      loadLines()
    } catch (e: unknown) {
      setImportMsg((e as Error).message ?? 'Import failed')
    }
  }

  async function autoMatch() {
    setLoading(true)
    try {
      const res = await frappe.call<{ matched: number; total: number }>(
        'casamoderna_dms.bank_reconciliation_api.auto_match_lines',
        { bank_account: account, date_from: from, date_to: to },
      )
      setImportMsg(`Auto-matched ${res.matched} of ${res.total} lines.`)
      loadLines()
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Auto-match failed')
    } finally {
      setLoading(false)
    }
  }

  async function confirmMatch(lineName: string, matchedDoc: string) {
    await frappe.call('casamoderna_dms.bank_reconciliation_api.confirm_match', {
      line_name: lineName, matched_doctype: 'Payment Entry', matched_document: matchedDoc,
    })
    setLines(prev => prev.map(l => l.name === lineName ? { ...l, reconciliation_status: 'Reconciled' } : l))
  }

  async function markException(lineName: string) {
    const reason = window.prompt('Reason (fee, bank charge, etc.):') ?? ''
    await frappe.call('casamoderna_dms.bank_reconciliation_api.mark_exception', { line_name: lineName, reason })
    setLines(prev => prev.map(l => l.name === lineName ? { ...l, reconciliation_status: 'Exception' } : l))
  }

  const summaryRows  = summary?.summary ?? []
  const unmatched    = summaryRows.find(r => r.reconciliation_status === 'Unmatched')?.cnt ?? 0

  return (
    <div className="space-y-5">
      <PageHeader title="Bank Reconciliation" subtitle="Match bank statement lines to payment entries" />

      {error && <ErrorBox message={error} />}

      {/* Controls */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">Bank Account</label>
            <input className={inputCls} value={account} onChange={e => setAccount(e.target.value)} placeholder="e.g. BOV Current Account" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">From</label>
            <input type="date" className={inputCls} value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">To</label>
            <input type="date" className={inputCls} value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">Status</label>
            <select className={selectCls} value={statusFilter} onChange={e => setSF(e.target.value)}>
              <option value="">All</option>
              <option>Unmatched</option>
              <option>Auto-Matched</option>
              <option>Reconciled</option>
              <option>Exception</option>
            </select>
          </div>
          <Btn onClick={loadLines} disabled={!account || loading}>Load</Btn>
        </div>
      </div>

      {/* Summary chips */}
      {summary && (
        <div className="flex flex-wrap gap-3 items-center">
          {summaryRows.map(r => (
            <div key={r.reconciliation_status} className="bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-center min-w-[120px]">
              <div className="text-xl font-bold text-gray-900">{r.cnt}</div>
              <div className={`text-[10px] font-bold px-2 py-0.5 rounded mt-1 inline-block ${STATUS_COLOR[r.reconciliation_status] ?? 'bg-gray-100 text-gray-500'}`}>
                {r.reconciliation_status}
              </div>
            </div>
          ))}
          {unmatched > 0 && (
            <Btn variant="ghost" onClick={autoMatch} disabled={loading}>
              Auto-Match ({unmatched} pending)
            </Btn>
          )}
        </div>
      )}

      {importMsg && (
        <div className="rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{importMsg}</div>
      )}

      {/* CSV Import */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">Import CSV</h3>
        <p className="text-xs text-gray-500">Paste bank CSV with headers: date, description, debit, credit, balance, reference</p>
        <textarea
          className={`${inputCls} h-28 font-mono text-xs`}
          value={csvText}
          onChange={e => setCsvText(e.target.value)}
          placeholder={"date,description,debit,credit,balance,reference\n2026-04-01,Payment from John,0,500.00,1500.00,REF001"}
        />
        <Btn onClick={importCsv} disabled={!account || !csvText.trim()}>Import</Btn>
      </div>

      {/* Lines table */}
      {lines.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Statement Lines ({lines.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-gray-200 text-[10px] uppercase tracking-wider text-gray-400">
                  <th className="text-left px-3 py-2">Date</th>
                  <th className="text-left px-3 py-2">Description</th>
                  <th className="text-left px-3 py-2">Ref</th>
                  <th className="text-right px-3 py-2">Credit (In)</th>
                  <th className="text-right px-3 py-2">Debit (Out)</th>
                  <th className="text-center px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Matched To</th>
                  <th className="text-center px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lines.map(l => (
                  <tr key={l.name} className="hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDate(l.transaction_date)}</td>
                    <td className="px-3 py-2 max-w-[200px] truncate text-gray-600" title={l.description}>{l.description}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-gray-400">{l.reference_number}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-green-700 font-semibold">{l.credit > 0 ? fmtMoney(l.credit) : ''}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-600 font-semibold">{l.debit > 0 ? fmtMoney(l.debit) : ''}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${STATUS_COLOR[l.reconciliation_status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {l.reconciliation_status}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-gray-500">{l.matched_document}</td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex gap-1 justify-center">
                        {l.reconciliation_status === 'Auto-Matched' && (
                          <button onClick={() => confirmMatch(l.name, l.matched_document ?? '')}
                            className="text-[10px] px-2 py-0.5 rounded bg-green-100 text-green-700 hover:bg-green-200">
                            Confirm
                          </button>
                        )}
                        {['Unmatched', 'Auto-Matched'].includes(l.reconciliation_status) && (
                          <button onClick={() => markException(l.name)}
                            className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200">
                            Exception
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
