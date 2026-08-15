import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { ProfileSyncBlocked } from './ProfileSyncBlocked'
import { AuthSessionBootScreen } from './AuthSessionBootScreen'
import { getFirebaseAuth, isFirebaseConfigured } from '../services/firebase'
import { useAuth } from '../hooks/useAuth'
import { isAccountantOnlyUser } from '../auth/accountantPortal'
import { useOrgAccessGate } from '../hooks/useOrgAccessGate'

/**
 * Chặn route khi chưa đăng nhập (Firebase Auth đã cấu hình).
 * Khi không có Firebase: cho qua (chế độ demo / dev synthetic).
 */
export function ProtectedRoute() {
  const { status, firebaseUser, profile, signOut } = useAuth()
  const location = useLocation()
  const hasAuth = Boolean(isFirebaseConfigured() && getFirebaseAuth())
  const orgGate = useOrgAccessGate(profile)

  if (!hasAuth) {
    return <Outlet />
  }

  if (status === 'unknown') {
    return <AuthSessionBootScreen statusLabel="Đang mở phiên làm việc" />
  }

  if (!firebaseUser) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (status === 'authenticating') {
    return (
      <AuthSessionBootScreen
        statusLabel="Đang đồng bộ hồ sơ và quyền truy cập"
        detail="Đăng nhập thành công, hệ thống đang đọc hồ sơ nhân sự."
        actions={
          <button
            type="button"
            className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white/90 backdrop-blur transition hover:bg-white/15"
            onClick={() => void signOut()}
          >
            Đăng xuất
          </button>
        }
      />
    )
  }

  if (!profile) {
    return <ProfileSyncBlocked />
  }

  if (isAccountantOnlyUser(profile)) {
    return <Navigate to="/ke-toan" replace />
  }

  if (profile.isActive === false) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 px-4 text-slate-700">
        <div className="app-surface-elevated max-w-md rounded-2xl px-8 py-6 text-center text-sm">
          <p className="font-semibold text-slate-900">Tài khoản đã bị vô hiệu hóa</p>
          <p className="mt-2 text-slate-600">Liên hệ quản trị để được kích hoạt lại.</p>
        </div>
      </div>
    )
  }

  if (orgGate.state === 'loading') {
    return <AuthSessionBootScreen statusLabel="Đang kiểm tra quyền truy cập trường" />
  }

  if (orgGate.state === 'blocked') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 px-4 text-slate-700">
        <div className="app-surface-elevated max-w-md rounded-2xl px-8 py-6 text-center text-sm">
          <p className="font-semibold text-slate-900">Trường đang tạm ngưng hoặc đã xoá</p>
          <p className="mt-2 text-slate-600">
            Không gian «{orgGate.orgName}» đang tạm dừng / không còn hoạt động. Liên hệ Siêu quản trị nền tảng nếu cần
            mở lại.
          </p>
          <button type="button" className="vm-btn vm-btn-secondary mt-4" onClick={() => void signOut()}>
            Đăng xuất
          </button>
        </div>
      </div>
    )
  }

  return <Outlet />
}
