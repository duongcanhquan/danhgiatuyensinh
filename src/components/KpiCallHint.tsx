import { Link } from 'react-router-dom'
import type { KpiCallDataSource } from '../utils/kpiDisplaySource'
import { kpiCallSourceShortLabel } from '../utils/kpiDisplaySource'

export function KpiCallHint({
  source,
  showAdminLink = false,
  className = '',
}: {
  source: KpiCallDataSource
  showAdminLink?: boolean
  className?: string
}) {
  if (source === 'daily') {
    return (
      <p className={`text-xs text-slate-500 ${className}`}>
        Cuộc gọi: <span className="font-medium text-slate-700">{kpiCallSourceShortLabel(source)}</span> (đồng bộ sau
        mỗi cuộc gọi từ hồ sơ). Cọc / NE / doanh thu cùng nguồn.
      </p>
    )
  }

  if (source === 'calls_live') {
    return (
      <p
        className={`rounded-lg border border-sky-200/90 bg-sky-50/90 px-3 py-2 text-xs leading-relaxed text-sky-950 ${className}`}
        role="status"
      >
        <strong>Đang hiển thị từ lịch sử gọi</strong> — báo cáo ngày chưa cập nhật. Gọi từ nút OMICall trên hồ sơ để tự
        đồng bộ; quản trị có thể «Bù KPI» trong Cài đặt → Gọi điện.
        {showAdminLink ? (
          <>
            {' '}
            <Link to="/settings?main=connect&sub=omicall" className="font-semibold underline">
              Mở cài đặt gọi điện
            </Link>
          </>
        ) : null}
      </p>
    )
  }

  if (source === 'empty') {
    return (
      <p className={`text-xs text-slate-500 ${className}`}>
        Chưa có cuộc gọi trong kỳ — hãy gọi từ <strong>Hồ sơ</strong> (nút OMICall) để hệ thống gắn đúng TVV và lead.
      </p>
    )
  }

  return null
}
