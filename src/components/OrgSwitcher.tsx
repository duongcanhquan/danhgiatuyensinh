/** Compact school switcher — Superadmin only. */
import { NavLink } from 'react-router-dom'
import { useOrg } from '../hooks/useOrg'

export function OrgSwitcher({ className = '' }: { className?: string }) {
  const { isPlatformSuperAdmin, organizations, effectiveOrgId, setActiveOrgId, currentOrgLabel, organizationsLoading } =
    useOrg()

  if (!isPlatformSuperAdmin) return null

  return (
    <div className={`min-w-0 space-y-2 ${className}`.trim()}>
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        Đang làm việc tại
        <select
          className="mt-1 w-full cursor-pointer truncate rounded-lg border border-white/15 bg-white/10 px-2 py-1.5 text-xs font-semibold text-white outline-none focus:border-teal-400/60"
          value={effectiveOrgId}
          disabled={organizationsLoading || organizations.length === 0}
          onChange={(e) => setActiveOrgId(e.target.value)}
          aria-label="Chọn trường đang làm việc"
          title={currentOrgLabel}
        >
          {organizations.map((o) => (
            <option key={o.id} value={o.id} className="text-slate-900">
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <NavLink
        to="/organizations"
        className="block text-center text-[11px] font-semibold text-teal-200/90 underline-offset-2 hover:text-white hover:underline"
      >
        Quản lý trường
      </NavLink>
    </div>
  )
}
