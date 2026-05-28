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

  if (source === 'both') {
    return (
      <p className={`text-xs text-slate-500 ${className}`}>
        Cuộc gọi: kết hợp <span className="font-medium text-slate-700">báo cáo ngày</span> và{' '}
        <span className="font-medium text-slate-700">dòng thời gian hồ sơ</span>.
      </p>
    )
  }

  if (source === 'calls_live') {
    return (
      <p
        className={`rounded-lg border border-sky-200/90 bg-sky-50/90 px-3 py-2 text-xs leading-relaxed text-sky-950 ${className}`}
        role="status"
      >
        <strong>Cuộc gọi từ dòng thời gian hồ sơ</strong> (tương tác OMICall) — cùng nguồn với tab hoạt động khi bạn gọi từ hồ sơ tư vấn.
        Cọc / NE / doanh thu vẫn lấy từ báo cáo ngày khi đã đồng bộ.
        {showAdminLink ? (
          <>
            {' '}Nếu cần kiểm tra dữ liệu toàn hệ thống, quản trị có thể mở{' '}
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
