import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  LayoutDashboard,
  LineChart,
  LogOut,
  Menu,
  MoreHorizontal,
  Settings2,
  User,
  Users,
  X,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { canAccessSettingsPage } from '../auth/permissions'
import type { Permission } from '../types'
import { USER_ROLE_LABELS } from '../types'
import { getFirebaseAuth, isFirebaseConfigured } from '../services/firebase'
import { InfoScoreRulesProvider } from '../contexts/InfoScoreRulesContext'
import { LeadClassificationRulesProvider } from '../contexts/LeadClassificationRulesContext'
import { KpiEvaluationRulesProvider } from '../contexts/KpiEvaluationRulesContext'
import { KpiV2ConfigProvider } from '../contexts/KpiV2ConfigContext'

type NavGroup = 'work' | 'more'

type NavDef = {
  to: string
  label: string
  shortLabel?: string
  icon: LucideIcon
  group: NavGroup
  perm?: Permission
  show?: (can: (p: Permission) => boolean) => boolean
  bottomPrimary?: boolean
}

const MOBILE_BOTTOM_ROUTES = ['/', '/leads', '/my-day', '/settings'] as const

function navAllowed(item: NavDef, can: (p: Permission) => boolean, permissions: readonly Permission[]) {
  if (item.to === '/settings') return canAccessSettingsPage(permissions)
  if (item.show) return item.show(can)
  return !item.perm || can(item.perm)
}

const mainNav: NavDef[] = [
  { to: '/', label: 'Tổng kết', shortLabel: 'Tổng kết', icon: LayoutDashboard, group: 'work', bottomPrimary: true },
  { to: '/leads', label: 'Hồ sơ', shortLabel: 'Hồ sơ', icon: Users, group: 'work', bottomPrimary: true },
  {
    to: '/my-day',
    label: 'Ngày của tôi',
    shortLabel: 'Hôm nay',
    icon: CalendarDays,
    group: 'work',
    show: (can) => can('dashboard:counselor') || can('dashboard:team_lead'),
    bottomPrimary: true,
  },
  {
    to: '/analytics',
    label: 'Phân tích',
    shortLabel: 'Phân tích',
    icon: LineChart,
    group: 'more',
    perm: 'analytics:advanced',
  },
  { to: '/settings', label: 'Cài đặt', shortLabel: 'Cài đặt', icon: Settings2, group: 'more', bottomPrimary: true },
]

function sidebarLinkClass(isActive: boolean) {
  return [
    'flex w-full min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition duration-150',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400',
    isActive
      ? 'bg-[var(--color-primary)] text-white shadow-sm'
      : 'text-slate-300 hover:bg-white/8 hover:text-white',
  ].join(' ')
}

function isNavActive(pathname: string, to: string) {
  return to === '/' ? pathname === '/' : pathname.startsWith(to)
}

