/**
 * Xác nhận trước thao tác xóa dữ liệu không hoàn tác được.
 * Ưu tiên hộp thoại trong app (`appConfirm`); fallback confirm/prompt trình duyệt khi chưa gắn host.
 */
import { appConfirm } from './appConfirm'

const BATCH_PHRASE = 'XOA VINH VIEN'

function normalizeConfirmPhrase(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
}

/** Chuẩn hóa cụm gõ xác nhận (bỏ dấu, gộp khoảng trắng). */
export function normalizeDangerousDeletePhrase(raw: string): string {
  return normalizeConfirmPhrase(raw)
}

export function dangerousDeleteBatchPhrase(): string {
  return BATCH_PHRASE
}

/**
 * Xóa hàng loạt theo chương trình / bộ lọc — confirm + gõ cụm.
 */
export async function confirmDangerousLeadBatchDelete(opts: {
  scopeLabel: string
  /** Số ước lượng nếu đã biết; null/undefined = «tất cả khớp phạm vi». */
  estimatedCount?: number | null
}): Promise<boolean> {
  const n = opts.estimatedCount
  const countPart =
    n != null && n > 0
      ? `khoảng ${n.toLocaleString('vi-VN')} hồ sơ`
      : 'tất cả hồ sơ khớp phạm vi'

  return appConfirm({
    variant: 'danger',
    title: 'Xóa vĩnh viễn cả lô',
    description: `Bạn sắp xóa ${countPart} thuộc ${opts.scopeLabel}.`,
    details: [
      'Không hoàn tác được — dữ liệu biến mất khỏi hệ thống (không vào thùng rác).',
      'Chỉ tiếp tục nếu đây là lô nhập nhầm hoặc cần gỡ hẳn.',
    ],
    confirmLabel: 'Tiếp tục xóa',
    cancelLabel: 'Giữ lại',
    requirePhrase: BATCH_PHRASE,
    phraseHint: `Gõ ${BATCH_PHRASE} để xác nhận phạm vi «${opts.scopeLabel}»`,
  })
}

/**
 * Xóa các hồ sơ đã tick trên bảng — ≥10 thì thêm bước gõ cụm.
 */
export async function confirmDangerousSelectedLeadsDelete(count: number): Promise<boolean> {
  const n = Math.max(0, Math.floor(count))
  if (n <= 0) return false

  return appConfirm({
    variant: 'danger',
    title: n === 1 ? 'Xóa hồ sơ đã chọn' : `Xóa ${n.toLocaleString('vi-VN')} hồ sơ đã chọn`,
    description:
      n === 1
        ? 'Hồ sơ sẽ bị gỡ khỏi hệ thống ngay.'
        : `Bạn sắp xóa ${n.toLocaleString('vi-VN')} hồ sơ đã chọn trên danh sách.`,
    details: ['Không hoàn tác được.', 'Chỉ Admin mới được xóa hồ sơ.'],
    confirmLabel: n === 1 ? 'Xóa hồ sơ' : `Xóa ${n.toLocaleString('vi-VN')} hồ sơ`,
    cancelLabel: 'Giữ lại',
    ...(n >= 10
      ? {
          requirePhrase: BATCH_PHRASE,
          phraseHint: `Đang xóa nhiều hồ sơ — gõ ${BATCH_PHRASE} để tiếp tục`,
        }
      : {}),
  })
}

/** Xóa một hồ sơ từ chi tiết. */
export async function confirmDangerousSingleLeadDelete(leadLabel: string): Promise<boolean> {
  const label = leadLabel.trim() || 'hồ sơ này'
  return appConfirm({
    variant: 'danger',
    title: 'Xóa hồ sơ',
    description: `Xóa hồ sơ «${label}» khỏi hệ thống?`,
    details: ['Không hoàn tác được.', 'Chỉ Admin được xóa.'],
    confirmLabel: 'Xóa hồ sơ',
    cancelLabel: 'Giữ lại',
  })
}

/**
 * Xóa tài khoản nhân sự / quản lý (Auth + Firestore) — confirm + gõ cụm.
 */
export async function confirmDangerousStaffAccountDelete(accountLabel: string): Promise<boolean> {
  const label = accountLabel.trim() || 'tài khoản này'
  return appConfirm({
    variant: 'danger',
    title: 'Xóa tài khoản',
    description: `Xóa tài khoản «${label}»?`,
    details: [
      'Hồ sơ trên hệ thống và tài khoản đăng nhập sẽ bị gỡ.',
      'Không hoàn tác được.',
    ],
    confirmLabel: 'Xóa tài khoản',
    cancelLabel: 'Giữ lại',
    requirePhrase: BATCH_PHRASE,
    phraseHint: `Gõ ${BATCH_PHRASE} để xác nhận xóa «${label}»`,
  })
}

/** Xác nhận lần cuối trước khi bắt đầu xóa lô đã quét được. */
export async function confirmDangerousLeadBatchDeleteFinal(opts: {
  scopeLabel: string
  foundCount: number
  mayHaveMore?: boolean
}): Promise<boolean> {
  const details = [
    opts.mayHaveMore
      ? 'Có thể còn thêm hồ sơ ngoài lô này — hệ thống sẽ quét tiếp sau khi xóa lô đầu.'
      : null,
    'Bấm xác nhận để xóa vĩnh viễn. Hủy để dừng.',
  ].filter(Boolean) as string[]

  return appConfirm({
    variant: 'danger',
    title: 'Bắt đầu xóa?',
    description: `Đã tìm thấy ${opts.foundCount.toLocaleString('vi-VN')} hồ sơ thuộc ${opts.scopeLabel}.`,
    details,
    confirmLabel: 'Bắt đầu xóa',
    cancelLabel: 'Dừng lại',
  })
}
