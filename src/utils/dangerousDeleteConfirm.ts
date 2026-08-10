/**
 * Xác nhận trước thao tác xóa dữ liệu không hoàn tác được.
 * Dùng confirm / prompt — không phụ thuộc modal UI.
 */

const BATCH_PHRASE = 'XOA VINH VIEN'

function normalizeConfirmPhrase(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
}

function browserConfirm(message: string): boolean {
  return typeof globalThis.confirm === 'function' ? globalThis.confirm(message) : false
}

function browserPrompt(message: string, defaultValue = ''): string | null {
  return typeof globalThis.prompt === 'function' ? globalThis.prompt(message, defaultValue) : null
}

/** Chuẩn hóa cụm gõ xác nhận (bỏ dấu, gộp khoảng trắng). */
export function normalizeDangerousDeletePhrase(raw: string): string {
  return normalizeConfirmPhrase(raw)
}

export function dangerousDeleteBatchPhrase(): string {
  return BATCH_PHRASE
}

/**
 * Xóa hàng loạt theo chương trình / bộ lọc — 2 bước: confirm + gõ cụm.
 */
export function confirmDangerousLeadBatchDelete(opts: {
  scopeLabel: string
  /** Số ước lượng nếu đã biết; null/undefined = «tất cả khớp phạm vi». */
  estimatedCount?: number | null
}): boolean {
  const n = opts.estimatedCount
  const countPart =
    n != null && n > 0
      ? ` khoảng ${n.toLocaleString('vi-VN')} hồ sơ`
      : ' TẤT CẢ hồ sơ khớp phạm vi'
  const ok1 = browserConfirm(
    [
      'CẢNH BÁO — XÓA VĨNH VIỄN',
      '',
      `Bạn sắp xóa${countPart} thuộc ${opts.scopeLabel}.`,
      '',
      'Không hoàn tác được. Dữ liệu biến mất khỏi hệ thống (không vào thùng rác).',
      '',
      'Chỉ tiếp tục nếu bạn chắc chắn đây là lô nhập nhầm / cần gỡ hẳn.',
    ].join('\n'),
  )
  if (!ok1) return false

  const typed = browserPrompt(
    `Để xác nhận, gõ chính xác:\n\n${BATCH_PHRASE}\n\n(Phạm vi: ${opts.scopeLabel})`,
    '',
  )
  if (typed == null) return false
  return normalizeConfirmPhrase(typed) === BATCH_PHRASE
}

/**
 * Xóa các hồ sơ đã tick trên bảng — confirm rõ số lượng; ≥10 thì thêm bước gõ cụm.
 */
export function confirmDangerousSelectedLeadsDelete(count: number): boolean {
  const n = Math.max(0, Math.floor(count))
  if (n <= 0) return false
  const ok1 = browserConfirm(
    [
      'CẢNH BÁO — XÓA VĨNH VIỄN',
      '',
      `Bạn sắp xóa ${n.toLocaleString('vi-VN')} hồ sơ đã chọn.`,
      '',
      'Không hoàn tác được.',
    ].join('\n'),
  )
  if (!ok1) return false
  if (n < 10) return true

  const typed = browserPrompt(
    `Bạn đang xóa ${n.toLocaleString('vi-VN')} hồ sơ.\nGõ chính xác «${BATCH_PHRASE}» để tiếp tục:`,
    '',
  )
  if (typed == null) return false
  return normalizeConfirmPhrase(typed) === BATCH_PHRASE
}

/** Xóa một hồ sơ từ chi tiết. */
export function confirmDangerousSingleLeadDelete(leadLabel: string): boolean {
  const label = leadLabel.trim() || 'hồ sơ này'
  return browserConfirm(
    [
      'CẢNH BÁO — XÓA VĨNH VIỄN',
      '',
      `Xóa hồ sơ «${label}» khỏi hệ thống?`,
      '',
      'Không hoàn tác được. Chỉ Admin được xóa.',
    ].join('\n'),
  )
}

/**
 * Xóa tài khoản nhân sự / quản lý (Auth + Firestore) — confirm + gõ cụm.
 */
export function confirmDangerousStaffAccountDelete(accountLabel: string): boolean {
  const label = accountLabel.trim() || 'tài khoản này'
  const ok1 = browserConfirm(
    [
      'CẢNH BÁO — XÓA VĨNH VIỄN TÀI KHOẢN',
      '',
      `Xóa «${label}»?`,
      '',
      'Hồ sơ trên hệ thống và tài khoản đăng nhập sẽ bị gỡ — không hoàn tác được.',
    ].join('\n'),
  )
  if (!ok1) return false
  const typed = browserPrompt(
    `Để xác nhận, gõ chính xác:\n\n${BATCH_PHRASE}\n\n(Tài khoản: ${label})`,
    '',
  )
  if (typed == null) return false
  return normalizeConfirmPhrase(typed) === BATCH_PHRASE
}
