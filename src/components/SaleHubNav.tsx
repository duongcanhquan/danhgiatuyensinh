import { NavLink } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const LINKS = [
  { to: '/my-day', label: 'Ngày của tôi', perm: 'dashboard:counselor' as const },
  { to: '/command', label: 'Điều hành', perm: 'analytics:advanced' as const },
  {
    to: '/kpi',
    label: 'KPI kỳ',
    show: (can: (p: import('../types').Permission) => boolean) =>
      can('dashboard:counselor') || can('analytics:advanced') || can('dashboard:team_lead'),
  },
  {
    to: '/call-history',
    label: 'Lịch sử gọi',
    show: (can: (p: import('../types').Permission) => boolean) =>
      can('dashboard:counselor') || can('analytics:advanced') || can('dashboard:team_lead'),
  },
  { to: '/scorecard', label: 'Bảng điểm tháng', perm: 'analytics:advanced' as const },
]

export function SaleHubNav() {
  const { can } = useAuth()
  const items = LINKS.filter((l) => {
    if ('show' in l && l.show) return l.show(can)
    if ('perm' in l && l.perm) return can(l.perm)
    return true
  })

  return (
    <nav
      className="flex flex-wrap gap-1 rounded-xl border border-slate-200/90 bg-slate-50/90 p-1"
      aria-label="Điều hướng KPI Sale"
    >
      {items.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            [
              'rounded-lg px-3 py-1.5 text-xs font-semibold transition sm:text-sm',
              isActive
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-700 hover:bg-white hover:text-slate-900',
            ].join(' ')
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
