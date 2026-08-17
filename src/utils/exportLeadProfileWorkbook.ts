import * as XLSX from 'xlsx'
import type { Lead, LeadPipelineStatus, PriorityTag, ScholarshipRecord } from '../types'
import { LEAD_COUNSELOR_STATUS_LABELS } from '../types'
import { PAYMENT_SLOT_DEFS } from './leadFinance'
import { computeFinanceObligation } from './financeObligation'
import { sumApprovedPaymentsVnd, sumRecordedPaymentsVnd } from './accountantN8nPayload'
import { leadToCoreDraft } from './leadProfileEdit'
import { scholarshipSelectLabel } from './leadProfileCatalog'
import { resolveStudentDisplayCode } from './studentDisplayCode'
import { accountantFinanceStatusTag } from './accountantLeadDisplay'
import { leadAssignedUid } from '../auth/leadAccess'
import { resolveMlWinDisplay } from './mlWinMock'
import type { InfoScoreRuntime } from './infoScoreRules'
import { INFO_SCORE_COLUMN_LABEL, PROFILE_SCORE_COLUMN_LABEL } from './leadScoreDisplayCopy'

const PIPELINE_LABEL: Record<LeadPipelineStatus, string> = {
  NEW: 'Mới',
  CONTACTED: 'Đã liên hệ',
  QUALIFIED: 'Đủ điều kiện',
  APPLIED: 'Đã nộp hồ sơ',
  ENROLLED: 'Đã ghi danh',
  LOST: 'Không còn tiềm năng',
  ARCHIVED: 'Lưu trữ',
}

export type LeadProfileExportOptions = {
  filename?: string
  sheetName?: string
  profileName?: string
  scholarshipsById?: Map<string, ScholarshipRecord>
  counselorNameById?: Map<string, string>
  evaluatedByLeadId?: Map<string, { calculatedScore: number; priorityTag: PriorityTag }>
  studentCodeIndex?: Map<string, number>
  infoScoreRuntime?: InfoScoreRuntime | null
}

