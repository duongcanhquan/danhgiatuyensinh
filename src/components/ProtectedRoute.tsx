import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { ProfileSyncBlocked } from './ProfileSyncBlocked'
import { AuthSessionBootScreen, useAuthBootMinHold } from './AuthSessionBootScreen'
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

  const bootBusy =
    status === 'unknown' ||
    status === 'authenticating' ||
    (Boolean(profile) && orgGate.state === 'loading')
  const showBoot = useAuthBootMinHold(bootBusy, {
    skip: status !== 'unknown' && !firebaseUser,
  })

  if (!hasAuth) {
    return <Outlet />
  }

  if (showBoot && (status === 'unknown' || Boolean(firebaseUser))) {
    const label =
      status === 'authenticating'
        ? 'Đang đồng bộ hồ sơ và quyền truy cập'
        : orgGate.state === 'loading'
          ? 'Đang kiểm tra quyền truy cập trường'
          : 'Đang mở phiên làm việc'
    return (
      <AuthSessionBootScreen
        statusLabel={label}
        detail={
          status === 'authenticating'
            ? 'Đăng nhập thành công, hệ thống đang đọc hồ sơ nhân sự.'
            : undefined
        }
        actions={
          status === 'authenticating' ? (
            <button
              type="button"
              className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white/90 backdrop-blur transition hover:bg-white/15"
              onClick={() => void signOut()}
            >
              Đăng xuất
            </button>
          ) : null
        }
      />
    )
  }

  if (!firebaseUser) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
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
