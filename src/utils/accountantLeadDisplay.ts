import type { Lead, ScholarshipRecord } from '../types'
import { PAYMENT_SLOT_DEFS } from './leadFinance'
import { formatVnd, sumApprovedPaymentsVnd, sumRecordedPaymentsVnd } from './accountantN8nPayload'
import { scholarshipSelectLabel } from './leadProfileCatalog'
import { resolveStudentDisplayCode } from './studentDisplayCode'

export type AccountantStatusTag =
  | 'Mới'
  | 'Cọc'
  | 'Ghi danh'
  | 'Hoàn thiện phí'
  | 'Kiểm tra lại'
  | 'Full NE'

const STATUS_STYLES: Record<AccountantStatusTag, string> = {
  Mới: 'bg-slate-100 text-slate-800',
  Cọc: 'bg-emerald-100 text-emerald-900',
  'Ghi danh': 'bg-blue-100 text-blue-900',
  'Hoàn thiện phí': 'bg-violet-100 text-violet-900',
  'Kiểm tra lại': 'bg-rose-100 text-rose-950',
  'Full NE': 'bg-amber-100 text-amber-950',
}

export function accountantFinanceStatusTag(lead: Lead): AccountantStatusTag {
  const es = String(lead.finance?.enrollmentStatus ?? '').trim().toUpperCase()
  const fn = String(lead.finance?.fullNeStatus ?? '').trim().toUpperCase()
  if (lead.status === 'ENROLLED' || lead.pipelineStatus === 'ENROLLED') return 'Ghi danh'
  if (fn.includes('FULL NE') || fn.includes('ĐÃ FULL')) return 'Full NE'
  if (es.includes('CỌC THÀNH CÔNG')) return 'Cọc'
  if (es.includes('ĐÃ HOÀN THIỆN')) return 'Hoàn thiện phí'
  if (es.includes('KIỂM TRA')) return 'Kiểm tra lại'
  if (es.includes('ĐANG HOÀN THIỆN')) return 'Hoàn thiện phí'
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
  nationalId: string
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

export function buildAccountantLeadSummary(
  lead: Lead,
  opts: {
    scholarshipById: Map<string, ScholarshipRecord>
    codeSequenceIndex?: Map<string, number>
  },
): AccountantLeadSummary {
  const finance = lead.finance
  const payments: AccountantPaymentRow[] = PAYMENT_SLOT_DEFS.map(({ key, label }) => {
    const line = finance?.payments?.[key]
    const amountVnd = line?.amountVnd ?? 0
    const receiptUrl = String(line?.receiptUrl ?? '').trim()
    const approvalStatus = String(line?.approvalStatus ?? '').trim()
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
    nationalId: String(lead.nationalId ?? '').trim(),
  }
}
