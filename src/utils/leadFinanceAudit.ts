import type { Lead, LeadFinanceRecord, LeadPaymentSlotKey } from '../types'
import {
  PAYMENT_SLOT_DEFS,
  financeDirtySlotKeys,
  formatAmountInput,
  type LeadFinanceDraft,
} from './leadFinance'

function parseAmount(s: string): number {
  return parseInt(String(s ?? '').replace(/\D/g, ''), 10) || 0
}

function slotLabel(key: LeadPaymentSlotKey): string {
  return PAYMENT_SLOT_DEFS.find((s) => s.key === key)?.label ?? key
}

function approvalPhrase(status: string): string {
  const s = status.trim()
  if (s === 'ĐỒNG Ý') return 'kế toán đã xác nhận'
  if (s === 'TỪ CHỐI') return 'kế toán từ chối'
  if (s === 'KIỂM TRA LẠI') return 'kế toán yêu cầu kiểm tra lại'
  if (!s) return 'chờ kế toán xác nhận'
  return s
}

function describeSlotPart(label: string, row: LeadFinanceDraft['payments'][LeadPaymentSlotKey]): string {
  const amount = parseAmount(row.amount)
  const money = amount > 0 ? `${formatAmountInput(amount)}đ` : row.pendingFile ? 'có chứng từ mới' : 'có chứng từ'
  const when = row.collectedAt.trim() ? `, ngày ${row.collectedAt.trim()}` : ''
  return `${label} ${money}${when} (${approvalPhrase(row.approvalStatus)})`
}

/**
 * Mô tả dòng thời gian khi TVV ghi nhận thu (tạo hồ sơ — liệt kê mọi khoản có dữ liệu).
 * Ví dụ: «Nạp tiền: Cọc / Ứng 5.000.000đ (chờ kế toán xác nhận)»
 */
export function describeFinanceDepositAudit(draft: LeadFinanceDraft): string | null {
  const parts: string[] = []
  for (const { key, label } of PAYMENT_SLOT_DEFS) {
    const row = draft.payments[key]
    const amount = parseAmount(row.amount)
    if (amount <= 0 && !row.pendingFile && !row.collectedAt.trim()) continue
    parts.push(describeSlotPart(label, row))
  }
  if (draft.reqFullNe) {
    parts.push('Yêu cầu Full NE')
  }
  if (!parts.length) return null
  return `Nạp tiền: ${parts.join('; ')}`
}

/**
 * Chỉ các khoản / Full NE vừa đổi so với bản đã lưu — tránh ghi lại cả phần cũ trên dòng thời gian.
 */
export function describeFinanceDepositAuditDiff(lead: Lead, draft: LeadFinanceDraft): string | null {
  const parts: string[] = []
  const dirtyKeys = new Set(financeDirtySlotKeys(lead, draft))
  for (const { key, label } of PAYMENT_SLOT_DEFS) {
    if (!dirtyKeys.has(key)) continue
    parts.push(describeSlotPart(label, draft.payments[key]))
  }
  const beforeReq = Boolean(lead.finance?.reqFullNe)
  if (beforeReq !== draft.reqFullNe) {
    parts.push(draft.reqFullNe ? 'Yêu cầu Full NE' : 'Huỷ yêu cầu Full NE')
  }
  if (!parts.length) return null
  return `Nạp tiền: ${parts.join('; ')}`
}

/** Sau khi kế toán duyệt / từ chối một đợt. */
export function describeAccountantPaymentAudit(opts: {
  slotKey: LeadPaymentSlotKey
  decision: 'ĐỒNG Ý' | 'TỪ CHỐI'
  amountVnd: number
  collectedAt?: string
}): string {
  const money = opts.amountVnd > 0 ? `${formatAmountInput(opts.amountVnd)}đ` : '0đ'
  const when = opts.collectedAt?.trim() ? `, ngày ${opts.collectedAt.trim()}` : ''
  const verb = opts.decision === 'ĐỒNG Ý' ? 'Kế toán xác nhận tiền' : 'Kế toán từ chối tiền'
  return `${verb}: ${slotLabel(opts.slotKey)} ${money}${when}`
}

/** Tóm tắt từ bản ghi đã lưu (khi cần). */
export function describeStoredFinanceAudit(finance: LeadFinanceRecord | null | undefined): string | null {
  if (!finance?.payments) return null
  const parts: string[] = []
  for (const { key, label } of PAYMENT_SLOT_DEFS) {
    const line = finance.payments[key]
    const amount = line?.amountVnd ?? 0
    if (!amount && !line?.receiptUrl && !line?.collectedAt) continue
    const money = amount > 0 ? `${formatAmountInput(amount)}đ` : 'có chứng từ'
    const when = line?.collectedAt ? `, ngày ${line.collectedAt}` : ''
    parts.push(`${label} ${money}${when} (${approvalPhrase(line?.approvalStatus ?? '')})`)
  }
  if (!parts.length) return null
  return `Nạp tiền: ${parts.join('; ')}`
}
