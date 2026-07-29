import { Link } from 'react-router-dom'
import { Building2, Plug, Settings2, Users } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { canAccessSettingsPage } from '../auth/permissions'
import { isPlatformSuperAdminRole } from '../tenancy/orgId'
import { BentoCell } from './bento'

/** Lối tắt quản lý CRM cho admin / siêu quản trị — hiện trên Tổng kết. */
export function CrmAdminShortcuts() {
  const { profile, permissions, can } = useAuth()
  const isPlatform = isPlatformSuperAdminRole(profile?.role, profile?.orgId ?? null)
  const showSettings = canAccessSettingsPage(permissions)
  const showStaff = can('config:users') || can('config:users:team')
  if (!isPlatform && !showSettings) return null

  return (
    <BentoCell colSpan={4} className="!p-4 sm:!p-5">
      <h2 className="text-sm font-semibold text-slate-900">Quản lý CRM</h2>
      <p className="mt-1 text-xs text-slate-600">
        {isPlatform
          ? 'Siêu quản trị: trường · nhân sự · cấu hình toàn hệ thống.'
          : 'Quản lý trong trường: nhân sự · chỉ tiêu · cấu hình · kết nối ngoài.'}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {isPlatform ? (
          <Link to="/organizations" className="vm-btn vm-btn-primary inline-flex items-center gap-2 text-sm">
            <Building2 className="h-4 w-4" aria-hidden />
            Quản lý trường
          </Link>
        ) : null}
        {showSettings ? (
          <Link to="/settings" className="vm-btn vm-btn-secondary inline-flex items-center gap-2 text-sm">
            <Settings2 className="h-4 w-4" aria-hidden />
            Cài đặt
          </Link>
        ) : null}
        {showStaff ? (
          <Link
            to="/settings?tab=people&sub=staff"
            className="vm-btn vm-btn-secondary inline-flex items-center gap-2 text-sm"
          >
            <Users className="h-4 w-4" aria-hidden />
            Nhân sự
          </Link>
        ) : null}
        {can('config:scoring_rules') ? (
          <Link
            to="/settings?tab=people&sub=kpi"
            className="vm-btn vm-btn-secondary inline-flex items-center gap-2 text-sm"
          >
            Chỉ tiêu KPI
          </Link>
        ) : null}
        {can('config:master_data') || can('config:omicall') ? (
          <Link
            to="/settings?tab=connect&sub=webhooks"
            className="vm-btn vm-btn-secondary inline-flex items-center gap-2 text-sm"
          >
            <Plug className="h-4 w-4" aria-hidden />
            Kết nối ngoài
          </Link>
        ) : null}
      </div>
    </BentoCell>
  )
}
