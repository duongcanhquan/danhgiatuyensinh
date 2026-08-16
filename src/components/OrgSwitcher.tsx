/** Compact school switcher — Superadmin only. */
import { NavLink } from 'react-router-dom'
import { useOrg } from '../hooks/useOrg'

type OrgSwitcherTone = 'sidebar' | 'light'

export function OrgSwitcher({
  className = '',
  tone = 'sidebar',
  compact = false,
}: {
  className?: string
  /** sidebar = dark rail; light = Settings sticky chip */
  tone?: OrgSwitcherTone
  /** Góc nhỏ — ẩn nhãn «Đang làm việc tại» */
  compact?: boolean
}) {
  const { isPlatformSuperAdmin, organizations, effectiveOrgId, setActiveOrgId, currentOrgLabel, organizationsLoading } =
    useOrg()

  if (!isPlatformSuperAdmin) return null

  const light = tone === 'light'
  const labelCls = light
    ? 'mb-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500'
    : 'mb-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500'
  const selectCls = light
    ? 'h-8 min-w-0 max-w-[11rem] flex-1 cursor-pointer truncate rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold leading-none text-slate-900 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 sm:max-w-[14rem]'
    : 'h-7 min-w-0 flex-1 cursor-pointer truncate rounded border border-white/15 bg-white/10 px-1.5 text-[11px] font-medium leading-none text-white outline-none focus:border-indigo-400/60'
  const linkCls = light
    ? 'inline-flex h-8 shrink-0 items-center rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold text-indigo-800 shadow-sm transition hover:bg-indigo-50'
    : 'inline-flex h-7 shrink-0 items-center rounded border border-white/15 px-1.5 text-[10px] font-medium text-indigo-200/90 transition hover:bg-white/10 hover:text-white'

  return (
    <div className={`min-w-0 ${className}`.trim()}>
      {!compact ? <p className={labelCls}>Đang làm việc tại</p> : null}
      <div className="flex items-center gap-1">
        <select
          className={selectCls}
          value={effectiveOrgId}
          disabled={organizationsLoading || organizations.length === 0}
          onChange={(e) => setActiveOrgId(e.target.value)}
          aria-label="Chọn trường đang cấu hình"
          title={currentOrgLabel}
        >
          {organizations.map((o) => (
            <option key={o.id} value={o.id} className="text-slate-900">
              {o.name}
            </option>
          ))}
        </select>
        <NavLink to="/organizations" title="Quản lý trường" className={linkCls}>
          Trường
        </NavLink>
      </div>
    </div>
  )
}