function cellText(v: unknown): string {
  if (v === undefined || v === null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (typeof v === 'object' && v !== null && 'toDate' in v && typeof (v as { toDate?: () => Date }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate().toISOString().slice(0, 10)
  }
  return ''
}

function moneyCell(n: number | '' | undefined): string | number {
  if (n === '' || n === undefined) return ''
  return n
}

function scholarshipLabel(
  id: string | undefined,
  scholarshipsById?: Map<string, ScholarshipRecord>,
): string {
  const key = String(id ?? '').trim()
  if (!key) return ''
  const rec = scholarshipsById?.get(key)
  return rec ? scholarshipSelectLabel(rec) : key
}

function assigneeLabel(lead: Lead, counselorNameById?: Map<string, string>): string {
  const uid = leadAssignedUid(lead) ?? ''
  if (!uid) return ''
  return counselorNameById?.get(uid)?.trim() || uid
}

/** Một dòng Excel — đủ trường hồ sơ SV + CRM + thu phí. */
export function buildLeadProfileExportRow(
  lead: Lead,
  options: LeadProfileExportOptions = {},
): Record<string, string | number> {
  const draft = leadToCoreDraft(lead)
  const ev = options.evaluatedByLeadId?.get(lead.id)
  const obligation = computeFinanceObligation(lead, { scholarshipsById: options.scholarshipsById })
  const finance = lead.finance
  const row: Record<string, string | number> = {
    'Mã sinh viên': resolveStudentDisplayCode(lead, options.studentCodeIndex),
    'Mã khách hàng': draft.customerId,
    'Tên sinh viên': draft.fullName,
    'Ngày sinh': draft.dateOfBirth,
    'Giới tính': draft.gender,
    'Nơi sinh': draft.placeOfBirth,
    'CCCD/Passport': draft.nationalIdNotAvailable ? 'Chưa có' : draft.nationalId,
    Email: draft.studentEmail,
    'Điện thoại': draft.phone,
    'ĐT người liên hệ': draft.parentPhone,
    'Họ tên bố': draft.fatherName,
    'ĐT bố': draft.fatherPhone,
    'Họ tên mẹ': draft.motherName,
    'ĐT mẹ': draft.motherPhone,
    'Người giám hộ': draft.guardian,
    'Dân tộc': draft.ethnicity,
    'Tỉnh / Thành phố': draft.province,
    'Quận/huyện': draft.hanoiArea,
    'Địa chỉ': draft.address,
    'Địa chỉ thường trú': draft.permanentAddress,
    'Nơi ở hiện tại': draft.currentResidence,
    'Trường học': draft.highSchool,
    Lớp: draft.gradeClass,
    'Học lực': draft.academicPerformance,
    'Điểm tốt nghiệp': draft.graduationScore,
    'Hệ đào tạo': draft.educationLevel,
    'Ngành quan tâm': draft.majorInterest,
    'Hình thức học': draft.studyIntention,
    'Loại trường': draft.schoolType,
    'Cơ sở': draft.campus,
    'Niên khóa': draft.schoolYear,
    'Đối tượng': draft.applicantCategory,
    Nguồn: draft.source,
    'Nguồn 1': draft.source1,
    'Nguồn 2': draft.source2,
    'Chương trình / đợt nhập': cellText(lead.intakeProgram),
    'Mong muốn': draft.aspirations,
    'Sở thích': draft.hobbies,
    'Ghi chú 1': draft.profileNote1,
    'Ghi chú 2': draft.profileNote2,
    'Nội dung lưu ý khác': draft.otherAttentionNotes,
    'Ghi chú TVV': cellText(lead.lastCounselorNote),
    'Mô tả': draft.description,
    'Tư vấn viên': assigneeLabel(lead, options.counselorNameById),
    'Tình trạng tư vấn': LEAD_COUNSELOR_STATUS_LABELS[lead.status] ?? lead.status,
    'Tình trạng hồ sơ': PIPELINE_LABEL[lead.pipelineStatus] ?? lead.pipelineStatus,
    'Nhãn ưu tiên': ev?.priorityTag ?? lead.priorityTag ?? '',
    [PROFILE_SCORE_COLUMN_LABEL]: ev?.calculatedScore ?? lead.calculatedScore ?? '',
    [`${INFO_SCORE_COLUMN_LABEL} (%)`]: resolveMlWinDisplay(lead, options.infoScoreRuntime).mlWinProbability,
    'Thu phí (ghi danh)': cellText(finance?.enrollmentStatus),
    'Nhãn kế toán': accountantFinanceStatusTag(lead),
    'Full NE': cellText(finance?.fullNeStatus),
    'Ngày Full NE': cellText(finance?.fullNeAt),
    'Học bổng 1': scholarshipLabel(draft.scholarship1Id, options.scholarshipsById),
    'Học bổng 2': scholarshipLabel(draft.scholarship2Id, options.scholarshipsById),
    'Học phí kỳ 1 (đ)': moneyCell(obligation.tuitionMissing ? '' : obligation.tuitionTerm1Vnd),
    'HB trừ kỳ 1 (đ)': moneyCell(obligation.scholarshipTerm1Vnd),
    'Phải đóng kỳ 1 (đ)': moneyCell(obligation.tuitionMissing ? '' : obligation.dueTerm1Vnd),
    'Đã ghi nhận (đ)': sumRecordedPaymentsVnd(finance),
    'Đã duyệt (đ)': sumApprovedPaymentsVnd(finance),
    'Còn thiếu (đ)': moneyCell(obligation.tuitionMissing ? '' : obligation.remainingVnd),
    'Kho lưu trữ': cellText(lead.archiveLabel),
    'Ngày cất kho': cellText(lead.archivedAt),
  }

  for (const slot of PAYMENT_SLOT_DEFS) {
    const line = finance?.payments?.[slot.key]
    row[`${slot.label} — tiền (đ)`] = line?.amountVnd ? line.amountVnd : ''
    row[`${slot.label} — ngày thu`] = cellText(line?.collectedAt)
    row[`${slot.label} — duyệt`] = cellText(line?.approvalStatus)
    row[`${slot.label} — ghi chú KT`] = cellText(line?.approvalNote)
    row[`${slot.label} — hóa đơn`] = cellText(line?.receiptUrl)
  }

  return row
}

export function exportLeadProfileWorkbook(rows: Lead[], options: LeadProfileExportOptions = {}): void {
  if (!rows.length) return
  const data = rows.map((lead) => buildLeadProfileExportRow(lead, options))
  const ws = XLSX.utils.json_to_sheet(data)
  const headers = Object.keys(data[0] ?? {})
  ws['!cols'] = headers.map((h) => ({ wch: Math.min(36, Math.max(14, h.length + 2)) }))
  const wb = XLSX.utils.book_new()
  const sheetName = (options.sheetName ?? 'Hồ sơ sinh viên').slice(0, 31)
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  const day = new Date().toISOString().slice(0, 10)
  try {
    XLSX.writeFile(wb, options.filename ?? `VietMy_HoSo_SinhVien_${day}.xlsx`)
  } catch (e) {
    console.error(e)
    throw new Error('Không tải được file Excel. Thử lại hoặc kiểm tra trình duyệt đã chặn tải file.')
  }
}
