import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  BookOpen,
  Building2,
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
import { KpiEvaluationRulesProvider } from '../contexts/KpiEvaluationRulesContext'
import { KpiV2ConfigProvider } from '../contexts/KpiV2ConfigContext'
import { OrgAiIntegrationProvider } from '../contexts/OrgAiIntegrationContext'
import { OrgSwitcher } from './OrgSwitcher'
import { ChangePasswordPanel } from './ChangePasswordPanel'
import { isPlatformSuperAdminRole } from '../tenancy/orgId'

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
/** Chiều rộng thanh icon khi thu gọn / mở full (desktop). */
const RAIL_COLLAPSED = 'lg:w-16'
const RAIL_EXPANDED = 'lg:w-56'

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
  {
    to: '/bao-cao-tuyen-sinh',
    label: 'Báo cáo tuyển sinh',
    shortLabel: 'Báo cáo',
    icon: BarChart3,
    group: 'more',
    show: (can) =>
      can('analytics:advanced') || can('leads:read:global') || can('dashboard:team_lead'),
  },
  {
    to: '/organizations',
    label: 'Quản lý trường',
    shortLabel: 'Trường',
    icon: Building2,
    group: 'work',
    show: () => false, // filled in Layout via platform check
  },
  { to: '/settings', label: 'Cài đặt', shortLabel: 'Cài đặt', icon: Settings2, group: 'more', bottomPrimary: true },
]

function sidebarLinkClass(isActive: boolean, expanded: boolean) {
  return [
    'flex w-full min-h-11 cursor-pointer items-center rounded-xl py-2.5 text-left text-sm font-medium transition duration-150',
    expanded ? 'gap-3 px-3' : 'justify-center px-2',
    isActive
      ? 'bg-[var(--vm-accent)] text-white shadow-sm'
      : 'text-slate-300 hover:bg-white/10 hover:text-white',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400',
  ].join(' ')
}

function isNavActive(pathname: string, to: string) {
  return to === '/' ? pathname === '/' : pathname.startsWith(to)
}

/** Giữ bộ lọc trên URL khi đang ở Hồ sơ rồi bấm lại «Hồ sơ» trên menu. */
function navTarget(to: string, pathname: string, search: string) {
  if (to === '/leads' && (pathname === '/leads' || pathname.startsWith('/leads/'))) {
    return { pathname: '/leads', search }
  }
  return to
}

