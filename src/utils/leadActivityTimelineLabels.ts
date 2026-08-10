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
  if (uid) return `${uid.slice(0, 8)}…`
  return 'Chưa rõ người'
}

/** Phần hành động của dòng gọi — không gồm OMICall / tên kênh kỹ thuật. */
export function callActionTitle(opts: {
  direction: 'inbound' | 'outbound' | string
  connected: boolean
  valid?: boolean
}): string {
  const dir = opts.direction === 'inbound' ? 'Gọi vào' : 'Gọi ra'
  const hear = opts.connected ? 'Nghe máy' : 'Không nghe'
  const parts = [dir, hear]
  if (opts.valid) parts.push('HL')
  return parts.join(' · ')
}

/** Tiêu đề dòng: «Tên · hành động». */
export function timelineHeadline(actor: string, action: string): string {
  const a = actor.trim() || 'Chưa rõ người'
  const act = action.trim()
  return act ? `${a} · ${act}` : a
}
