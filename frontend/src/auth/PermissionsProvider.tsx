import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { frappe } from '../api/frappe'
import { useAuth } from './AuthProvider'
import { hasRole, ROLE_GROUPS } from '../constants/roles'

interface PermissionsContextValue {
  roles: string[]
  loading: boolean
  hasRoles: (...roleNames: string[]) => boolean
  can: (group: string) => boolean
}

const PermissionsContext = createContext<PermissionsContextValue | null>(null)

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()

  const [fallbackRoles, setFallbackRoles] = useState<string[] | null>(null)
  const [fallbackLoading, setFallbackLoading] = useState(false)

  // Primary roles come from AuthProvider (synchronous — no effect delay)
  const primaryRoles = useMemo(() => {
    if (!user || !Array.isArray(user.roles)) return null
    return user.roles.filter(Boolean)
  }, [user])

  // If primary roles empty, fire a single fallback fetch
  useEffect(() => {
    if (!user || fallbackRoles !== null || fallbackLoading) return
    if (primaryRoles === null) return
    if (primaryRoles.length > 0) return

    setFallbackLoading(true)
    frappe
      .callGet<{ roles?: string[]; csrf_token?: string }>('casamoderna_dms.session_api.get_my_roles')
      .then((res) => {
        const roles = Array.isArray(res?.roles) ? res.roles.filter(Boolean) : []
        if (res?.csrf_token) window.csrf_token = res.csrf_token
        setFallbackRoles(roles)
      })
      .catch(() => setFallbackRoles([]))
      .finally(() => setFallbackLoading(false))
  }, [user, primaryRoles, fallbackRoles, fallbackLoading])

  const roles = useMemo(() => {
    if (primaryRoles === null) return []
    if (primaryRoles.length > 0) return primaryRoles
    if (fallbackRoles !== null) return fallbackRoles
    return []
  }, [primaryRoles, fallbackRoles])

  const loading =
    user === undefined ||
    primaryRoles === null ||
    (primaryRoles.length === 0 && fallbackLoading)

  const hasRoles = useCallback((...roleNames: string[]) => hasRole(roles, ...roleNames), [roles])

  const can = useCallback(
    (group: string) => {
      const allowed = ROLE_GROUPS[group]
      if (!allowed) return false
      return hasRole(roles, ...allowed)
    },
    [roles],
  )

  const value = useMemo(
    () => ({ roles, loading, hasRoles, can }),
    [roles, loading, hasRoles, can],
  )

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>
}

export function usePermissions(): PermissionsContextValue {
  const ctx = useContext(PermissionsContext)
  if (!ctx) throw new Error('usePermissions must be used inside PermissionsProvider')
  return ctx
}