export function Layout() {
  const { profile, firebaseUser, can, signOut, permissions } = useAuth()
  const location = useLocation()
  const showSignOut = Boolean(isFirebaseConfigured() && getFirebaseAuth() && firebaseUser)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  const navItems = mainNav.filter((item) => navAllowed(item, can, permissions))

  const mobileBottomItems = useMemo(() => {
    const primary = navItems.filter(
      (item) => item.bottomPrimary && MOBILE_BOTTOM_ROUTES.includes(item.to as (typeof MOBILE_BOTTOM_ROUTES)[number]),
    )
    return primary.slice(0, 4)
  }, [navItems])

  const currentPageLabel = useMemo(() => {
    if (location.pathname.startsWith('/huong-dan')) return 'Hướng dẫn'
    const sorted = [...navItems].sort((a, b) => b.to.length - a.to.length)
    const hit = sorted.find((item) => isNavActive(location.pathname, item.to))
    return hit?.label ?? 'VietMy'
  }, [navItems, location.pathname])

  const sidebarContent = (
    <>
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary)]">
          <BarChart3 className="h-4 w-4 text-white" strokeWidth={2} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold tracking-tight text-white">VietMy College</p>
        </div>
        <button
          type="button"
          className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Đóng menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-3 py-3" aria-label="Điều hướng chính">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} title={label} className={({ isActive }) => sidebarLinkClass(isActive)}>
            {({ isActive }) => (
              <>
                <Icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} strokeWidth={2} aria-hidden />
                <span className="truncate">{label}</span>
              </>
            )}
          </NavLink>
        ))}
        <NavLink
          to="/huong-dan"
          title="Hướng dẫn"
          className={({ isActive }) =>
            [
              'mt-1 flex w-full min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition duration-150',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400',
              isActive
                ? 'bg-white/12 text-white'
                : 'text-slate-400 hover:bg-white/8 hover:text-white',
            ].join(' ')
          }
        >
          {({ isActive }) => (
            <>
              <BookOpen className={`h-5 w-5 shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`} strokeWidth={2} aria-hidden />
              <span className="truncate">Hướng dẫn</span>
            </>
          )}
        </NavLink>
      </nav>

      <div className="shrink-0 border-t border-white/10 px-3 py-3">
        <div className="flex items-center gap-2.5 rounded-xl bg-white/5 px-3 py-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-700 text-slate-300">
            <User className="h-4 w-4" strokeWidth={2} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{profile?.displayName ?? 'Khách'}</p>
            <p className="truncate text-xs text-slate-400">{profile ? USER_ROLE_LABELS[profile.role] : '—'}</p>
          </div>
        </div>
        {showSignOut ? (
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-2 flex w-full min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 py-2.5 text-sm font-semibold text-slate-200 transition duration-150 hover:border-white/25 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Đăng xuất
          </button>
        ) : null}
      </div>
    </>
  )

  return (
    <div className="relative min-h-[100dvh] text-slate-800 antialiased">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-[10%] -top-[15%] h-[420px] w-[480px] rounded-full bg-blue-400/6 blur-[100px]" />
        <div className="absolute -right-[5%] top-[8%] h-[360px] w-[400px] rounded-full bg-emerald-400/5 blur-[90px]" />
      </div>

      <div className="relative z-10 flex min-h-[100dvh]">
        {sidebarOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-pointer bg-slate-950/45 backdrop-blur-[2px] lg:hidden"
            aria-label="Đóng menu"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}

        <aside
          className={[
            'safe-area-pt fixed inset-y-0 left-0 z-50 flex w-[min(17rem,88vw)] shrink-0 flex-col',
            'border-r border-slate-800/80 bg-slate-900',
            'shadow-xl transition-transform duration-200 ease-out lg:shadow-none',
            'lg:static lg:z-auto lg:h-auto lg:min-h-[100dvh] lg:w-56 lg:translate-x-0',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          ].join(' ')}
          aria-label="Menu bên trái"
        >
          {sidebarContent}
        </aside>

        <div className="flex min-h-[100dvh] min-w-0 flex-1 flex-col lg:min-h-0">
          <header className="safe-area-pt sticky top-0 z-20 flex shrink-0 items-center gap-2 border-b border-slate-200/90 bg-white/92 px-3 py-2 backdrop-blur-md sm:px-4 lg:px-6">
            <button
              type="button"
              className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 lg:hidden"
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" aria-hidden />
              <span className="sr-only">Mở menu</span>
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-slate-900">{currentPageLabel}</p>
            </div>
            <div
              className="hidden max-w-[8rem] items-center gap-1.5 truncate rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 sm:flex lg:hidden"
              title={profile?.displayName ?? undefined}
            >
              <User className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
              <span className="truncate">{profile?.displayName?.split(' ').pop() ?? '—'}</span>
            </div>
            {showSignOut ? (
              <button
                type="button"
                onClick={() => void signOut()}
                className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 lg:hidden"
                aria-label="Đăng xuất"
              >
                <LogOut className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">Thoát</span>
              </button>
            ) : null}
          </header>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-auto bg-[var(--color-background)]">
            <main className="safe-area-pb-nav flex min-h-0 min-w-0 w-full flex-1 flex-col">
              <div className="min-h-0 min-w-0 w-full flex-1 px-3 py-2.5 text-sm font-normal leading-relaxed text-slate-800 sm:px-4 sm:py-3 md:px-6 md:py-4 lg:px-8">
                <InfoScoreRulesProvider>
                  <LeadClassificationRulesProvider>
                    <KpiEvaluationRulesProvider>
                      <KpiV2ConfigProvider>
                        <Outlet />
                      </KpiV2ConfigProvider>
                    </KpiEvaluationRulesProvider>
                  </LeadClassificationRulesProvider>
                </InfoScoreRulesProvider>
              </div>
            </main>
          </div>
        </div>
      </div>

      <nav className="app-bottom-nav lg:hidden" aria-label="Điều hướng nhanh">
        {mobileBottomItems.map(({ to, shortLabel, label, icon: Icon }) => {
          const active = isNavActive(location.pathname, to)
          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className="app-bottom-nav-link"
              data-active={active ? 'true' : 'false'}
              aria-current={active ? 'page' : undefined}
            >
              <Icon strokeWidth={active ? 2.25 : 2} aria-hidden />
              <span>{shortLabel ?? label}</span>
            </NavLink>
          )
        })}
        <button
          type="button"
          className="app-bottom-nav-link"
          data-active={sidebarOpen ? 'true' : 'false'}
          aria-expanded={sidebarOpen}
          aria-label="Thêm mục menu"
          onClick={() => setSidebarOpen(true)}
        >
          <MoreHorizontal strokeWidth={2} aria-hidden />
          <span>Thêm</span>
        </button>
      </nav>
    </div>
  )
}
