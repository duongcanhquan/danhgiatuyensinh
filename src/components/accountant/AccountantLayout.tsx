import { NavLink, Outlet } from 'react-router-dom'
import { FileSpreadsheet, LogOut, Users, Wallet } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { canManageAccountantStaff } from '../../auth/accountantPortal'
import { SharedFirestoreDataProviders } from '../../contexts/SharedFirestoreDataProviders'

function linkClass(isActive: boolean) {
  return [
    'flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition',
    isActive ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-700 hover:bg-emerald-50 hover:text-emerald-900',
  ].join(' ')
}

export function AccountantLayout() {
  const { profile, signOut, can } = useAuth()
  const canStaff = canManageAccountantStaff(can)

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-emerald-50 via-white to-slate-100">
      <header className="border-b border-emerald-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">VietMy Admissions</p>
            <h1 className="text-lg font-extrabold text-emerald-900 md:text-xl">Cổng kế toán</h1>
            <p className="text-xs text-slate-600">
              {profile?.displayName || profile?.email || '—'} · Duyệt thu → n8n → Google Chat
            </p>
          </div>
          <nav className="flex flex-wrap items-center gap-1">
            <NavLink to="/ke-toan" end className={({ isActive }) => linkClass(isActive)}>
              <Wallet className="h-4 w-4" aria-hidden />
              Duyệt thu
            </NavLink>
            {canStaff ? (
              <NavLink to="/ke-toan/nhan-su" className={({ isActive }) => linkClass(isActive)}>
                <Users className="h-4 w-4" aria-hidden />
                Kế toán viên
              </NavLink>
            ) : null}
            <NavLink to="/ke-toan/bao-cao" className={({ isActive }) => linkClass(isActive)}>
              <FileSpreadsheet className="h-4 w-4" aria-hidden />
              Báo cáo
            </NavLink>
            <button
              type="button"
              onClick={() => void signOut()}
              className="ml-1 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Đăng xuất
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-[1800px] px-2 py-4 md:px-4">
        <SharedFirestoreDataProviders>
          <Outlet />
        </SharedFirestoreDataProviders>
      </main>
    </div>
  )
}
