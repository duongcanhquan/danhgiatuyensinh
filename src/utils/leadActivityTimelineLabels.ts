import type { AuditLogActionType } from '../types'

const AUDIT_ACTION_VI: Record<AuditLogActionType, string> = {
  STATUS_CHANGE: 'Đổi trạng thái',
  REASSIGNMENT: 'Phân công',
  NOTE_ADDED: 'Ghi chú / tương tác',
  AI_RUN: 'Chạy AI',
  SYSTEM_UPDATE: 'Cập nhật hồ sơ',
}

/** Nhãn hành động audit — tiếng Việt đời thường (không hiện mã kỹ thuật). */
export function auditActionLabelVi(actionType: string): string {
  if (actionType in AUDIT_ACTION_VI) {
    return AUDIT_ACTION_VI[actionType as AuditLogActionType]
  }
  return 'Thao tác'
}

/**
 * Tiêu đề mốc trên dòng thời gian — ưu tiên nội dung đời thường từ mô tả
 * (tạo hồ sơ / nạp tiền / kế toán xác nhận) thay vì gộp hết thành «Cập nhật hồ sơ».
 */
export function timelineAuditAction(actionType: string, description?: string | null): string {
  const d = (description ?? '').trim()
  if (/^tạo hồ sơ/i.test(d)) return 'Tạo hồ sơ'
  if (/kế toán xác nhận tiền/i.test(d)) return 'Kế toán xác nhận tiền'
  if (/kế toán từ chối tiền/i.test(d)) return 'Kế toán từ chối tiền'
  if (/^nạp tiền/i.test(d) || /nạp tiền:/i.test(d)) return 'Nạp tiền'
  if (/cập nhật tài chính/i.test(d)) return 'Cập nhật tài chính'
  if (/tin n8n|đăng ký sang n8n/i.test(d)) return 'Thông báo n8n'
  return auditActionLabelVi(actionType)
}

/**
 * Tên người thao tác trên dòng thời gian.
 * Ưu tiên tên đã lưu; uid → labelUid; không có → «Chưa rõ người».
 */
export function timelineActorName(opts: {
  performedByName?: string | null
  uid?: string | null
  labelUid?: (uid: string) => string
}): string {
  const named = (opts.performedByName ?? '').trim()
  if (named) return named
  const uid = (opts.uid ?? '').trim()
  if (uid && opts.labelUid) {
    const labeled = opts.labelUid(uid).trim()
    if (labeled && labeled !== '—') return labeled
  }
  if (uid) return 'Chưa đặt tên'
  return 'Chưa rõ người'
}

/** Phần hành động của dòng gọi — không gồm OMICall / tên kênh kỹ thuật. */
export function callActionTitle(opts: {
  direction: 'inbound' | 'outbound' | string
  connected: boolean
  valid?: boolean
}): string {
  const dir = opts.direction === 'inbound' ? 'Gọi vào' : 'Gọi ra'
  const hear = opts.connected ? 'Nghe máy' : 'Không nghe máy'
  const parts = [dir, hear]
  if (opts.valid) parts.push('Hợp lệ')
  return parts.join(' · ')
}

/** Tiêu đề dòng: «Tên · hành động». */
export function timelineHeadline(actor: string, action: string): string {
  const a = actor.trim() || 'Chưa rõ người'
  const act = action.trim()
  return act ? `${a} · ${act}` : a
}

/** Khóa ngày local YYYY-MM-DD để nhóm mốc. */
export function timelineDayKey(ms: number, nowMs = Date.now()): string {
  if (!ms || ms <= 0) return 'unknown'
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return 'unknown'
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  void nowMs
  return `${y}-${m}-${day}`
}

/** Nhãn nhóm ngày trên cây thời gian. */
export function timelineDayLabel(ms: number, nowMs = Date.now()): string {
  if (!ms || ms <= 0) return 'Chưa rõ ngày'
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return 'Chưa rõ ngày'

  const startOfDay = (t: number) => {
    const x = new Date(t)
    x.setHours(0, 0, 0, 0)
    return x.getTime()
  }
  const dayStart = startOfDay(ms)
  const todayStart = startOfDay(nowMs)
  const diffDays = Math.round((todayStart - dayStart) / 86_400_000)
  if (diffDays === 0) return 'Hôm nay'
  if (diffDays === 1) return 'Hôm qua'
  return d.toLocaleDateString('vi-VN', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** Giờ ngắn trên mốc (không lặp lại cả ngày nếu đã có nhóm). */
export function timelineTimeLabel(ms: number): string {
  if (!ms || ms <= 0) return '—'
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

export type TimelineDayGroup<T extends { at: number }> = {
  dayKey: string
  dayLabel: string
  items: T[]
}

/** Nhóm các mốc đã sắp xếp (mới → cũ) theo ngày. */
export function groupTimelineByDay<T extends { at: number }>(
  rows: T[],
  nowMs = Date.now(),
): TimelineDayGroup<T>[] {
  const groups: TimelineDayGroup<T>[] = []
  const indexByKey = new Map<string, number>()
  for (const row of rows) {
    const dayKey = timelineDayKey(row.at, nowMs)
    const existing = indexByKey.get(dayKey)
    if (existing != null) {
      groups[existing]!.items.push(row)
      continue
    }
    indexByKey.set(dayKey, groups.length)
    groups.push({
      dayKey,
      dayLabel: timelineDayLabel(row.at, nowMs),
      items: [row],
    })
  }
  return groups
}
