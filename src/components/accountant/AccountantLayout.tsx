import { NavLink, Outlet } from 'react-router-dom'
import { FileSpreadsheet, LogOut, Users, Wallet } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { canManageAccountantStaff } from '../../auth/accountantPortal'

function navClass(isActive: boolean) {
  return [
    'flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[11px] font-bold transition sm:min-h-0 sm:flex-none sm:flex-row sm:gap-2 sm:rounded-xl sm:px-3 sm:py-2.5 sm:text-sm',
    isActive
      ? 'bg-indigo-600 text-white shadow-sm'
      : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-900',
  ].join(' ')
}

export function AccountantLayout() {
  const { profile, signOut, can } = useAuth()
  const canStaff = canManageAccountantStaff(can)

  return (
    <div className="flex min-h-[100dvh] flex-col bg-gradient-to-br from-indigo-50 via-white to-slate-100">
      <header className="sticky top-0 z-30 border-b border-indigo-200/80 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-2 px-3 py-2.5 sm:px-6 sm:py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 sm:text-xs">
              VietMy · Kế toán
            </p>
            <h1 className="truncate text-base font-extrabold text-indigo-900 sm:text-xl">Duyệt thu</h1>
            <p className="truncate text-[11px] text-slate-600 sm:text-xs">
              {profile?.displayName || profile?.email || '—'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 active:bg-slate-50 sm:gap-2"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            <span>Thoát</span>
          </button>
        </div>
        {/* Desktop / tablet top nav */}
        <nav className="mx-auto hidden max-w-[1800px] gap-1 px-4 pb-3 sm:flex sm:px-6">
          <NavLink to="/ke-toan" end className={({ isActive }) => navClass(isActive)}>
            <Wallet className="h-4 w-4" aria-hidden />
            Duyệt thu
          </NavLink>
          {canStaff ? (
            <NavLink to="/ke-toan/nhan-su" className={({ isActive }) => navClass(isActive)}>
              <Users className="h-4 w-4" aria-hidden />
              Kế toán viên
            </NavLink>
          ) : null}
          <NavLink to="/ke-toan/bao-cao" className={({ isActive }) => navClass(isActive)}>
            <FileSpreadsheet className="h-4 w-4" aria-hidden />
            Báo cáo
          </NavLink>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-[1800px] flex-1 px-2 pb-[calc(4.75rem+env(safe-area-inset-bottom))] pt-3 sm:px-4 sm:pb-6">
        <Outlet />
      </main>

      {/* Mobile bottom nav — thao tác bằng ngón cái */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-indigo-200/90 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(15,23,42,0.08)] backdrop-blur sm:hidden"
        aria-label="Điều hướng cổng kế toán"
      >
        <div className="flex items-stretch gap-1 px-2 py-1.5">
          <NavLink to="/ke-toan" end className={({ isActive }) => navClass(isActive)}>
            <Wallet className="h-5 w-5" aria-hidden />
            Duyệt thu
          </NavLink>
          {canStaff ? (
            <NavLink to="/ke-toan/nhan-su" className={({ isActive }) => navClass(isActive)}>
              <Users className="h-5 w-5" aria-hidden />
              Nhân sự
            </NavLink>
          ) : null}
          <NavLink to="/ke-toan/bao-cao" className={({ isActive }) => navClass(isActive)}>
            <FileSpreadsheet className="h-5 w-5" aria-hidden />
            Báo cáo
          </NavLink>
        </div>
      </nav>
    </div>
  )
}
