import type { LeadFinanceRecord } from '../types'
import { formatVnd, sumApprovedPaymentsVnd, sumRecordedPaymentsVnd } from './accountantN8nPayload'

/** Cột «Đã nộp» trên danh sách hồ sơ — tổng tiền TVV đã ghi đến hiện tại. */
export function formatLeadPaidToDate(finance: LeadFinanceRecord | undefined): {
  recordedVnd: number
  approvedVnd: number
  label: string
  title: string
} {
  const recordedVnd = sumRecordedPaymentsVnd(finance)
  const approvedVnd = sumApprovedPaymentsVnd(finance)
  if (recordedVnd <= 0 && approvedVnd <= 0) {
    return { recordedVnd: 0, approvedVnd: 0, label: '—', title: 'Chưa có khoản nộp ghi nhận' }
  }
  const label = formatVnd(recordedVnd)
  const title =
    approvedVnd > 0 && approvedVnd !== recordedVnd
      ? `Đã nộp (ghi nhận): ${formatVnd(recordedVnd)} · Đã duyệt: ${formatVnd(approvedVnd)}`
      : `Đã nộp đến hôm nay: ${formatVnd(recordedVnd)}`
  return { recordedVnd, approvedVnd, label, title }
}
