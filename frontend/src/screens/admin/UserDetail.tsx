import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { PageHeader } from '../../components/shared/ui'
import { CM } from '../../components/ui/CMClassNames'
import { frappe } from '../../api/frappe'
import { usePermissions } from '../../auth/PermissionsProvider'
import { ROLES } from '../../constants/roles'
import { CertificateSection } from './CertificateSection'

interface UserDoc {
  name: string
  full_name: string
  email: string
  username: string
  enabled: number
  last_login: string
  roles: { role: string }[]
}

const ALL_ROLES = Object.values(ROLES)

function EnabledBadge({ enabled }: { enabled: number }) {
  return enabled ? (
    <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-800">Enabled</span>
  ) : (
    <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700">Disabled</span>
  )
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 text-blue-800 mr-1 mb-1">{role}</span>
  )
}

function RoleModal({ currentRoles, onSave, onClose, saving }: {
  currentRoles: string[]
  onSave: (roles: string[]) => void
  onClose: () => void
  saving: boolean
}) {
  const [selected, setSelected] = useState(() => new Set(currentRoles))
  const toggle = (role: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(role)) next.delete(role); else next.add(role)
      return next
    })
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-800">Assign Roles</h2>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {ALL_ROLES.map((role) => (
            <label key={role} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 hover:text-gray-900">
              <input type="checkbox" checked={selected.has(role)} onChange={() => toggle(role)}
                className="rounded border-gray-300 text-blue-600" />
              {role}
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} disabled={saving} className={CM.btn.secondary}>Cancel</button>
          <button onClick={() => onSave([...selected])} disabled={saving} className={CM.btn.primary}>
            {saving ? 'Saving…' : 'Save Roles'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function UserDetail() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { can }  = usePermissions()

  const [doc, setDoc]           = useState<UserDoc | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [showModal, setShowModal]   = useState(false)
  const [saving, setSaving]         = useState(false)
  const [saveError, setSaveError]   = useState<string | null>(null)
  const [resetting, setResetting]   = useState(false)
  const [resetMsg, setResetMsg]     = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    frappe.getDoc<UserDoc>('User', decodeURIComponent(id ?? ''))
      .then(setDoc)
      .catch((err: Error) => setError(err.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => { load() }, [load])

  const currentRoles = doc?.roles?.map((r) => r.role).filter(Boolean) ?? []

  const handleSaveRoles = async (newRoleNames: string[]) => {
    setSaving(true)
    setSaveError(null)
    try {
      const updatedDoc = { ...doc, roles: newRoleNames.map((role) => ({ role })) }
      const saved = await frappe.saveDoc<UserDoc>('User', updatedDoc as UserDoc)
      setDoc(saved)
      setShowModal(false)
    } catch (err: unknown) {
      setSaveError((err as Error).message || 'Failed to save roles')
    } finally {
      setSaving(false)
    }
  }

  const handleResetAuthenticator = async () => {
    setResetting(true)
    setResetMsg(null)
    try {
      await frappe.call('casamoderna_dms.otp_login_api.admin_reset_otp', { usr: doc?.name })
      setResetMsg({ ok: true, text: 'Authenticator reset. Setup email sent to user.' })
    } catch (err: unknown) {
      setResetMsg({ ok: false, text: (err as Error).message || 'Failed to reset authenticator.' })
    } finally {
      setResetting(false)
    }
  }

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading…</div>
  if (!doc) return <div className="p-8 text-sm text-red-600">{error || 'User not found'}</div>

  return (
    <div className="space-y-4">
      {showModal && (
        <RoleModal currentRoles={currentRoles} onSave={handleSaveRoles} onClose={() => setShowModal(false)} saving={saving} />
      )}

      <PageHeader
        title={doc.full_name || doc.name}
        subtitle={doc.email || doc.name}
        actions={
          <div className="flex gap-2">
            {can('canAdmin') && (
              <>
                <button onClick={() => setShowModal(true)} className={CM.btn.primary}>Assign Roles</button>
                <button onClick={handleResetAuthenticator} disabled={resetting} className={CM.btn.secondary}>
                  {resetting ? 'Sending…' : 'Reset Authenticator'}
                </button>
              </>
            )}
            <button onClick={() => navigate('/admin/users')} className={CM.btn.secondary}>← Back</button>
          </div>
        }
      />

      {saveError && <div className="text-sm text-red-600 px-1">{saveError}</div>}
      {resetMsg && (
        <div className={`text-sm px-1 ${resetMsg.ok ? 'text-green-700' : 'text-red-600'}`}>{resetMsg.text}</div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Account</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { label: 'Email',      value: doc.email || '—' },
            { label: 'Full Name',  value: doc.full_name || '—' },
            { label: 'Username',   value: doc.username || '—' },
            { label: 'Last Login', value: doc.last_login ? doc.last_login.slice(0, 16).replace('T', ' ') : '—' },
          ].map(({ label, value }) => (
            <div key={label}>
              <div className={CM.label}>{label}</div>
              <div className="text-sm text-gray-800">{value}</div>
            </div>
          ))}
          <div>
            <div className={CM.label}>Status</div>
            <EnabledBadge enabled={doc.enabled} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Assigned Roles</h3>
        {currentRoles.length === 0 ? (
          <div className="text-sm text-gray-400">No roles assigned.</div>
        ) : (
          <div className="flex flex-wrap">
            {currentRoles.map((role) => <RoleBadge key={role} role={role} />)}
          </div>
        )}
      </div>

      {can('canAdmin') && <CertificateSection user={doc.name} />}
    </div>
  )
}
