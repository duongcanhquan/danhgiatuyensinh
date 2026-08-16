import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { KeyRound, LayoutDashboard, LogOut, MoreHorizontal, Wallet, X } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { applyAccountantPwaMeta, clearAccountantPwaMeta } from '../../utils/accountantPwaMeta'
import { ChangePasswordPanel } from '../ChangePasswordPanel'

function topNavClass(isActive: boolean) {
  return [
    'inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition',
    isActive
      ? 'bg-indigo-600 text-white shadow-sm'
      : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-900',
  ].join(' ')
}

function pageTitle(pathname: string): string {
  if (pathname.includes('/bao-cao')) return 'Tổng quan'
  return 'Hàng đợi duyệt thu'
}

/** Cổng kế toán — khung kiểu app trên điện thoại + PWA cài được. */
export function AccountantLayout() {
  const { profile, signOut } = useAuth()
  const location = useLocation()
  const displayName = profile?.displayName?.trim() || profile?.email?.trim() || 'Kế toán'
  const [moreOpen, setMoreOpen] = useState(false)
  const title = pageTitle(location.pathname)

  useEffect(() => {
    applyAccountantPwaMeta()
    return () => clearAccountantPwaMeta()
  }, [])

  useEffect(() => {
    setMoreOpen(false)
  }, [location.pathname])

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-gradient-to-br from-indigo-50 via-white to-slate-100 text-sm text-slate-800">
      <header className="safe-area-pt sticky top-0 z-30 shrink-0 border-b border-indigo-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1800px] items-center gap-2 px-3 py-2 sm:px-4">
          {/* Desktop: nav trên */}
          <nav className="hidden min-w-0 flex-1 items-center gap-1 lg:flex" aria-label="Cổng kế toán">
            <NavLink to="/ke-toan" end className={({ isActive }) => topNavClass(isActive)}>
              <Wallet className="h-4 w-4 shrink-0" aria-hidden />
              Hàng đợi
            </NavLink>
            <NavLink to="/ke-toan/bao-cao" className={({ isActive }) => topNavClass(isActive)}>
              <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden />
              Tổng quan
            </NavLink>
          </nav>

          {/* Mobile: tiêu đề trang */}
          <div className="min-w-0 flex-1 lg:hidden">
            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">VietMy Kế toán</p>
            <h1 className="truncate text-base font-bold text-slate-900">{title}</h1>
          </div>

          <div className="relative flex shrink-0 items-center gap-1.5 sm:gap-2">
            <span
              className="hidden max-w-[14rem] truncate text-sm font-semibold text-slate-700 sm:inline"
              title={displayName}
            >
              {displayName}
            </span>

            {/* Desktop actions */}
            <div className="hidden items-center gap-1.5 lg:flex">
              <ChangePasswordPanel tone="light" compact />
              <button
                type="button"
                onClick={() => void signOut()}
                className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <LogOut className="h-4 w-4" aria-hidden />
                Thoát
              </button>
            </div>

            {/* Mobile: menu Thêm */}
            <button
              type="button"
              className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 lg:hidden"
              aria-expanded={moreOpen}
              aria-label={moreOpen ? 'Đóng menu' : 'Thêm'}
              onClick={() => setMoreOpen((v) => !v)}
            >
              {moreOpen ? <X className="h-5 w-5" aria-hidden /> : <MoreHorizontal className="h-5 w-5" aria-hidden />}
            </button>

            {moreOpen ? (
              <div
                className="absolute right-0 top-full z-40 mt-1.5 w-[min(18rem,calc(100vw-1.5rem))] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl lg:hidden"
                role="menu"
              >
                <p className="truncate px-1 text-xs font-semibold text-slate-500">{displayName}</p>
                <div className="mt-2 space-y-2">
                  <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-2">
                    <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                      <KeyRound className="h-3.5 w-3.5" aria-hidden />
                      Tài khoản
                    </p>
                    <ChangePasswordPanel tone="light" compact />
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void signOut()}
                    className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    <LogOut className="h-4 w-4" aria-hidden />
                    Đăng xuất
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main className="safe-area-pb-nav mx-auto flex min-h-0 w-full max-w-[1800px] flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain px-2 pt-2 sm:px-4 sm:pt-3 lg:pb-4">
        <Outlet />
      </main>

      {/* Mobile bottom tabs */}
      <nav className="app-bottom-nav lg:hidden" aria-label="Điều hướng kế toán">
        <NavLink
          to="/ke-toan"
          end
          className="app-bottom-nav-link"
          data-active={location.pathname === '/ke-toan' || location.pathname === '/ke-toan/' ? 'true' : 'false'}
        >
          <Wallet aria-hidden />
          <span>Hàng đợi</span>
        </NavLink>
        <NavLink
          to="/ke-toan/bao-cao"
          className="app-bottom-nav-link"
          data-active={location.pathname.includes('/bao-cao') ? 'true' : 'false'}
        >
          <LayoutDashboard aria-hidden />
          <span>Tổng quan</span>
        </NavLink>
      </nav>
    </div>
  )
}
