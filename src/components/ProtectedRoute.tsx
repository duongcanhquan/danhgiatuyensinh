import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { ProfileSyncBlocked } from './ProfileSyncBlocked'
import { getFirebaseAuth, isFirebaseConfigured } from '../services/firebase'
import { useAuth } from '../hooks/useAuth'

/**
 * Chặn route khi chưa đăng nhập (Firebase Auth đã cấu hình).
 * Khi không có Firebase: cho qua (chế độ demo / dev synthetic).
 */
export function ProtectedRoute() {
  const { status, firebaseUser, profile } = useAuth()
  const location = useLocation()
  const hasAuth = Boolean(isFirebaseConfigured() && getFirebaseAuth())

  if (!hasAuth) {
    return <Outlet />
  }

  if (status === 'unknown') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-600">
        <div className="app-glass-panel rounded-2xl px-8 py-6 text-sm shadow-lg">Đang xác thực…</div>
      </div>
    )
  }

  if (!firebaseUser) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (status === 'authenticating') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-600">
        <div className="app-glass-panel rounded-2xl px-8 py-6 text-sm shadow-lg">Đang tải hồ sơ người dùng…</div>
      </div>
    )
  }

  if (!profile) {
    return <ProfileSyncBlocked />
  }

  return <Outlet />
}
