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
  Sparkles,
  User,
  UserPlus,
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

const coreNav: NavDef[] = [
  { to: '/', label: 'Bảng điều khiển', icon: LayoutDashboard },
  { to: '/leads', label: 'Quản lý hồ sơ', icon: Users },
  { to: '/counselor', label: 'Pipeline tư vấn', icon: LayoutGrid, perm: 'dashboard:counselor' },
  { to: '/import', label: 'Nhập liệu Excel', icon: Database, perm: 'data:intake' },
]

const extraNav: NavDef[] = [
  { to: '/analytics', label: 'Phân tích nâng cao', icon: LineChart, perm: 'analytics:advanced' },
  { to: '/ai', label: 'Phòng thử AI', icon: Sparkles, perm: 'ai:use' },
  { to: '/staff', label: 'Quản lý nhân sự', icon: UserPlus, perm: 'config:users' },
  { to: '/settings', label: 'Cấu hình dữ liệu', icon: Settings2 },
]

export function Layout() {
  const { profile, firebaseUser, can, signOut } = useAuth()
  const location = useLocation()
  const showSignOut = Boolean(isFirebaseConfigured() && getFirebaseAuth() && firebaseUser)

  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  const navItems = [...coreNav.filter((item) => navAllowed(item, can)), ...extraNav.filter((item) => navAllowed(item, can))]

  const navLinkClass = (isActive: boolean, compact: boolean) =>
    [
      compact
        ? 'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition'
        : 'flex min-h-[3.25rem] min-w-0 w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2.5 text-center text-xs font-medium leading-tight transition sm:min-h-14 sm:px-1.5 md:text-sm',
      isActive
        ? compact
          ? 'bg-amber-500/20 text-amber-50 ring-1 ring-amber-400/40'
          : 'border-b-2 border-amber-400 bg-white/[0.07] text-amber-50'
        : compact
          ? 'text-slate-200 hover:bg-white/10'
          : 'border-b-2 border-transparent text-slate-400 hover:bg-white/[0.05] hover:text-slate-100',
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
          <div className="flex w-full max-w-none items-center justify-between gap-3 px-3 py-2.5 sm:px-4 sm:py-3 md:px-5">
            <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 via-amber-500 to-amber-800 shadow-md ring-1 ring-amber-200/35 sm:h-11 sm:w-11">
                <BarChart3 className="h-5 w-5 text-slate-950" strokeWidth={2} />
              </div>
              <div className="min-w-0 text-left">
                <p className="font-display truncate text-base font-semibold leading-tight tracking-tight text-amber-100/95 sm:text-lg">
                  VietMy
                </p>
                <p className="truncate text-xs font-semibold uppercase tracking-[0.18em] text-amber-200/55 sm:text-xs">
                  Admissions
                </p>
              </div>
            </div>

            <div className="hidden min-w-0 items-center gap-2 md:flex md:max-w-[min(24rem,28vw)] lg:max-w-xs">
              <div className="truncate rounded-lg border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-right shadow-inner">
                <p className="truncate text-sm font-semibold text-amber-50">{profile?.displayName ?? 'Khách'}</p>
                <p className="truncate text-xs font-medium text-amber-200/65">
                  {profile ? USER_ROLE_LABELS[profile.role] : '—'}
                </p>
                {!firebaseUser && import.meta.env.DEV ? (
                  <p className="truncate text-xs font-medium text-amber-300/75">Bản thử</p>
                ) : null}
              </div>
              {showSignOut ? (
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.07] px-3 py-2 text-sm font-semibold text-amber-50/95 transition hover:border-amber-400/35 hover:bg-amber-500/15"
                >
                  <LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  <span className="hidden lg:inline">Đăng xuất</span>
                </button>
              ) : null}
            </div>

            <button
              type="button"
              className="flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-white/15 bg-white/[0.06] text-amber-100 md:hidden"
              aria-expanded={mobileNavOpen}
              aria-controls="mobile-nav-panel"
              onClick={() => setMobileNavOpen((o) => !o)}
            >
              {mobileNavOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
              <span className="sr-only">{mobileNavOpen ? 'Đóng menu' : 'Mở menu'}</span>
            </button>
          </div>

          <nav
            className="hidden w-full min-w-0 divide-x divide-white/10 border-t border-white/10 md:flex"
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
                      className={`h-4 w-4 shrink-0 sm:h-[1.05rem] sm:w-[1.05rem] ${isActive ? 'text-amber-300' : 'text-slate-500'}`}
                      strokeWidth={2}
                    />
                    <span className="line-clamp-2 w-full min-w-0 break-words px-0.5">{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>

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
