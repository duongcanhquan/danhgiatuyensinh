import { Link } from 'react-router-dom'
import { Building2, Plug, Settings2, Target, Users } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { canAccessSettingsPage } from '../auth/permissions'
import { isPlatformSuperAdminRole } from '../tenancy/orgId'
import { BentoCell } from './bento'

const TILE =
  'flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border border-slate-200/90 bg-white px-3 py-3 text-center shadow-sm transition duration-200 hover:border-indigo-200 hover:bg-indigo-50/50'

/** Lối tắt quản lý — lưới icon, ít chữ. */
export function CrmAdminShortcuts() {
  const { profile, permissions, can } = useAuth()
  const isPlatform = isPlatformSuperAdminRole(profile?.role, profile?.orgId ?? null)
  const showSettings = canAccessSettingsPage(permissions)
  const showStaff = can('config:users') || can('config:users:team')
  if (!isPlatform && !showSettings) return null

  const tiles: Array<{ to: string; label: string; icon: typeof Settings2; primary?: boolean }> = []
  if (isPlatform) tiles.push({ to: '/organizations', label: 'Trường', icon: Building2, primary: true })
  if (showSettings) tiles.push({ to: '/settings', label: 'Cài đặt', icon: Settings2 })
  if (showStaff) tiles.push({ to: '/settings?tab=people&sub=staff', label: 'Nhân sự', icon: Users })
  if (can('config:scoring_rules')) {
    tiles.push({ to: '/settings?tab=people&sub=kpi', label: 'KPI', icon: Target })
  }
  if (can('config:master_data') || can('config:omicall')) {
    tiles.push({ to: '/settings?tab=connect&sub=hub', label: 'Kết nối', icon: Plug })
  }

  return (
    <BentoCell colSpan={4} className="!p-3 sm:!p-4">
      <h2 className="mb-2 text-sm font-semibold text-slate-900">Quản lý</h2>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {tiles.map(({ to, label, icon: Icon, primary }) => (
          <li key={to}>
            <Link
              to={to}
              className={[
                TILE,
                primary ? 'border-indigo-300 bg-indigo-50/80 text-indigo-950' : 'text-slate-800',
              ].join(' ')}
            >
              <span
                className={[
                  'flex h-10 w-10 items-center justify-center rounded-xl',
                  primary ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-indigo-800',
                ].join(' ')}
              >
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="text-xs font-semibold">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </BentoCell>
  )
}
