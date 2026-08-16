/** Compact school switcher — Superadmin only. */
import { NavLink } from 'react-router-dom'
import { useOrg } from '../hooks/useOrg'

export function OrgSwitcher({ className = '' }: { className?: string }) {
  const { isPlatformSuperAdmin, organizations, effectiveOrgId, setActiveOrgId, currentOrgLabel, organizationsLoading } =
    useOrg()

  if (!isPlatformSuperAdmin) return null

  return (
    <div className={`min-w-0 ${className}`.trim()}>
      <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">Đang làm việc tại</p>
      <div className="flex items-center gap-1">
        <select
          className="h-7 min-w-0 flex-1 cursor-pointer truncate rounded border border-white/15 bg-white/10 px-1.5 text-[11px] font-medium leading-none text-white outline-none focus:border-indigo-400/60"
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
        <NavLink
          to="/organizations"
          title="Quản lý trường"
          className="inline-flex h-7 shrink-0 items-center rounded border border-white/15 px-1.5 text-[10px] font-medium text-indigo-200/90 transition hover:bg-white/10 hover:text-white"
        >
          Trường
        </NavLink>
      </div>
    </div>
  )
}
