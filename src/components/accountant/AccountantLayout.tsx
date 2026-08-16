import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, LogOut, Wallet } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { ChangePasswordPanel } from '../ChangePasswordPanel'

/** Cổng kế toán: chữ đồng nhất text-sm. */
function navClass(isActive: boolean) {
  return [
    'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-semibold transition',
    isActive
      ? 'bg-indigo-600 text-white shadow-sm'
      : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-900',
  ].join(' ')
}

export function AccountantLayout() {
  const { profile, signOut } = useAuth()
  const displayName = profile?.displayName?.trim() || profile?.email?.trim() || 'Kế toán'

  return (
    <div className="flex min-h-[100dvh] flex-col bg-gradient-to-br from-indigo-50 via-white to-slate-100 text-sm text-slate-800">
      <header className="sticky top-0 z-30 border-b border-indigo-200/80 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-[1800px] items-center gap-2 px-3 py-2 sm:px-4">
          <nav className="flex min-w-0 flex-1 items-center gap-1" aria-label="Cổng kế toán">
            <NavLink to="/ke-toan" end className={({ isActive }) => navClass(isActive)}>
              <Wallet className="h-4 w-4 shrink-0" aria-hidden />
              Hàng đợi
            </NavLink>
            <NavLink to="/ke-toan/bao-cao" className={({ isActive }) => navClass(isActive)}>
              <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden />
              Tổng quan
            </NavLink>
          </nav>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <span
              className="max-w-[7.5rem] truncate text-sm font-semibold text-slate-700 sm:max-w-[14rem]"
              title={displayName}
            >
              {displayName}
            </span>
            <ChangePasswordPanel tone="light" compact />
            <button
              type="button"
              onClick={() => void signOut()}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-sm font-semibold text-slate-700 active:bg-slate-50"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Thoát</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1800px] flex-1 px-2 pb-4 pt-2 sm:px-4 sm:pb-6 sm:pt-3">
        <Outlet />
      </main>
    </div>
  )
}
