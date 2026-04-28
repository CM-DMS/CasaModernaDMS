/**
 * AdminDeskLogin — standalone admin-only login that lands directly in Frappe Desk.
 * Route: /admin-desk
 *
 * Security model:
 *   - mTLS (client certificate): only authorised machines can reach this URL at all.
 *   - login API: backend restricts to admin users.
 *   - No link to this route appears anywhere in the DMS navigation.
 *
 * Desktop shortcut:  deploy/admin-desk-shortcut.url
 * URL:               https://two.casamodernadms.eu/dms/admin-desk
 */
import { useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'

export function AdminDeskLogin() {
  const { login } = useAuth()
  const [usr,     setUsr]     = useState('')
  const [pwd,     setPwd]     = useState('')
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(usr, pwd)
      window.location.href = '/app/'
    } catch (err) {
      setError((err as Error).message || 'Invalid credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-9 h-9 rounded bg-cm-green flex items-center justify-center text-white font-bold text-base">
            CM
          </div>
          <span className="font-semibold text-lg text-gray-900">CasaModerna DMS</span>
        </div>

        {/* Card */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800 mb-1">Admin Desk Access</h2>
          <p className="text-xs text-gray-500 mb-5">
            Sign in with your admin credentials to open Frappe Desk.
          </p>

          {error && (
            <div className="mb-4 px-3 py-2 rounded bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Username
              </label>
              <input
                type="text"
                autoComplete="username"
                value={usr}
                onChange={(e) => setUsr(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cm-green"
                required
                disabled={loading}
                autoFocus
                placeholder="username"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cm-green"
                required
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !usr || !pwd}
              className="w-full bg-cm-green hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-2 rounded transition-colors mt-1"
            >
              {loading ? 'Signing in…' : 'Open Frappe Desk →'}
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-4">
          Restricted access · Authorised administrators only
        </p>
      </div>
    </div>
  )
}
