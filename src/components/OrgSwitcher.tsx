/** Compact school switcher — Superadmin only. */
import { NavLink } from 'react-router-dom'
import { useOrg } from '../hooks/useOrg'

export function OrgSwitcher({ className = '' }: { className?: string }) {
  const { isPlatformSuperAdmin, organizations, effectiveOrgId, setActiveOrgId, currentOrgLabel, organizationsLoading } =
    useOrg()

  if (!isPlatformSuperAdmin) return null

  return (
    <div className={`min-w-0 space-y-0.5 ${className}`.trim()}>
      <label className="block text-[9px] font-semibold uppercase tracking-wide text-slate-500">
        Đang làm việc tại
        <select
          className="mt-0.5 w-full cursor-pointer truncate rounded-md border border-white/15 bg-white/10 px-1.5 py-1 text-[11px] font-medium leading-tight text-white outline-none focus:border-indigo-400/60"
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
        className="block text-center text-[10px] font-medium text-indigo-200/90 underline-offset-2 hover:text-white hover:underline"
      >
        Quản lý trường
      </NavLink>
    </div>
  )
}
