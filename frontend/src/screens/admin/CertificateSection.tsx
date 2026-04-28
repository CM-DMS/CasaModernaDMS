import { useState, useCallback } from 'react'
import { frappe } from '../../api/frappe'
import { CM } from '../../components/ui/CMClassNames'

interface CertRow {
  name: string
  device: string
  status: string
  expiry: string
}

interface GenerateResult {
  certificate_name: string
  expires: string
  export_password: string
  file_url: string
}

const DEVICE_OPTIONS = ['laptop', 'desktop', 'android', 'tablet']

function StatusBadge({ status }: { status: string }) {
  const color = status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${color}`}>
      {status}
    </span>
  )
}

function GenerateModal({ onGenerate, onClose, generating }: {
  onGenerate: (device: string, days: number) => void
  onClose: () => void
  generating: boolean
}) {
  const [device, setDevice] = useState('laptop')
  const [days, setDays]     = useState(365)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-800">Generate Certificate</h2>
        <div>
          <label className={CM.label}>Device Type</label>
          <select value={device} onChange={(e) => setDevice(e.target.value)} className={CM.select}>
            {DEVICE_OPTIONS.map((d) => (
              <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={CM.label}>Validity (days)</label>
          <input type="number" value={days} onChange={(e) => setDays(parseInt(e.target.value, 10) || 365)}
            min={30} max={730} className={CM.input} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} disabled={generating} className={CM.btn.secondary}>Cancel</button>
          <button onClick={() => onGenerate(device, days)} disabled={generating} className={CM.btn.primary}>
            {generating ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ResultModal({ result, onClose }: { result: GenerateResult; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-base font-semibold text-green-700">Certificate Generated</h2>
        <div className="space-y-2 text-sm">
          <div><span className="text-gray-500">Certificate:</span> <span className="font-medium">{result.certificate_name}</span></div>
          <div><span className="text-gray-500">Expires:</span> {result.expires}</div>
        </div>
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-3">
          <div className="text-xs font-medium text-amber-800 mb-1">Export Password</div>
          <code className="text-sm font-mono select-all bg-white px-2 py-1 rounded border border-amber-200 block">
            {result.export_password}
          </code>
          <div className="text-[11px] text-amber-700 mt-2">Copy this now. Send it to the user separately.</div>
        </div>
        <a href={result.file_url} className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          target="_blank" rel="noopener noreferrer">Download Certificate ZIP</a>
        <div className="flex justify-end pt-2">
          <button onClick={onClose} className={CM.btn.primary}>Done</button>
        </div>
      </div>
    </div>
  )
}

export function CertificateSection({ user }: { user: string }) {
  const [certs, setCerts]         = useState<CertRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [showGenerate, setShowGenerate] = useState(false)
  const [generating, setGenerating]     = useState(false)
  const [result, setResult]       = useState<GenerateResult | null>(null)
  const [error, setError]         = useState<string | null>(null)

  const loadCerts = useCallback(async () => {
    setLoading(true)
    try {
      const data = await frappe.call<CertRow[]>('casamoderna_dms.certificate_api.list_certificates', { user })
      setCerts(Array.isArray(data) ? data : [])
    } catch {
      setCerts([])
    } finally {
      setLoading(false)
    }
  }, [user])

  useState(() => { loadCerts() })

  const handleGenerate = async (device: string, days: number) => {
    setGenerating(true)
    setError(null)
    try {
      const res = await frappe.call<GenerateResult>('casamoderna_dms.certificate_api.generate_certificate', { user, device, days })
      setResult(res)
      setShowGenerate(false)
      loadCerts()
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to generate certificate')
    } finally {
      setGenerating(false)
    }
  }

  const handleRevoke = async (device: string) => {
    if (!window.confirm(`Revoke the "${device}" certificate? The user will lose access from this device.`)) return
    setError(null)
    try {
      await frappe.call('casamoderna_dms.certificate_api.revoke_certificate', { user, device })
      loadCerts()
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to revoke certificate')
    }
  }

  return (
    <>
      {showGenerate && (
        <GenerateModal onGenerate={handleGenerate} onClose={() => { setShowGenerate(false); setError(null) }} generating={generating} />
      )}
      {result && <ResultModal result={result} onClose={() => setResult(null)} />}

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-800">Device Certificates</h3>
          <button onClick={() => setShowGenerate(true)} className={CM.btn.primary}>Generate Certificate</button>
        </div>

        {error && <div className="text-sm text-red-600 mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

        {loading ? (
          <div className="text-sm text-gray-400">Loading certificates…</div>
        ) : certs.length === 0 ? (
          <div className="text-sm text-gray-400">No certificates issued for this user.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 uppercase">Device</th>
                  <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 uppercase">Expires</th>
                  <th className="text-right py-2 text-xs font-medium text-gray-500 uppercase" />
                </tr>
              </thead>
              <tbody>
                {certs.map((c) => (
                  <tr key={c.name} className="border-b border-gray-100 last:border-0">
                    <td className="py-2.5 pr-4 font-medium text-gray-800">{c.device}</td>
                    <td className="py-2.5 pr-4"><StatusBadge status={c.status} /></td>
                    <td className="py-2.5 pr-4 text-gray-600">{c.expiry}</td>
                    <td className="py-2.5 text-right">
                      {c.status === 'Active' && (
                        <button onClick={() => handleRevoke(c.device)} className="text-xs text-red-600 hover:text-red-800 font-medium">
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
