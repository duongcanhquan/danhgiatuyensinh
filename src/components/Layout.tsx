import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  Database,
  LayoutDashboard,
  LayoutGrid,
  LineChart,
  LogOut,
  Menu,
  Settings2,
  User,
  Users,
  X,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import type { Permission } from '../types'
import { USER_ROLE_LABELS } from '../types'
import { getFirebaseAuth, isFirebaseConfigured } from '../services/firebase'

type NavDef = { to: string; label: string; icon: LucideIcon; perm?: Permission }

function navAllowed(item: NavDef, can: (p: Permission) => boolean) {
  return !item.perm || can(item.perm)
}

const mainNav: NavDef[] = [
  { to: '/', label: 'Tổng kết', icon: LayoutDashboard },
  { to: '/leads', label: 'Hồ sơ', icon: Users },
  { to: '/counselor', label: 'Tư Vấn', icon: LayoutGrid, perm: 'dashboard:counselor' },
  { to: '/analytics', label: 'Phân tích nâng cao', icon: LineChart, perm: 'analytics:advanced' },
  { to: '/import', label: 'Nhập liệu', icon: Database, perm: 'data:intake' },
  { to: '/settings', label: 'Cài đặt', icon: Settings2 },
]

export function Layout() {
  const { profile, firebaseUser, can, signOut } = useAuth()
  const location = useLocation()
  const showSignOut = Boolean(isFirebaseConfigured() && getFirebaseAuth() && firebaseUser)

  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  const navItems = mainNav.filter((item) => navAllowed(item, can))

  const navLinkClass = (isActive: boolean, compact: boolean) =>
    [
      compact
        ? 'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition'
        : 'flex shrink-0 flex-row items-center gap-1 border-b-2 px-2 py-2 text-[11px] font-semibold leading-tight transition sm:gap-1.5 sm:px-2.5 sm:text-xs md:px-3',
      isActive
        ? compact
          ? 'bg-amber-500/20 text-amber-50 ring-1 ring-amber-400/40'
          : 'border-amber-400 bg-white/[0.06] text-amber-50'
        : compact
          ? 'text-slate-200 hover:bg-white/10'
          : 'border-transparent text-slate-400 hover:border-white/15 hover:bg-white/[0.04] hover:text-slate-100',
    ].join(' ')

  return (
    <div className="relative min-h-[100dvh] overflow-x-hidden text-slate-900 antialiased">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="aurora-blob-a absolute -left-[8%] -top-[12%] h-[460px] w-[500px] rounded-full bg-amber-400/14 blur-[110px]" />
        <div className="aurora-blob-b absolute -right-[4%] top-[6%] h-[400px] w-[440px] rounded-full bg-teal-400/12 blur-[100px]" />
        <div className="aurora-blob-c absolute bottom-[-14%] left-[14%] h-[480px] w-[560px] rounded-full bg-indigo-500/11 blur-[115px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(201,162,39,0.08),transparent_55%)]" />
      </div>

      <div className="relative z-10 flex min-h-[100dvh] flex-col">
        <header className="safe-area-pt sticky top-0 z-50 w-full shrink-0 border-b border-amber-500/25 bg-gradient-to-r from-[#0b0f16] via-[#0e141d] to-[#0a0d14] shadow-[0_4px_24px_rgba(0,0,0,0.35)]">
          <div className="flex w-full max-w-none items-center gap-2 px-2 py-1.5 sm:gap-3 sm:px-3 sm:py-2 md:px-4">
            <div className="flex min-w-0 shrink-0 items-center gap-2 border-r border-white/10 pr-2 sm:gap-2.5 sm:pr-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-300 via-amber-500 to-amber-800 shadow ring-1 ring-amber-200/30 sm:h-9 sm:w-9">
                <BarChart3 className="h-4 w-4 text-slate-950 sm:h-[1.05rem] sm:w-[1.05rem]" strokeWidth={2} />
              </div>
              <div className="hidden min-w-0 items-baseline gap-1.5 leading-none md:flex">
                <span className="font-display shrink-0 text-sm font-semibold tracking-tight text-amber-100/95">
                  VietMy College
                </span>
                <span className="shrink-0 text-amber-400/50" aria-hidden>
                  ·
                </span>
                <span className="min-w-0 truncate text-xs font-medium text-amber-50/95" title={profile?.displayName ?? ''}>
                  {profile?.displayName ?? 'Khách'}
                </span>
                {profile ? (
                  <span className="hidden min-w-0 max-w-[8rem] truncate text-[10px] font-medium text-amber-200/55 lg:inline" title={USER_ROLE_LABELS[profile.role]}>
                    ({USER_ROLE_LABELS[profile.role]})
                  </span>
                ) : null}
                {!firebaseUser && import.meta.env.DEV ? (
                  <span className="hidden shrink-0 text-[10px] font-medium text-amber-300/80 xl:inline">· Bản thử</span>
                ) : null}
              </div>
              <p className="min-w-0 truncate font-display text-sm font-semibold text-amber-100/95 md:hidden">VietMy College</p>
              {showSignOut ? (
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="ml-0.5 flex shrink-0 items-center gap-1 rounded-md border border-white/15 bg-white/[0.07] px-2 py-1 text-[11px] font-semibold text-amber-50/95 transition hover:border-amber-400/35 hover:bg-amber-500/15 sm:px-2.5 sm:text-xs"
                >
                  <LogOut className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                  <span className="hidden sm:inline">Đăng xuất</span>
                </button>
              ) : null}
            </div>

            <nav
              className="hidden min-h-0 min-w-0 flex-1 items-stretch divide-x divide-white/10 overflow-x-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] md:flex [&::-webkit-scrollbar]:hidden"
              aria-label="Điều hướng chính"
            >
              {navItems.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  title={label}
                  className={({ isActive }) => navLinkClass(isActive, false)}
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        className={`h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4 ${isActive ? 'text-amber-300' : 'text-slate-500'}`}
                        strokeWidth={2}
                      />
                      <span className="max-w-[9rem] truncate sm:max-w-[11rem]">{label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </nav>

            <button
              type="button"
              className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/[0.06] text-amber-100 md:hidden"
              aria-expanded={mobileNavOpen}
              aria-controls="mobile-nav-panel"
              onClick={() => setMobileNavOpen((o) => !o)}
            >
              {mobileNavOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
              <span className="sr-only">{mobileNavOpen ? 'Đóng menu' : 'Mở menu'}</span>
            </button>
          </div>

          <div
            id="mobile-nav-panel"
            className={[
              'border-t border-white/10 md:hidden',
              mobileNavOpen ? 'max-h-[min(70dvh,520px)] overflow-y-auto overscroll-contain' : 'hidden',
            ].join(' ')}
          >
            <nav className="flex flex-col gap-1 px-2 py-3" aria-label="Điều hướng chính (mobile)">
              {navItems.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} end={to === '/'} title={label} className={({ isActive }) => navLinkClass(isActive, true)}>
                  {({ isActive }) => (
                    <>
                      <Icon
                        className={`h-[1.15rem] w-[1.15rem] shrink-0 ${isActive ? 'text-amber-300' : 'text-slate-400'}`}
                        strokeWidth={2}
                      />
                      <span>{label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </nav>
            <div className="border-t border-white/10 px-3 py-3">
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2">
                <User className="h-8 w-8 shrink-0 text-amber-200/90" strokeWidth={1.75} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-amber-50">{profile?.displayName ?? 'Khách'}</p>
                  <p className="truncate text-xs text-amber-200/65">{profile ? USER_ROLE_LABELS[profile.role] : '—'}</p>
                </div>
              </div>
              {showSignOut ? (
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.07] py-2.5 text-sm font-semibold text-amber-50"
                >
                  <LogOut className="h-4 w-4" aria-hidden />
                  Đăng xuất
                </button>
              ) : null}
            </div>
          </div>
        </header>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#e8ecf2]">
          <main className="safe-area-pb flex min-h-0 min-w-0 w-full flex-1 flex-col px-0 py-0">
            <div className="min-h-0 min-w-0 w-full flex-1 px-2 py-2 text-base font-normal leading-relaxed text-slate-900 sm:px-3 sm:py-2.5 md:px-4 md:py-3 md:leading-relaxed">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
