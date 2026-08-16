import type { Lead, ScholarshipRecord, VietMyUserProfile } from '../types'
import { PAYMENT_SLOT_DEFS } from './leadFinance'
import { formatVnd, sumApprovedPaymentsVnd, sumRecordedPaymentsVnd } from './accountantN8nPayload'
import { foldFinanceStatusText, normalizePaymentApprovalStatus } from './accountantFinanceFilter'
import { scholarshipSelectLabel } from './leadProfileCatalog'
import { resolveStudentDisplayCode } from './studentDisplayCode'
import { looksLikeUserIdCode, resolveCounselorDisplayName } from './counselorDisplay'
import { computeFinanceObligation, type FinanceObligationSnapshot } from './financeObligation'
import type { FinanceTuitionCatalog } from './financeTuitionCatalog'
import type { FinanceDepositThresholds } from './financeThresholds'

export type AccountantStatusTag =
  | 'Mới'
  | 'Đang hoàn thiện'
  | 'Cọc'
  | 'Ghi danh'
  | 'Hoàn thiện phí'
  | 'Kiểm tra lại'
  | 'Full NE'
  | 'Chờ Full NE'

const STATUS_STYLES: Record<AccountantStatusTag, string> = {
  Mới: 'bg-slate-100 text-slate-800',
  'Đang hoàn thiện': 'bg-sky-100 text-sky-900',
  Cọc: 'bg-emerald-100 text-emerald-900',
  'Ghi danh': 'bg-blue-100 text-blue-900',
  'Hoàn thiện phí': 'bg-violet-100 text-violet-900',
  'Kiểm tra lại': 'bg-rose-100 text-rose-950',
  'Full NE': 'bg-amber-100 text-amber-950',
  'Chờ Full NE': 'bg-orange-100 text-orange-950',
}

export function accountantFinanceStatusTag(lead: Lead): AccountantStatusTag {
  const es = foldFinanceStatusText(String(lead.finance?.enrollmentStatus ?? ''))
  const fn = foldFinanceStatusText(String(lead.finance?.fullNeStatus ?? ''))
  // Cọc / hoàn thiện phí thắng «Chờ Full NE» — đủ tiền cọc đã xong việc chính trên hàng đợi.
  if (fn.includes('DA FULL')) return 'Full NE'
  if (es.includes('KIEM TRA')) return 'Kiểm tra lại'
  if (es.includes('COC THANH CONG')) return 'Cọc'
  if (es.includes('DA HOAN THIEN')) return 'Hoàn thiện phí'
  if (fn.includes('YEU CAU') || (lead.finance?.reqFullNe && !fn.includes('DA FULL'))) return 'Chờ Full NE'
  if (es.includes('DANG HOAN THIEN')) return 'Đang hoàn thiện'
  if (lead.status === 'ENROLLED' || lead.pipelineStatus === 'ENROLLED') return 'Ghi danh'
  return 'Mới'
}

export function statusTagClass(tag: AccountantStatusTag): string {
  return STATUS_STYLES[tag] ?? STATUS_STYLES.Mới
}

export type AccountantPaymentRow = {
  key: string
  label: string
  amountVnd: number
  amountLabel: string
  collectedAt: string
  receiptUrl: string
  approvalStatus: string
  approvalNote: string
  hasActivity: boolean
}

export type AccountantLeadSummary = {
  leadId: string
  studentName: string
  studentCode: string
  major: string
  educationLevel: string
  statusTag: AccountantStatusTag
  statusRaw: string
  totalRecordedVnd: number
  totalRecordedLabel: string
  totalApprovedVnd: number
  totalApprovedLabel: string
  scholarships: string[]
  payments: AccountantPaymentRow[]
  phone: string
  motherPhone: string
  nationalId: string
  /** TVV phụ trách — ưu tiên người được gán, không lấy tên admin nạp hồ sơ. */
  counselorName: string
  /** Nghĩa vụ kỳ 1 (học phí − HB); null nếu chưa tính được. */
  obligation: FinanceObligationSnapshot | null
}

function scholarshipLines(
  lead: Pick<Lead, 'scholarship1Id' | 'scholarship2Id'>,
  byId: Map<string, ScholarshipRecord>,
): string[] {
  const out: string[] = []
  const s1 = lead.scholarship1Id ? byId.get(lead.scholarship1Id) : undefined
  const s2 = lead.scholarship2Id ? byId.get(lead.scholarship2Id) : undefined
  if (s1) out.push(`HB1: ${scholarshipSelectLabel(s1)}`)
  else if (lead.scholarship1Id) out.push(`HB1: ${lead.scholarship1Id}`)
  if (s2) out.push(`HB2: ${scholarshipSelectLabel(s2)}`)
  else if (lead.scholarship2Id) out.push(`HB2: ${lead.scholarship2Id}`)
  return out
}

