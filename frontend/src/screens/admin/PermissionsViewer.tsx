import { useState, useEffect, useCallback } from 'react'
import { PageHeader } from '../../components/shared/ui'
import { CM } from '../../components/ui/CMClassNames'
import { frappe } from '../../api/frappe'
import { ROLE_GROUPS } from '../../constants/roles'

interface UserEntry {
  name: string
  full_name: string
  roles: string[]
  role_profile_name: string
}
interface PermData {
  users: UserEntry[]
  profiles: Record<string, string[]>
  docperms: Record<string, { doctype: string; select: number; read: number; write: number; create: number; delete: number; submit: number; cancel: number; amend: number }[]>
}

function RoleBadge({ role, small }: { role: string; small?: boolean }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-800 mr-1 mb-1 ${small ? 'text-[10px]' : 'text-[11px]'}`}>
      {role}
    </span>
  )
}

function ProfileBadge({ profile }: { profile: string }) {
  if (!profile) return <span className="text-xs text-gray-400 italic">No profile</span>
  return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-100 text-purple-800">{profile}</span>
  )
}

function UserRow({ user, profiles, onAssignProfile }: {
  user: UserEntry
  profiles: Record<string, string[]>
  onAssignProfile: (userName: string, profile: string) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [assigning, setAssigning] = useState(false)

  const userGroups = Object.entries(ROLE_GROUPS)
    .filter(([, roles]) => roles.some((r) => user.roles.includes(r)))
    .map(([group]) => group)

  const handleAssign = async (profileName: string) => {
    setAssigning(true)
    try {
      await onAssignProfile(user.name, profileName)
    } finally {
      setAssigning(false)
    }
  }

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <div className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(!expanded)}>
        <span className="text-sm w-5 text-gray-400">{expanded ? '▼' : '▶'}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900">{user.full_name || user.name}</div>
          <div className="text-xs text-gray-500">{user.name}</div>
        </div>
        <ProfileBadge profile={user.role_profile_name} />
        <div className="text-xs text-gray-400 w-16 text-right">{user.roles.length} roles</div>
      </div>

      {expanded && (
        <div className="px-10 pb-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-gray-600">Assign profile:</span>
            {Object.keys(profiles).map((p) => (
              <button key={p} disabled={assigning || user.role_profile_name === p}
                onClick={(e) => { e.stopPropagation(); handleAssign(p) }}
                className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                  user.role_profile_name === p
                    ? 'bg-purple-100 border-purple-300 text-purple-800 font-semibold'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-purple-50 hover:border-purple-200'
                } ${assigning ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                {p}
              </button>
            ))}
          </div>
          <div>
            <div className="text-xs font-medium text-gray-600 mb-1">Roles:</div>
            <div className="flex flex-wrap">{user.roles.map((r) => <RoleBadge key={r} role={r} />)}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-gray-600 mb-1">Feature access:</div>
            <div className="flex flex-wrap gap-1">
              {userGroups.map((g) => (
                <span key={g} className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-800">{g}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ProfilesTab({ profiles }: { profiles: Record<string, string[]> }) {
  return (
    <div className="space-y-4">
      {Object.entries(profiles).map(([name, roles]) => (
        <div key={name} className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-semibold text-gray-900">{name}</span>
            <span className="text-xs text-gray-400">{roles.length} roles</span>
          </div>
          <div className="flex flex-wrap">{roles.map((r) => <RoleBadge key={r} role={r} small />)}</div>
        </div>
      ))}
    </div>
  )
}

function DocPermsTab({ docperms }: { docperms: PermData['docperms'] }) {
  const [expandedRole, setExpandedRole] = useState<string | null>(null)

  return (
    <div className="space-y-2">
      {Object.entries(docperms).map(([role, perms]) => (
        <div key={role} className="bg-white rounded-lg border border-gray-200">
          <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50"
            onClick={() => setExpandedRole(expandedRole === role ? null : role)}>
            <span className="text-sm w-5 text-gray-400">{expandedRole === role ? '▼' : '▶'}</span>
            <span className="text-sm font-medium text-gray-900 flex-1">{role}</span>
            <span className="text-xs text-gray-400">{perms.length} doctypes</span>
          </div>
          {expandedRole === role && (
            <div className="px-4 pb-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b">
                    <th className="text-left py-1 font-medium">DocType</th>
                    {['Sel','Read','Write','Create','Del','Sub','Can','Amd'].map((h) => (
                      <th key={h} className="text-center py-1 font-medium w-12">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {perms.map((p) => (
                    <tr key={p.doctype} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-1 text-gray-700">{p.doctype}</td>
                      {(['select','read','write','create','delete','submit','cancel','amend'] as const).map((k) => (
                        <td key={k} className="text-center py-1">
                          {p[k] ? <span className="text-green-600">●</span> : <span className="text-gray-200">○</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export function PermissionsViewer() {
  const [data, setData]     = useState<PermData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)
  const [tab, setTab]       = useState('users')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await frappe.call<PermData>('casamoderna_dms.permissions_api.get_permissions_overview')
      setData(res)
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to load permissions')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleAssignProfile = async (user: string, profile: string) => {
    await frappe.call('casamoderna_dms.permissions_api.assign_role_profile', { user, profile })
    await load()
  }

  const tabs = [
    { key: 'users', label: 'Users & Roles' },
    { key: 'profiles', label: 'Role Profiles' },
    { key: 'docperms', label: 'Document Permissions' },
  ]

  return (
    <div>
      <PageHeader title="Permissions" />
      <div className="flex gap-1 px-4 mb-4">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              tab === t.key ? 'bg-cm-green text-white font-medium' : 'text-gray-600 hover:bg-gray-100'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mx-4 mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="px-4 py-8 text-center text-sm text-gray-400">Loading...</div>
      ) : !data ? (
        <div className="px-4 py-8 text-center text-sm text-red-500">Failed to load permissions data</div>
      ) : (
        <div className="px-4">
          {tab === 'users' && (
            <div>
              <div className="text-xs text-gray-500 mb-3">{data.users.length} enabled users. Click a user to see their roles.</div>
              <div className="bg-white rounded-lg border border-gray-200">
                {data.users.map((u) => (
                  <UserRow key={u.name} user={u} profiles={data.profiles} onAssignProfile={handleAssignProfile} />
                ))}
              </div>
            </div>
          )}
          {tab === 'profiles' && (
            <div>
              <div className="text-xs text-gray-500 mb-3">Role Profiles bundle multiple roles together.</div>
              <ProfilesTab profiles={data.profiles} />
            </div>
          )}
          {tab === 'docperms' && (
            <div>
              <div className="text-xs text-gray-500 mb-3">Custom Document Permissions for each role.</div>
              <DocPermsTab docperms={data.docperms} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
