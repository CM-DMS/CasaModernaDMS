import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { frappe } from '../api/frappe'

const INACTIVITY_MS = 30 * 60 * 1000

export interface AuthUser {
  name: string
  full_name: string
  email?: string
  roles: string[]
  sales_person: string | null
}

interface SessionResponse {
  user?: string
  roles?: string[]
  csrf_token?: string | null
  sales_person?: string | null
}

interface UserDoc {
  full_name?: string
  email?: string
}

interface AuthContextValue {
  user: AuthUser | null | undefined
  login: (usr: string, pwd: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function readCookie(name: string): string | null {
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.split('=')[1]) : null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hydrateUser = useCallback(async (userId: string) => {
    const [docResult, sessionResult] = await Promise.allSettled([
      frappe.getDoc<UserDoc>('User', userId),
      frappe.callGet<SessionResponse>('casamoderna_dms.session_api.get_my_roles'),
    ])

    const doc = docResult.status === 'fulfilled' ? docResult.value : null
    const session = sessionResult.status === 'fulfilled' ? sessionResult.value : null

    if (session?.csrf_token) window.csrf_token = session.csrf_token

    setUser({
      name: userId,
      full_name: doc?.full_name ?? userId,
      email: doc?.email,
      roles: Array.isArray(session?.roles) ? session.roles.filter(Boolean) : [],
      sales_person: session?.sales_person ?? null,
    })
  }, [])

  useEffect(() => {
    const userId = readCookie('user_id')
    if (userId && userId !== 'Guest') {
      hydrateUser(userId)
    } else {
      frappe
        .callGet<SessionResponse>('casamoderna_dms.session_api.get_my_roles')
        .then((session) => {
          if (session?.csrf_token) window.csrf_token = session.csrf_token
          if (session?.user && session.user !== 'Guest') {
            hydrateUser(session.user)
          } else {
            setUser(null)
          }
        })
        .catch(() => setUser(null))
    }
  }, [hydrateUser])

  // Inactivity timer
  useEffect(() => {
    if (!user) {
      if (timerRef.current) clearTimeout(timerRef.current)
      return
    }

    const reset = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(async () => {
        await frappe.call('logout').catch(() => {})
        setUser(null)
      }, INACTIVITY_MS)
    }

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'click', 'scroll'] as const
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    reset()

    return () => {
      events.forEach((e) => window.removeEventListener(e, reset))
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [user])

  const login = async (usr: string, pwd: string): Promise<void> => {
    await frappe.call('login', { usr, pwd })
    const userId = readCookie('user_id')
    if (userId && userId !== 'Guest') {
      await hydrateUser(userId)
    }
  }

  const logout = async (): Promise<void> => {
    await frappe.call('logout').catch(() => {})
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside <AuthProvider>')
  return ctx
}