export function Layout() {
  const { profile, firebaseUser, can, signOut, permissions } = useAuth()
  const location = useLocation()
  const showSignOut = Boolean(isFirebaseConfigured() && getFirebaseAuth() && firebaseUser)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  /** Desktop: mở full khi hover / focus trong menu; thu về icon khi rời chuột. */
  const [railExpanded, setRailExpanded] = useState(false)
  const railLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mainScrollRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  useEffect(() => {
    return () => {
      if (railLeaveTimer.current) clearTimeout(railLeaveTimer.current)
    }
  }, [])

  const openRail = () => {
    if (railLeaveTimer.current) {
      clearTimeout(railLeaveTimer.current)
      railLeaveTimer.current = null
    }
    setRailExpanded(true)
  }

  const scheduleCloseRail = () => {
    if (railLeaveTimer.current) clearTimeout(railLeaveTimer.current)
    railLeaveTimer.current = setTimeout(() => {
      setRailExpanded(false)
      railLeaveTimer.current = null
    }, 160)
  }

  const navItems = mainNav
    .map((item) =>
      item.to === '/organizations'
        ? {
            ...item,
            show: () => isPlatformSuperAdminRole(profile?.role, profile?.orgId ?? null),
          }
        : item,
    )
    .filter((item) => navAllowed(item, can, permissions))

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

  /** Mobile drawer luôn hiện chữ; desktop chỉ hiện chữ khi hover/focus mở rộng. */
  const showLabels = sidebarOpen || railExpanded

  const sidebarContent = (
    <>
      <div
        className={[
          'flex items-center border-b border-white/10 py-3.5',
          showLabels ? 'gap-3 px-4' : 'justify-center px-2',
        ].join(' ')}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary)]">
          <BarChart3 className="h-4 w-4 text-white" strokeWidth={2} aria-hidden />
        </div>
        {showLabels ? (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold tracking-tight text-white">VietMy College</p>
          </div>
        ) : (
          <span className="sr-only">VietMy College</span>
        )}
        <button
          type="button"
          className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Đóng menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav
        className={[
          'flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain py-3',
          showLabels ? 'px-3' : 'px-2',
        ].join(' ')}
        aria-label="Điều hướng chính"
      >
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={navTarget(to, location.pathname, location.search)}
            end={to === '/'}
            title={label}
            aria-label={label}
            className={({ isActive }) => sidebarLinkClass(isActive, showLabels)}
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={`h-5 w-5 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`}
                  strokeWidth={2}
                  aria-hidden
                />
                {showLabels ? <span className="truncate">{label}</span> : null}
              </>
            )}
          </NavLink>
        ))}
        <NavLink
          to="/huong-dan"
          title="Hướng dẫn"
          aria-label="Hướng dẫn"
          className={({ isActive }) =>
            [
              'mt-1 flex w-full min-h-11 cursor-pointer items-center rounded-xl py-2.5 text-left text-sm font-medium transition duration-150',
              showLabels ? 'gap-3 px-3' : 'justify-center px-2',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400',
              isActive ? 'bg-white/12 text-white' : 'text-slate-400 hover:bg-white/8 hover:text-white',
            ].join(' ')
          }
        >
          {({ isActive }) => (
            <>
              <BookOpen
                className={`h-5 w-5 shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`}
                strokeWidth={2}
                aria-hidden
              />
              {showLabels ? <span className="truncate">Hướng dẫn</span> : null}
            </>
          )}
        </NavLink>

        <div className="my-2 border-t border-white/15" role="separator" aria-hidden />

        {showLabels ? (
          <>
            <OrgSwitcher className="mb-1" />
            <div className="flex items-center gap-1.5 rounded-md bg-white/5 px-1.5 py-1">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-700 text-slate-300">
                <User className="h-3 w-3" strokeWidth={2} aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-medium leading-tight text-white">
                  {profile?.displayName ?? 'Khách'}
                </p>
                <p className="truncate text-[10px] leading-tight text-slate-400">
                  {profile ? USER_ROLE_LABELS[profile.role] : '—'}
                </p>
              </div>
            </div>
            {showSignOut ? <ChangePasswordPanel compact /> : null}
            {showSignOut ? (
              <button
                type="button"
                onClick={() => void signOut()}
                className="mt-1 flex w-full min-h-7 cursor-pointer items-center justify-center gap-1 rounded-md border border-white/15 bg-white/5 px-1.5 py-1 text-[11px] font-medium text-slate-200 transition duration-150 hover:border-white/25 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
              >
                <LogOut className="h-3 w-3" aria-hidden />
                Đăng xuất
              </button>
            ) : null}
          </>
        ) : (
          <div className="mt-auto flex flex-col items-center gap-1.5 pt-2">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-700 text-slate-300"
              title={profile?.displayName ?? 'Tài khoản'}
            >
              <User className="h-4 w-4" strokeWidth={2} aria-hidden />
              <span className="sr-only">{profile?.displayName ?? 'Tài khoản'}</span>
            </div>
            {showSignOut ? (
              <button
                type="button"
                onClick={() => void signOut()}
                title="Đăng xuất"
                aria-label="Đăng xuất"
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-white/15 bg-white/5 text-slate-200 transition hover:bg-white/10 hover:text-white"
              >
                <LogOut className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>
        )}
      </nav>
    </>
  )

  return (
    <div className="relative h-[100dvh] overflow-hidden text-slate-800 antialiased">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-[10%] -top-[15%] h-[420px] w-[480px] rounded-full bg-blue-400/6 blur-[100px]" />
        <div className="absolute -right-[5%] top-[8%] h-[360px] w-[400px] rounded-full bg-emerald-400/5 blur-[90px]" />
      </div>

      <div className="relative z-10 flex h-[100dvh]">
        {sidebarOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-pointer bg-slate-950/45 backdrop-blur-[2px] lg:hidden"
            aria-label="Đóng menu"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}

        {/* Desktop: khi mở rộng phủ lên nội dung — chỉ dành chỗ cố định bằng hàng icon.
            Con lăn trên lớp phủ chuyển xuống vùng nội dung chính (không nuốt cuộn). */}
        {railExpanded ? (
          <button
            type="button"
            className="fixed inset-0 z-40 hidden cursor-default bg-slate-950/10 lg:block"
            aria-label="Thu gọn menu"
            tabIndex={-1}
            onClick={() => setRailExpanded(false)}
            onWheel={(e) => {
              const el = mainScrollRef.current
              if (!el) return
              el.scrollTop += e.deltaY
            }}
          />
        ) : null}

        <aside
          data-expanded={railExpanded ? 'true' : 'false'}
          onMouseEnter={openRail}
          onMouseLeave={scheduleCloseRail}
          onFocusCapture={openRail}
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              scheduleCloseRail()
            }
          }}
          className={[
            'app-shell-sidebar safe-area-pt fixed inset-y-0 left-0 z-50 flex shrink-0 flex-col overflow-hidden',
            'border-r',
            'w-[min(17rem,88vw)] transition-[width,transform,box-shadow] duration-200 ease-out',
            railExpanded ? RAIL_EXPANDED : RAIL_COLLAPSED,
            railExpanded ? 'lg:shadow-2xl lg:shadow-slate-950/40' : 'lg:shadow-none',
            'lg:translate-x-0',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          ].join(' ')}
          aria-label="Menu bên trái"
          aria-expanded={railExpanded || sidebarOpen}
        >
          {sidebarContent}
        </aside>

        {/* pl-16 = chỗ dành cho hàng icon; menu full phủ lên, không đẩy lead. */}
        <div className="flex h-[100dvh] min-w-0 flex-1 flex-col lg:pl-16">
          <header className="safe-area-pt sticky top-0 z-20 flex shrink-0 items-center gap-2 border-b border-slate-200/90 bg-white/95 px-3 py-2 sm:px-4 lg:hidden">
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

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--vm-canvas)]">
            <main
              ref={mainScrollRef}
              data-app-main-scroll=""
              className="safe-area-pb-nav flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-y-auto overscroll-y-contain"
            >
              <div className="min-w-0 w-full flex-1 px-3 py-3 text-sm font-normal leading-relaxed text-[var(--vm-text)] sm:px-4 sm:py-4 md:px-6 md:py-5 lg:px-8">
                <OrgAiIntegrationProvider>
                  <KpiEvaluationRulesProvider>
                    <KpiV2ConfigProvider>
                      <Outlet />
                    </KpiV2ConfigProvider>
                  </KpiEvaluationRulesProvider>
                </OrgAiIntegrationProvider>
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
              to={navTarget(to, location.pathname, location.search)}
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
