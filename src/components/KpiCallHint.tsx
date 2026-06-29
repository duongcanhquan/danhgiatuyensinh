import { Link } from 'react-router-dom'
import type { KpiCallDataSource } from '../utils/kpiDisplaySource'
import { kpiCallSourceShortLabel } from '../utils/kpiDisplaySource'

export function KpiCallHint({
  source,
  showAdminLink = false,
  compact = false,
  className = '',
}: {
  source: KpiCallDataSource
  showAdminLink?: boolean
  compact?: boolean
  className?: string
}) {
  const base = `${compact ? 'text-[11px] text-slate-500' : 'text-xs text-slate-500'} ${className}`.trim()

  if (source === 'daily') {
    return (
      <p className={base}>
        Nguồn gọi: <span className="font-medium text-slate-700">{kpiCallSourceShortLabel(source)}</span>
        {!compact ? ' — đồng bộ sau mỗi cuộc gọi.' : null}
      </p>
    )
  }

  if (source === 'both') {
    return (
      <p className={base}>
        Nguồn gọi: <span className="font-medium text-slate-700">báo cáo ngày + timeline</span>
      </p>
    )
  }

  if (source === 'calls_live') {
    if (compact) {
      return (
        <p className={base}>
          Nguồn gọi: <span className="font-medium text-slate-700">timeline OMICall</span>
          {showAdminLink ? (
            <>
              {' · '}
              <Link to="/settings?tab=connect&sub=omicall" className="font-semibold text-sky-800 underline">
                Cài đặt
              </Link>
            </>
          ) : null}
        </p>
      )
    }
    return (
      <p
        className={`rounded-lg border border-sky-200/90 bg-sky-50/90 px-3 py-2 text-xs leading-relaxed text-sky-950 ${className}`}
        role="status"
      >
        <strong>Cuộc gọi từ timeline hồ sơ</strong> (OMICall).
        {showAdminLink ? (
          <>
            {' '}
            <Link to="/settings?tab=connect&sub=omicall" className="font-semibold underline">
              Cài đặt gọi điện
            </Link>
          </>
        ) : null}
      </p>
    )
  }

  if (source === 'empty') {
    return (
      <p className={base}>
        Chưa có cuộc gọi — gọi từ <strong>Hồ sơ</strong> (OMICall).
      </p>
    )
  }

  return null
}
