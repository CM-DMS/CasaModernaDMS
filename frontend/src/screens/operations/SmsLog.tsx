/**
 * SmsLog — SMS delivery report screen.
 *
 * Route: /operations/sms-log
 */
import { useState, useEffect, useCallback } from 'react'
import { smsApi, type SmsLogRow } from '../../api/operations'
import { PageHeader, DetailSection, Btn, inputCls } from '../../components/shared/ui'
import { CM } from '../../components/ui/CMClassNames'

const today = () => new Date().toISOString().slice(0, 10)

const thirtyDaysAgo = () => {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
}

function fmtDatetime(dt?: string) {
  if (!dt) return '—'
  const d = new Date(dt.replace(' ', 'T'))
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function StatusBadge({ status }: { status?: string }) {
  const cls = status === 'Sent'
    ? 'bg-green-100 text-green-800'
    : 'bg-red-100 text-red-700'
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}>
      {status === 'Sent' ? '✓ Sent' : '✗ Failed'}
    </span>
  )
}

function TypeBadge({ type }: { type?: string }) {
  const cls = type === 'Delivery'
    ? 'bg-sky-100 text-sky-800'
    : 'bg-purple-100 text-purple-800'
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${cls}`}>
      {type === 'Delivery' ? '🚚 Delivery' : '📅 Consultation'}
    </span>
  )
}

export function SmsLog() {
  const [rows,     setRows]     = useState<SmsLogRow[]>([])
  const [loading,  setLoading]  = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const [fromDate, setFromDate] = useState(thirtyDaysAgo())
  const [toDate,   setToDate]   = useState(today())
  const [smsType,  setSmsType]  = useState('')
  const [status,   setStatus]   = useState('')
  const [customer, setCustomer] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setExpanded(null)
    try {
      const data = await smsApi.getLog({
        from_date: fromDate,
        to_date:   toDate,
        sms_type:  smsType   || undefined,
        status:    status    || undefined,
        customer:  customer  || undefined,
      })
      setRows(Array.isArray(data) ? (data as SmsLogRow[]) : [])
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [fromDate, toDate, smsType, status, customer])

  // Load on mount only (manual refresh via button)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  const sentCount   = rows.filter((r) => r.status === 'Sent').length
  const failedCount = rows.filter((r) => r.status !== 'Sent').length

  return (
    <div className="space-y-4">
      <PageHeader
        title="SMS Delivery Report"
        subtitle={loading ? 'Loading…' : `${rows.length} message${rows.length !== 1 ? 's' : ''}`}
        actions={<Btn onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</Btn>}
      />

      <DetailSection title="Filters">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <div>
            <label className={CM.label}>From</label>
            <input type="date" className={inputCls} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <label className={CM.label}>To</label>
            <input type="date" className={inputCls} value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <div>
            <label className={CM.label}>Type</label>
            <select className={CM.select} value={smsType} onChange={(e) => setSmsType(e.target.value)}>
              <option value="">All Types</option>
              <option value="Delivery">Delivery</option>
              <option value="Consultation">Consultation</option>
            </select>
          </div>
          <div>
            <label className={CM.label}>Status</label>
            <select className={CM.select} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="Sent">Sent</option>
              <option value="Failed">Failed</option>
            </select>
          </div>
          <div>
            <label className={CM.label}>&nbsp;</label>
            <Btn onClick={load} disabled={loading}>Apply</Btn>
          </div>
        </div>
      </DetailSection>

      {rows.length > 0 && (
        <div className="flex gap-4 px-1 text-sm">
          <span className="text-green-700 font-medium">✓ {sentCount} sent</span>
          {failedCount > 0 && <span className="text-red-600 font-medium">✗ {failedCount} failed</span>}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 rounded-full border-4 border-green-500 border-t-transparent animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">No SMS records found for the selected filters.</div>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                <th className="text-left px-4 py-3">Sent At</th>
                <th className="text-left px-3 py-3">Type</th>
                <th className="text-left px-3 py-3">Status</th>
                <th className="text-left px-3 py-3">Customer</th>
                <th className="text-left px-3 py-3">Recipient</th>
                <th className="text-left px-3 py-3">Reference</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <>
                  <tr
                    key={row.name}
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => setExpanded(expanded === row.name ? null : row.name)}
                  >
                    <td className="px-4 py-2.5 whitespace-nowrap text-gray-700">{fmtDatetime(row.sent_at)}</td>
                    <td className="px-3 py-2.5"><TypeBadge type={row.sms_type} /></td>
                    <td className="px-3 py-2.5"><StatusBadge status={row.status} /></td>
                    <td className="px-3 py-2.5 font-medium text-gray-900">{row.customer_name || row.customer || '—'}</td>
                    <td className="px-3 py-2.5 font-mono text-gray-600 text-[11px]">{row.recipient}</td>
                    <td className="px-3 py-2.5 text-gray-500 text-[11px]">{row.reference_name || '—'}</td>
                    <td className="px-3 py-2.5 text-gray-400 text-[11px] text-right">{expanded === row.name ? '▲' : '▼'}</td>
                  </tr>
                  {expanded === row.name && (
                    <tr key={`${row.name}-detail`} className="border-b border-gray-200 bg-gray-50">
                      <td colSpan={7} className="px-4 py-3">
                        <div className="text-[11px] space-y-2">
                          <div>
                            <span className="font-semibold text-gray-500 uppercase tracking-wider text-[10px]">Message</span>
                            <p className="mt-1 text-gray-800 whitespace-pre-wrap">{row.message}</p>
                          </div>
                          {row.error_message && (
                            <div>
                              <span className="font-semibold text-red-500 uppercase tracking-wider text-[10px]">Error</span>
                              <p className="mt-1 text-red-700 font-mono whitespace-pre-wrap">{row.error_message}</p>
                            </div>
                          )}
                          <div className="text-gray-400 font-mono">{row.name}</div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
