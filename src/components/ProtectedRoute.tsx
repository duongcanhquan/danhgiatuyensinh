import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { ProfileSyncBlocked } from './ProfileSyncBlocked'
import { getFirebaseAuth, isFirebaseConfigured } from '../services/firebase'
import { useAuth } from '../hooks/useAuth'
import { isAccountantOnlyUser } from '../auth/accountantPortal'

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
        <div className="app-glass-panel rounded-2xl px-8 py-6 text-sm shadow-lg">Hệ thống đang đăng nhập…</div>
      </div>
    )
  }

  if (!firebaseUser) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (status === 'authenticating') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 px-4 text-slate-600">
        <div className="app-glass-panel max-w-md rounded-2xl px-8 py-6 text-center text-sm shadow-lg">
          <p className="font-medium text-slate-800">Hệ thống đang đăng nhập…</p>
        </div>
      </div>
    )
  }

  if (!profile) {
    return <ProfileSyncBlocked />
  }

  if (isAccountantOnlyUser(profile)) {
    return <Navigate to="/ke-toan" replace />
  }

  return <Outlet />
}
