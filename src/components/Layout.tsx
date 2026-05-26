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
import { KpiEvaluationRulesProvider } from '../contexts/KpiEvaluationRulesContext'

type NavGroup = 'work' | 'more'

type NavDef = {
  to: string
  label: string
  icon: LucideIcon
  group: NavGroup
  perm?: Permission
  show?: (can: (p: Permission) => boolean) => boolean
}

const GROUP_LABELS: Record<NavGroup, string> = {
  work: 'Làm việc',
  more: 'Thêm',
}

const GROUP_ORDER: NavGroup[] = ['work', 'more']

function navAllowed(item: NavDef, can: (p: Permission) => boolean, permissions: readonly Permission[]) {
  if (item.to === '/settings') return canAccessSettingsPage(permissions)
  if (item.show) return item.show(can)
  return !item.perm || can(item.perm)
}

const mainNav: NavDef[] = [
  { to: '/', label: 'Tổng kết', icon: LayoutDashboard, group: 'work' },
  { to: '/leads', label: 'Hồ sơ', icon: Users, group: 'work' },
  { to: '/my-day', label: 'Ngày của tôi', icon: CalendarDays, group: 'work', perm: 'dashboard:counselor' },
  { to: '/analytics', label: 'Phân tích nâng cao', icon: LineChart, group: 'more', perm: 'analytics:advanced' },
  { to: '/settings', label: 'Cài đặt', icon: Settings2, group: 'more' },
]

