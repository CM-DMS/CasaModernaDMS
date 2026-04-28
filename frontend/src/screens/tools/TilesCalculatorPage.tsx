import { useState, useCallback } from 'react'
import { StandaloneTilesCalculator } from '../../components/calculators/StandaloneTilesCalculator'
import type { CalcState } from '../../components/calculators/StandaloneTilesCalculator'
import { useAuth } from '../../auth/AuthProvider'
import { CM } from '../../components/ui/CMClassNames'

function lsGet<T>(key: string): T | null { try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null } }
function lsSet(key: string, val: unknown) { try { localStorage.setItem(key, JSON.stringify(val)) } catch {} }

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

interface Session {
  id: string; name: string; timestamp: string
  summary: { totalBoxes: number; sqmToQuote: number; totalFloorSqm: number }
  state: CalcState
}

export function TilesCalculatorPage() {
  const { user }    = useAuth()
  const sessionsKey = `tc:sessions:${(user as { name?: string })?.name || 'anon'}`

  const [sessions,     setSessions]     = useState<Session[]>(() => lsGet<Session[]>(sessionsKey) || [])
  const [currentState, setCurrentState] = useState<CalcState | null>(null)
  const [saveName,     setSaveName]     = useState('')
  const [loadKey,      setLoadKey]      = useState(0)
  const [loadData,     setLoadData]     = useState<CalcState | null>(null)

  const handleStateChange = useCallback((state: CalcState) => setCurrentState(state), [])

  const handleSave = () => {
    const name = saveName.trim()
    if (!name || !currentState?.res?.totalBoxes) return
    const session: Session = {
      id:        Date.now().toString(),
      name,
      timestamp: new Date().toISOString(),
      summary: {
        totalBoxes:    currentState.res.totalBoxes,
        sqmToQuote:    currentState.res.sqmToQuote,
        totalFloorSqm: currentState.res.totalFloorSqm,
      },
      state: currentState,
    }
    const updated = [session, ...sessions]
    setSessions(updated)
    lsSet(sessionsKey, updated)
    setSaveName('')
  }

  const handleLoad = (session: Session) => {
    setLoadData(session.state)
    setLoadKey(k => k + 1)
  }

  const handleDelete = (id: string) => {
    const updated = sessions.filter(s => s.id !== id)
    setSessions(updated)
    lsSet(sessionsKey, updated)
  }

  const canSave = saveName.trim().length > 0 && ((currentState?.res?.totalBoxes ?? 0) > 0)

  return (
    <div className="flex h-full overflow-hidden">
      {/* Calculator — left / full on mobile */}
      <div className="flex-1 overflow-y-auto p-3 md:p-4">
        <div className="max-w-2xl">
          <div className="mb-4">
            <h1 className="text-base font-semibold text-gray-800">Tiles Calculator</h1>
            <p className="text-[11px] text-gray-400 mt-0.5">boxes · contingency · skirting · contractor share</p>
          </div>
          <StandaloneTilesCalculator
            inline
            bare
            key={loadKey}
            initialData={loadData}
            onStateChange={handleStateChange}
          />
        </div>
      </div>

      {/* Saved sessions — right sidebar, lg+ only */}
      <div className="w-72 hidden lg:flex flex-col border-l border-gray-200 bg-white flex-shrink-0 overflow-hidden">
        {/* Save panel */}
        <div className="p-4 border-b border-gray-200">
          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">Save Calculation</div>
          <input type="text" placeholder="Name this calculation…" value={saveName}
            onChange={e => setSaveName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            className={CM.input} />
          <button type="button" onClick={handleSave} disabled={!canSave} className={`${CM.btn.primary} mt-2 w-full justify-center`}>
            Save
          </button>
          {(currentState?.res?.totalBoxes ?? 0) > 0 && (
            <div className="mt-2 text-[10px] text-gray-400">
              {currentState!.res.totalBoxes} boxes · {currentState!.res.totalFloorSqm?.toFixed(1)} m² floor
            </div>
          )}
        </div>

        {/* Sessions list */}
        <div className="flex-1 overflow-y-auto">
          {sessions.length === 0 ? (
            <div className="p-4 text-center text-[11px] text-gray-400 mt-4">
              <div className="text-2xl mb-2">📐</div>
              No saved calculations yet.<br />
              Fill in the calculator and save your work above.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {sessions.map(s => (
                <div key={s.id} className="px-4 py-3 hover:bg-gray-50 group transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-gray-800 truncate">{s.name}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{fmtDate(s.timestamp)}</div>
                      {s.summary.totalBoxes > 0 && (
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className="inline-flex items-center rounded-full border border-cm-green px-2 py-[1px] text-[10px] text-cm-green bg-cm-green-light font-semibold">
                            {s.summary.totalBoxes} boxes
                          </span>
                          <span className="text-[10px] text-gray-400">{s.summary.totalFloorSqm?.toFixed(1)} m²</span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button type="button" onClick={() => handleLoad(s)} className="text-[10px] text-cm-green hover:underline font-semibold">Load</button>
                      <button type="button" onClick={() => handleDelete(s.id)} className="text-[10px] text-gray-400 hover:text-red-500">Delete</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
