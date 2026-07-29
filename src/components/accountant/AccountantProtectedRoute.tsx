import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { ProfileSyncBlocked } from '../ProfileSyncBlocked'
import { getFirebaseAuth, isFirebaseConfigured } from '../../services/firebase'
import { useAuth } from '../../hooks/useAuth'
import { canAccessAccountantPortal } from '../../auth/accountantPortal'
import { useOrgAccessGate } from '../../hooks/useOrgAccessGate'

export function AccountantProtectedRoute() {
  const { status, firebaseUser, profile, can, signOut } = useAuth()
  const location = useLocation()
  const hasAuth = Boolean(isFirebaseConfigured() && getFirebaseAuth())
  const orgGate = useOrgAccessGate(profile)

  if (!hasAuth) {
    return <Outlet />
  }

  if (status === 'unknown') {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-emerald-50 text-slate-600">
        <div className="rounded-2xl bg-white px-8 py-6 text-sm shadow-lg">Đang xác thực…</div>
      </div>
    )
  }

  if (!firebaseUser) {
    return <Navigate to="/ke-toan/login" replace state={{ from: location.pathname }} />
  }

  if (status === 'authenticating') {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-emerald-50 text-slate-600">
        <div className="rounded-2xl bg-white px-8 py-6 text-sm shadow-lg">Đang tải hồ sơ kế toán…</div>
      </div>
    )
  }

  if (!profile) {
    return <ProfileSyncBlocked />
  }

  if (profile.isActive === false) {
    return (
      <div className="mx-auto max-w-lg p-8">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-rose-950">
          Tài khoản kế toán đã bị vô hiệu hóa. Liên hệ quản trị.
        </div>
      </div>
    )
  }

  if (!canAccessAccountantPortal(can, profile)) {
    return (
      <div className="mx-auto max-w-lg p-8">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-950">
          Tài khoản này không có quyền cổng kế toán. Dùng{' '}
          <a href="/login" className="font-semibold underline">
            đăng nhập CRM
          </a>{' '}
          nếu bạn là TVV / quản trị.
        </div>
      </div>
    )
  }

  if (orgGate.state === 'loading') {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-emerald-50 text-slate-600">
        <div className="rounded-2xl bg-white px-8 py-6 text-sm shadow-lg">Đang kiểm tra quyền truy cập…</div>
      </div>
    )
  }

  if (orgGate.state === 'blocked') {
    return (
      <div className="mx-auto max-w-lg p-8">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-950">
          <p className="font-semibold">Trường đang tạm ngưng</p>
          <p className="mt-2 text-sm">Không gian «{orgGate.orgName}» đang tạm dừng. Liên hệ Siêu quản trị nếu cần mở lại.</p>
          <button type="button" className="vm-btn vm-btn-secondary mt-4" onClick={() => void signOut()}>
            Đăng xuất
          </button>
        </div>
      </div>
    )
  }

  return <Outlet />
}
