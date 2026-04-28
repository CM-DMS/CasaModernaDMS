import { useState, useCallback, useEffect } from 'react'
import { PageHeader } from '../../components/shared/ui'
import { CM } from '../../components/ui/CMClassNames'
import { frappe } from '../../api/frappe'

interface BackupItem {
  filename: string
  date: string
  size: string
}
interface Component {
  key: string
  icon: string
  label: string
}

function SummaryCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  const colors: Record<string, string> = {
    indigo:  'bg-indigo-50 text-indigo-700 border-indigo-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    violet:  'bg-violet-50 text-violet-700 border-violet-200',
  }
  return (
    <div className={`rounded-lg border p-4 ${colors[color] ?? colors.indigo}`}>
      <div className="text-xs uppercase tracking-wider opacity-70 mb-1">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  )
}

export function BackupRestore() {
  const [backups, setBackups]     = useState<BackupItem[]>([])
  const [loading, setLoading]     = useState(true)
  const [running, setRunning]     = useState(false)
  const [message, setMessage]     = useState<{ type: string; text: string } | null>(null)
  const [diskInfo, setDiskInfo]   = useState<{ free: string } | null>(null)
  const [restoreTarget, setRestoreTarget]     = useState<string | null>(null)
  const [restoreComponents, setRestoreComponents] = useState<Component[]>([])
  const [selectedComponents, setSelectedComponents] = useState<string[]>([])
  const [restoreSite, setRestoreSite]   = useState('staging')
  const [restoring, setRestoring]       = useState(false)
  const [restoreLog, setRestoreLog]     = useState<string | null>(null)

  const loadBackups = useCallback(async () => {
    setLoading(true)
    try {
      const res = await frappe.callGet<{ backups: BackupItem[]; disk: { free: string } }>('casamoderna_dms.backup_api.list_backups')
      setBackups((res as { backups?: BackupItem[] }).backups ?? [])
      setDiskInfo((res as { disk?: { free: string } }).disk ?? null)
    } catch (e: unknown) {
      setMessage({ type: 'error', text: (e as Error).message || 'Failed to load backups' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadBackups() }, [loadBackups])

  const handleCreateBackup = async () => {
    if (!window.confirm('Create a full system backup now? This may take a minute.')) return
    setRunning(true)
    setMessage(null)
    try {
      const res = await frappe.call<{ archive: string; size: string }>('casamoderna_dms.backup_api.create_backup')
      setMessage({ type: 'success', text: `Backup created: ${(res as { archive?: string }).archive} (${(res as { size?: string }).size})` })
      await loadBackups()
    } catch (e: unknown) {
      setMessage({ type: 'error', text: (e as Error).message || 'Backup failed' })
    } finally {
      setRunning(false)
    }
  }

  const handleDownload = (filename: string) => {
    window.open(`/api/v2/method/casamoderna_dms.backup_api.download_backup?filename=${encodeURIComponent(filename)}`, '_blank')
  }

  const handleDelete = async (filename: string) => {
    if (!window.confirm(`Delete backup "${filename}"? This cannot be undone.`)) return
    try {
      await frappe.call('casamoderna_dms.backup_api.delete_backup', { filename })
      setMessage({ type: 'success', text: `Deleted: ${filename}` })
      if (restoreTarget === filename) closeRestorePanel()
      await loadBackups()
    } catch (e: unknown) {
      setMessage({ type: 'error', text: (e as Error).message || 'Delete failed' })
    }
  }

  const handleInspect = async (filename: string) => {
    setRestoreLog(null)
    setMessage(null)
    try {
      const res = await frappe.callGet<{ components: Component[] }>('casamoderna_dms.backup_api.inspect_backup', { filename })
      setRestoreTarget(filename)
      setRestoreComponents((res as { components?: Component[] }).components ?? [])
      setSelectedComponents([])
      setRestoreSite('staging')
    } catch (e: unknown) {
      setMessage({ type: 'error', text: (e as Error).message || 'Failed to inspect archive' })
    }
  }

  const closeRestorePanel = () => {
    setRestoreTarget(null)
    setRestoreComponents([])
    setSelectedComponents([])
    setRestoreLog(null)
  }

  const toggleComponent = (key: string) => {
    setSelectedComponents((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key])
  }

  const handleRestore = async () => {
    if (selectedComponents.length === 0) {
      setMessage({ type: 'error', text: 'Select at least one component to restore.' })
      return
    }
    const isProduction = restoreSite === 'production'
    const compList = selectedComponents.join(', ')
    if (isProduction) {
      const input = window.prompt(`⚠️ PRODUCTION RESTORE ⚠️\n\nYou are about to restore to the LIVE production site.\n\nArchive: ${restoreTarget}\nComponents: ${compList}\n\nType "RESTORE" to confirm:`)
      if (input !== 'RESTORE') {
        setMessage({ type: 'error', text: 'Production restore cancelled.' })
        return
      }
    } else {
      if (!window.confirm(`Restore to staging?\n\nArchive: ${restoreTarget}\nComponents: ${compList}\n\nProceed?`)) return
    }
    setRestoring(true)
    setRestoreLog(null)
    setMessage(null)
    try {
      const res = await frappe.call<{ output: string; components: string[]; target: string }>(
        'casamoderna_dms.backup_api.restore_backup',
        { filename: restoreTarget, components: JSON.stringify(selectedComponents), target: restoreSite }
      )
      setRestoreLog((res as { output?: string }).output ?? 'Restore completed.')
      const comps = (res as { components?: string[] }).components ?? []
      const target = (res as { target?: string }).target ?? restoreSite
      setMessage({ type: 'success', text: `Restore complete — ${comps.join(', ')} restored to ${target}.` })
    } catch (e: unknown) {
      setMessage({ type: 'error', text: (e as Error).message || 'Restore failed' })
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div>
      <PageHeader title="Backup & Restore" subtitle="Full system backups — database, source code, files, configs" />

      {message && (
        <div className={`mx-4 mb-4 px-4 py-3 rounded text-sm ${
          message.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
        }`}>
          {message.text}
          <button onClick={() => setMessage(null)} className="float-right font-bold">×</button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mx-4 mb-6">
        <SummaryCard label="Total Backups" value={backups.length} color="indigo" />
        <SummaryCard label="Latest Backup" value={backups.length > 0 ? backups[0].date : '—'} color="emerald" />
        <SummaryCard label="Disk Free" value={diskInfo?.free || '—'} color="violet" />
      </div>

      <div className="flex items-center gap-3 mx-4 mb-6">
        <button onClick={handleCreateBackup} disabled={running} className={CM.btn.primary}>
          {running ? '⏳ Creating Backup…' : '💾 Create Backup Now'}
        </button>
        <button onClick={loadBackups} disabled={loading} className={CM.btn.secondary}>🔄 Refresh</button>
      </div>

      <div className="mx-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Archive</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
              ) : backups.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No backups found.</td></tr>
              ) : backups.map((b) => (
                <tr key={b.filename} className={`hover:bg-gray-50 ${restoreTarget === b.filename ? 'bg-amber-50' : ''}`}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{b.filename}</td>
                  <td className="px-4 py-3 text-gray-600">{b.date}</td>
                  <td className="px-4 py-3 text-gray-600">{b.size}</td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button onClick={() => handleInspect(b.filename)} className="text-amber-600 hover:text-amber-800 text-xs font-medium">🔄 Restore</button>
                    <button onClick={() => handleDownload(b.filename)} className="text-indigo-600 hover:text-indigo-800 text-xs font-medium">⬇ Download</button>
                    <button onClick={() => handleDelete(b.filename)} className="text-red-500 hover:text-red-700 text-xs font-medium">🗑 Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {restoreTarget && (
        <div className="mx-4 mb-6 border-2 border-amber-300 rounded-lg bg-amber-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-amber-100 border-b border-amber-200">
            <h3 className="text-sm font-semibold text-amber-900">
              Restore from: <span className="font-mono">{restoreTarget}</span>
            </h3>
            <button onClick={closeRestorePanel} className="text-amber-700 hover:text-amber-900 text-lg font-bold">×</button>
          </div>
          <div className="p-4">
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-700 mb-2">Restore Target</label>
              <div className="flex gap-3">
                {(['staging', 'production'] as const).map((site) => (
                  <label key={site} className={`flex items-center gap-2 px-3 py-2 rounded border cursor-pointer text-sm ${
                    restoreSite === site ? (site === 'staging' ? 'bg-blue-50 border-blue-300 text-blue-800' : 'bg-red-50 border-red-300 text-red-800') : 'bg-white border-gray-200 text-gray-600'
                  }`}>
                    <input type="radio" name="restore-target" value={site} checked={restoreSite === site} onChange={() => setRestoreSite(site)} />
                    {site === 'staging' ? '🧪 Staging (safe)' : '🔴 Production (dangerous)'}
                  </label>
                ))}
              </div>
            </div>
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-gray-700">Select Components to Restore</label>
                <div className="flex gap-2">
                  <button onClick={() => setSelectedComponents(restoreComponents.map((c) => c.key))} className="text-xs text-indigo-600 hover:underline">Select All</button>
                  <span className="text-gray-300">|</span>
                  <button onClick={() => setSelectedComponents([])} className="text-xs text-indigo-600 hover:underline">Clear</button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {restoreComponents.map((comp) => (
                  <label key={comp.key} className={`flex items-center gap-2 px-3 py-2 rounded border cursor-pointer text-sm transition-colors ${
                    selectedComponents.includes(comp.key) ? 'bg-amber-100 border-amber-400 text-amber-900' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                    <input type="checkbox" checked={selectedComponents.includes(comp.key)} onChange={() => toggleComponent(comp.key)} />
                    <span>{comp.icon}</span>
                    <span>{comp.label}</span>
                  </label>
                ))}
              </div>
            </div>
            {restoreSite === 'production' && (
              <div className="mb-4 px-4 py-3 bg-red-100 border border-red-300 rounded text-sm text-red-800">
                <strong>⚠️ Production Restore Warning:</strong> This will overwrite live data on the production site.
              </div>
            )}
            <div className="flex items-center gap-3">
              <button onClick={handleRestore} disabled={restoring || selectedComponents.length === 0}
                className={restoreSite === 'production' ? CM.btn.danger : CM.btn.primary}>
                {restoring ? '⏳ Restoring…' : `🔄 Restore ${selectedComponents.length} component${selectedComponents.length !== 1 ? 's' : ''} to ${restoreSite}`}
              </button>
              <button onClick={closeRestorePanel} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
            </div>
          </div>
          {restoreLog && (
            <div className="border-t border-amber-200 p-4">
              <h4 className="text-xs font-semibold text-gray-700 mb-2">Restore Output</h4>
              <pre className="bg-gray-900 text-green-400 text-xs p-3 rounded max-h-64 overflow-auto whitespace-pre-wrap font-mono">
                {restoreLog}
              </pre>
            </div>
          )}
        </div>
      )}

      <div className="mx-4 mt-2 p-4 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-500">
        <p className="font-semibold text-gray-700 mb-1">Automatic Backup Schedule</p>
        <p>Full system backup runs daily at <strong>02:00</strong> via cron. Retention: <strong>14 days</strong>.</p>
      </div>
    </div>
  )
}