function sidebarLinkClass(isActive: boolean) {
  return [
    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition',
    isActive
      ? 'bg-amber-500/20 text-amber-50 ring-1 ring-amber-400/35 shadow-sm'
      : 'text-slate-300 hover:bg-white/[0.08] hover:text-amber-50',
  ].join(' ')
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

  const navByGroup = useMemo(() => {
    const map = new Map<NavGroup, NavDef[]>()
    for (const g of GROUP_ORDER) map.set(g, [])
    for (const item of navItems) {
      map.get(item.group)?.push(item)
    }
    return map
  }, [navItems])

  const currentPageLabel = useMemo(() => {
    if (location.pathname.startsWith('/huong-dan')) return 'Hướng dẫn'
    const sorted = [...navItems].sort((a, b) => b.to.length - a.to.length)
    const hit = sorted.find((item) =>
      item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to),
    )
    return hit?.label ?? 'VIETMY COLLEGE'
  }, [navItems, location.pathname])

  const sidebarContent = (
    <>
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 via-amber-500 to-amber-800 shadow-md ring-1 ring-amber-200/35">
          <BarChart3 className="h-5 w-5 text-slate-950" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold tracking-wide text-amber-100">VIETMY COLLEGE</p>
          <p className="truncate text-xs text-amber-200/60">Tuyển sinh & KPI</p>
        </div>
        <button
          type="button"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/15 text-amber-100 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Đóng menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="shrink-0 px-3 pt-3">
        <NavLink
          to="/huong-dan"
          title="Hướng dẫn sử dụng hệ thống"
          className={({ isActive }) =>
            [
              'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition',
              isActive
                ? 'border-amber-400/40 bg-amber-500/25 text-amber-50 shadow-sm'
                : 'border-white/10 bg-white/[0.06] text-amber-100/95 hover:border-amber-400/30 hover:bg-amber-500/10 hover:text-amber-50',
            ].join(' ')
          }
        >
          {({ isActive }) => (
            <>
              <BookOpen
                className={`h-[1.15rem] w-[1.15rem] shrink-0 ${isActive ? 'text-amber-300' : 'text-amber-200/70'}`}
                strokeWidth={2}
                aria-hidden
              />
              <span className="truncate">Hướng dẫn sử dụng</span>
            </>
          )}
        </NavLink>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-3 py-4" aria-label="Điều hướng chính">
        {GROUP_ORDER.map((group) => {
          const items = navByGroup.get(group) ?? []
          if (!items.length) return null
          return (
            <div key={group}>
              <p className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-wider text-amber-200/45">
                {GROUP_LABELS[group]}
              </p>
              <ul className="flex flex-col gap-0.5">
                {items.map(({ to, label, icon: Icon }) => (
                  <li key={to}>
                    <NavLink to={to} end={to === '/'} title={label} className={({ isActive }) => sidebarLinkClass(isActive)}>
                      {({ isActive }) => (
                        <>
                          <Icon
                            className={`h-[1.15rem] w-[1.15rem] shrink-0 ${isActive ? 'text-amber-300' : 'text-slate-500'}`}
                            strokeWidth={2}
                          />
                          <span className="truncate">{label}</span>
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </nav>

      <div className="shrink-0 border-t border-white/10 px-3 py-3">
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5">
          <User className="h-9 w-9 shrink-0 text-amber-200/90" strokeWidth={1.75} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-amber-50">{profile?.displayName ?? 'Khách'}</p>
            <p className="truncate text-xs text-amber-200/65">{profile ? USER_ROLE_LABELS[profile.role] : '—'}</p>
          </div>
        </div>
        {showSignOut ? (
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.07] py-2.5 text-sm font-semibold text-amber-50 transition hover:border-amber-400/40 hover:bg-amber-500/15"
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
        <div className="aurora-blob-a absolute -left-[8%] -top-[12%] h-[460px] w-[500px] rounded-full bg-amber-400/14 blur-[110px]" />
        <div className="aurora-blob-b absolute -right-[4%] top-[6%] h-[400px] w-[440px] rounded-full bg-teal-400/12 blur-[100px]" />
        <div className="aurora-blob-c absolute bottom-[-14%] left-[14%] h-[480px] w-[560px] rounded-full bg-indigo-500/11 blur-[115px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(201,162,39,0.08),transparent_55%)]" />
      </div>

      <div className="relative z-10 flex min-h-[100dvh]">
        {sidebarOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-slate-950/55 backdrop-blur-[2px] lg:hidden"
            aria-label="Đóng menu"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}

        <aside
          className={[
            'safe-area-pt fixed inset-y-0 left-0 z-50 flex w-[min(17.5rem,88vw)] shrink-0 flex-col',
            'border-r border-amber-500/25 bg-gradient-to-b from-[#0b0f16] via-[#0e141d] to-[#0a0d14]',
            'shadow-[4px_0_32px_rgba(0,0,0,0.35)] transition-transform duration-200 ease-out',
            'lg:static lg:z-auto lg:h-auto lg:min-h-[100dvh] lg:w-72 lg:translate-x-0 lg:shadow-none',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          ].join(' ')}
          aria-label="Menu bên trái"
        >
          {sidebarContent}
        </aside>

        <div className="flex min-h-[100dvh] min-w-0 flex-1 flex-col lg:min-h-0">
          <header className="safe-area-pt sticky top-0 z-20 flex shrink-0 items-center gap-3 border-b border-slate-200/80 bg-[#e8ecf2]/95 px-3 py-2.5 backdrop-blur-md lg:hidden">
            <button
              type="button"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-300/80 bg-white text-slate-800 shadow-sm"
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" aria-hidden />
              <span className="sr-only">Mở menu</span>
            </button>
            <p className="min-w-0 flex-1 truncate text-base font-semibold text-slate-900">{currentPageLabel}</p>
          </header>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-auto bg-[#e8ecf2]">
            <main className="safe-area-pb flex min-h-0 min-w-0 w-full flex-1 flex-col">
              <div className="min-h-0 min-w-0 w-full flex-1 px-2 py-2 text-sm font-normal leading-relaxed text-slate-800 sm:px-3 sm:py-2.5 md:px-4 md:py-3 lg:px-5 lg:py-4">
                <InfoScoreRulesProvider>
                  <KpiEvaluationRulesProvider>
                    <Outlet />
                  </KpiEvaluationRulesProvider>
                </InfoScoreRulesProvider>
              </div>
            </main>
          </div>
        </div>
      </div>
    </div>
  )
}
