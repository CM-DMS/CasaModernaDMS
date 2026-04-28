import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthProvider'

export function ProtectedRoute() {
  const { user } = useAuth()

  // still loading session
  if (user === undefined) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-500">
        Loading…
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  return <Outlet />
}