/** Tên nạp hồ sơ kiểu admin — không dùng làm nhãn TVV khi đã có người phụ trách. */
export function isAdminUploaderLabel(raw: string): boolean {
  const n = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
  if (!n) return false
  return /super\s*admin|superadmin|^admin$|quan\s*tri|platform/.test(n)
}

/**
 * TVV trên cổng kế toán: UID phụ trách + danh bạ.
 * Không ưu tiên uploaderName (thường là Superadmin khi admin nạp dữ liệu).
 */
export function resolveAccountantCounselorName(
  lead: Pick<Lead, 'assignedTo' | 'assignedCounselorId' | 'uploaderName'>,
  opts?: {
    directoryNames?: Map<string, string>
    directoryUsers?: readonly Pick<VietMyUserProfile, 'id' | 'displayName' | 'email'>[]
  },
): string {
  const uid = String(lead.assignedTo ?? lead.assignedCounselorId ?? '').trim()
  if (uid) {
    const named = resolveCounselorDisplayName(uid, {
      directoryNames: opts?.directoryNames,
      directoryUsers: opts?.directoryUsers,
    })
    if (named && named !== '—' && named !== 'Chưa đặt tên') return named
  }

  const up = String(lead.uploaderName ?? '').trim()
  if (up && !looksLikeUserIdCode(up) && !isAdminUploaderLabel(up)) return up

  if (uid) return 'Chưa đặt tên'
  return 'Chưa gán TVV'
}

export function buildAccountantLeadSummary(
  lead: Lead,
  opts: {
    scholarshipById: Map<string, ScholarshipRecord>
    codeSequenceIndex?: Map<string, number>
    directoryNames?: Map<string, string>
    directoryUsers?: readonly Pick<VietMyUserProfile, 'id' | 'displayName' | 'email'>[]
    catalog?: FinanceTuitionCatalog
    thresholds?: FinanceDepositThresholds
  },
): AccountantLeadSummary {
  const finance = lead.finance
  const payments: AccountantPaymentRow[] = PAYMENT_SLOT_DEFS.map(({ key, label }) => {
    const line = finance?.payments?.[key]
    const amountVnd = line?.amountVnd ?? 0
    const receiptUrl = String(line?.receiptUrl ?? '').trim()
    const approvalStatus =
      normalizePaymentApprovalStatus(line?.approvalStatus) || String(line?.approvalStatus ?? '').trim()
    return {
      key,
      label,
      amountVnd,
      amountLabel: amountVnd ? formatVnd(amountVnd) : '—',
      collectedAt: String(line?.collectedAt ?? '').trim() || '—',
      receiptUrl,
      approvalStatus: approvalStatus || 'Chờ duyệt',
      approvalNote: String(line?.approvalNote ?? '').trim(),
      hasActivity: amountVnd > 0 || Boolean(receiptUrl) || Boolean(approvalStatus),
    }
  })

  const obligation = computeFinanceObligation(lead, {
    catalog: opts.catalog,
    thresholds: opts.thresholds,
    scholarshipsById: opts.scholarshipById,
  })

  return {
    leadId: lead.id,
    studentName: String(lead.fullName || '—').trim(),
    studentCode: resolveStudentDisplayCode(lead, opts.codeSequenceIndex),
    major: String(lead.majorInterest || '—').trim(),
    educationLevel: String(lead.educationLevel || '').trim(),
    statusTag: accountantFinanceStatusTag(lead),
    statusRaw: String(finance?.enrollmentStatus ?? 'MỚI').trim() || 'MỚI',
    totalRecordedVnd: sumRecordedPaymentsVnd(finance),
    totalRecordedLabel: formatVnd(sumRecordedPaymentsVnd(finance)),
    totalApprovedVnd: sumApprovedPaymentsVnd(finance),
    totalApprovedLabel: formatVnd(sumApprovedPaymentsVnd(finance)),
    scholarships: scholarshipLines(lead, opts.scholarshipById),
    payments,
    phone: String(lead.phone ?? '').trim(),
    motherPhone: String(lead.motherPhone ?? '').trim(),
    nationalId: String(lead.nationalId ?? '').trim(),
    counselorName: resolveAccountantCounselorName(lead, {
      directoryNames: opts.directoryNames,
      directoryUsers: opts.directoryUsers,
    }),
    obligation,
  }
}
