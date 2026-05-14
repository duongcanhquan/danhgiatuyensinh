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
        ? 'flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left text-base font-semibold transition'
        : 'flex shrink-0 flex-row items-center gap-2 rounded-lg border-b-2 border-transparent px-3 py-2 text-sm font-semibold leading-snug tracking-tight transition md:px-3.5 md:py-2.5 md:text-[15px]',
      isActive
        ? compact
          ? 'bg-amber-500/20 text-amber-50 ring-1 ring-amber-400/40'
          : 'border-amber-400 bg-white/[0.08] text-amber-50 shadow-[inset_0_-2px_0_0_rgba(251,191,36,0.45)]'
        : compact
          ? 'text-slate-200 hover:bg-white/10'
          : 'text-slate-300 hover:border-white/20 hover:bg-white/[0.06] hover:text-amber-50',
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
          <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:px-4 md:flex-nowrap md:gap-x-4 md:py-3 md:px-5">
            <div className="flex min-w-0 shrink-0 items-center gap-2.5 sm:gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 via-amber-500 to-amber-800 shadow-md ring-1 ring-amber-200/35 md:h-11 md:w-11">
                <BarChart3 className="h-5 w-5 text-slate-950 md:h-[1.35rem] md:w-[1.35rem]" strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <div className="hidden min-w-0 md:block">
                  <span className="font-display text-base font-semibold tracking-wide text-amber-100 md:text-lg">
                    VIETMY COLLEGE
                  </span>
                </div>
                <div className="flex w-full min-w-0 flex-col gap-1.5 md:hidden">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 self-center">
                      <p className="truncate font-display text-base font-semibold tracking-wide leading-tight text-amber-100">
                        VIETMY COLLEGE
                      </p>
                    </div>
                    {showSignOut ? (
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <p
                          className="max-w-[9.5rem] truncate text-right text-sm font-semibold leading-tight text-amber-50/95"
                          title={profile?.displayName ?? 'Khách'}
                        >
                          {profile?.displayName ?? 'Khách'}
                        </p>
                        <button
                          type="button"
                          onClick={() => void signOut()}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/18 bg-white/[0.08] px-2.5 py-1 text-xs font-semibold text-amber-50"
                        >
                          <LogOut className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                          Đăng xuất
                        </button>
                      </div>
                    ) : profile?.displayName ? (
                      <p className="max-w-[9.5rem] shrink-0 truncate text-right text-sm font-semibold text-amber-50/95">
                        {profile.displayName}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <nav
              className="order-3 hidden min-h-0 min-w-0 flex-1 basis-[100%] items-center gap-0.5 overflow-x-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] sm:basis-auto sm:gap-1 md:order-none md:flex md:max-w-none md:basis-auto md:justify-start [&::-webkit-scrollbar]:hidden"
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
                        className={`h-[1.1rem] w-[1.1rem] shrink-0 md:h-5 md:w-5 ${isActive ? 'text-amber-300' : 'text-slate-500'}`}
                        strokeWidth={2}
                      />
                      <span className="max-w-[11rem] truncate sm:max-w-[13rem]">{label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </nav>

            {showSignOut ? (
              <div className="order-2 hidden shrink-0 flex-col items-end gap-0.5 md:flex">
                <span
                  className="max-w-[16rem] truncate text-right text-sm font-semibold leading-tight text-amber-50/95 md:text-[15px]"
                  title={profile?.displayName ?? 'Khách'}
                >
                  {profile?.displayName ?? 'Khách'}
                </span>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-white/18 bg-white/[0.08] px-3 py-2 text-sm font-semibold text-amber-50/95 shadow-sm transition hover:border-amber-400/40 hover:bg-amber-500/15 md:text-[15px]"
                >
                  <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                  Đăng xuất
                </button>
              </div>
            ) : null}

            <button
              type="button"
              className="order-2 ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/[0.07] text-amber-100 shadow-sm md:hidden"
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
