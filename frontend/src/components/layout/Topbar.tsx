import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'

export function Topbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <header className="h-11 bg-white border-b border-gray-200 flex items-center justify-end px-4 gap-3 flex-shrink-0">
      <span className="text-sm text-gray-600">{user?.full_name ?? user?.name}</span>
      <button
        onClick={handleLogout}
        className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
      >
        Sign out
      </button>
    </header>
  )
}
