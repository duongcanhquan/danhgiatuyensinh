/** Giải thích ngắn: xem theo bộ chấm điểm vs nhãn đã lưu trên hồ sơ. */
export function ScoringViewModeHint({
  profileName,
  liveRules,
  compact = false,
}: {
  profileName?: string
  /** Profile đang chọn có quy tắc → cột nhãn tính lại trên màn hình. */
  liveRules: boolean
  compact?: boolean
}) {
  if (!profileName) return null

  const name = profileName.trim()

  if (liveRules) {
    return (
      <p
        className={
          compact
            ? 'text-[11px] leading-snug text-slate-600'
            : 'rounded-md border border-slate-200/90 bg-slate-50/90 px-2.5 py-1.5 text-xs leading-relaxed text-slate-700'
        }
        role="note"
      >
        Đang xem theo bộ <strong>{name}</strong>: điểm / nhãn trên bảng = tính lại ngay.{' '}
        <span className="text-slate-600">
          Nhãn lưu trên hồ sơ chỉ đổi khi bạn sửa &amp; lưu hồ sơ (hoặc import).
        </span>
      </p>
    )
  }

  return (
    <p
      className={
        compact
          ? 'text-[11px] leading-snug text-amber-900'
          : 'rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs leading-relaxed text-amber-950'
      }
      role="note"
    >
      Bộ <strong>{name}</strong> chưa có quy tắc — cột nhãn đang dùng dữ liệu đã lưu. Thêm quy tắc tại{' '}
      <strong>Cài đặt → Chấm điểm → Profile</strong>.
    </p>
  )
}
