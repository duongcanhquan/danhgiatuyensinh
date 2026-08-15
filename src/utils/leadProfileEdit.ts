import type { Lead, LeadCounselorStatus, LeadPipelineStatus, PriorityTag } from '../types'
import { deleteField } from 'firebase/firestore'
import { studyFormatFromParts } from './studyFormatMerge'
import { computeLeadUniqueHash, nationalIdHashFromInput } from './leadIdentity'
import { formatVnPhoneInput, normalizeDobToDdMmYyyy } from './publicRegistrationForm'

/** Trường chỉnh trên panel chi tiết — đồng bộ Firestore + chấm điểm qua `leadToEvaluationRecord`. */
export type LeadCoreDraft = {
  fullName: string
  systemCode: string
  customerId: string
  dateOfBirth: string
  gender: string
  placeOfBirth: string
  phone: string
  parentPhone: string
  source: string
  province: string
  address: string
  ethnicity: string
  permanentAddress: string
  currentResidence: string
  highSchool: string
  gradeClass: string
  educationLevel: string
  majorInterest: string
  academicPerformance: string
  graduationScore: string
  studyIntention: string
  applicantCategory: string
  schoolType: string
  financialStatus: string
  hanoiArea: string
  campus: string
  schoolYear: string
  description: string
  aspirations: string
  hobbies: string
  fieldTripNotes: string
  profileNote1: string
  profileNote2: string
  otherAttentionNotes: string
  nationalId: string
  nationalIdNotAvailable: boolean
  studentEmail: string
  source1: string
  source2: string
  fatherName: string
  fatherPhone: string
  motherName: string
  motherPhone: string
  guardian: string
  scholarship1Id: string
  scholarship2Id: string
}

export function emptyLeadCoreDraft(): LeadCoreDraft {
  return {
    fullName: '',
    systemCode: '',
    customerId: '',
    dateOfBirth: '',
    gender: '',
    placeOfBirth: '',
    phone: '',
    parentPhone: '',
    source: '',
    province: '',
    address: '',
    ethnicity: '',
    permanentAddress: '',
    currentResidence: '',
    highSchool: '',
    gradeClass: '',
    educationLevel: '',
    majorInterest: '',
    academicPerformance: '',
    graduationScore: '',
    studyIntention: '',
    applicantCategory: '',
    schoolType: '',
    financialStatus: '',
    hanoiArea: '',
    campus: '',
    schoolYear: '',
    description: '',
    aspirations: '',
    hobbies: '',
    fieldTripNotes: '',
    profileNote1: '',
    profileNote2: '',
    otherAttentionNotes: '',
    nationalId: '',
    nationalIdNotAvailable: false,
    studentEmail: '',
    source1: '',
    source2: '',
    fatherName: '',
    fatherPhone: '',
    motherName: '',
    motherPhone: '',
    guardian: '',
    scholarship1Id: '',
    scholarship2Id: '',
  }
}

export function leadToCoreDraft(lead: Lead): LeadCoreDraft {
  return {
    fullName: lead.fullName ?? '',
    systemCode: lead.systemCode ?? '',
    customerId: lead.customerId ?? '',
    dateOfBirth: normalizeDobToDdMmYyyy(lead.dateOfBirth ?? ''),
    gender: lead.gender ?? '',
    placeOfBirth: lead.placeOfBirth ?? '',
    phone: formatVnPhoneInput(lead.phone ?? '') || (lead.phone ?? ''),
    parentPhone: formatVnPhoneInput(lead.parentPhone ?? '') || (lead.parentPhone ?? ''),
    source: lead.source1 ?? lead.source ?? '',
    province: lead.province ?? '',
    address: lead.permanentAddress?.trim() || lead.address || '',
    ethnicity: lead.ethnicity ?? '',
    permanentAddress: lead.permanentAddress?.trim() || lead.address || '',
    currentResidence: lead.currentResidence ?? '',
    highSchool: lead.highSchool ?? '',
    gradeClass: lead.gradeClass ?? '',
    ...(() => {
      const fmt = studyFormatFromParts(lead.studyIntention, lead.educationLevel)
      return { educationLevel: fmt, studyIntention: fmt }
    })(),
    majorInterest: lead.majorInterest ?? '',
    academicPerformance: lead.academicPerformance ?? '',
    graduationScore: lead.graduationScore ?? '',
    applicantCategory: lead.applicantCategory ?? '',
    schoolType: lead.schoolType ?? '',
    financialStatus: lead.financialStatus ?? '',
    hanoiArea: lead.hanoiArea ?? '',
    campus: lead.campus ?? '',
    schoolYear: lead.schoolYear ?? '',
    description: lead.description ?? '',
    aspirations: lead.aspirations ?? '',
    hobbies: lead.hobbies ?? '',
    fieldTripNotes: lead.fieldTripNotes ?? '',
    profileNote1: lead.profileNote1 ?? '',
    profileNote2: lead.profileNote2 ?? '',
    otherAttentionNotes: lead.otherAttentionNotes ?? '',
    nationalId: lead.nationalId ?? '',
    nationalIdNotAvailable: Boolean(lead.nationalIdNotAvailable),
    studentEmail: lead.studentEmail ?? '',
    source1: lead.source1 ?? lead.source ?? '',
    source2: lead.source2 ?? '',
    fatherName: lead.fatherName ?? '',
    fatherPhone: formatVnPhoneInput(lead.fatherPhone ?? '') || (lead.fatherPhone ?? ''),
    motherName: lead.motherName ?? '',
    motherPhone: formatVnPhoneInput(lead.motherPhone ?? '') || (lead.motherPhone ?? ''),
    guardian: lead.guardian ?? '',
    scholarship1Id: lead.scholarship1Id ?? '',
    scholarship2Id: lead.scholarship2Id ?? '',
  }
}

function norm(s: string): string {
  return s.trim()
}

function normNationalId(draft: LeadCoreDraft): string {
  if (draft.nationalIdNotAvailable) return ''
  const v = draft.nationalId.trim().toUpperCase()
  if (!v || v === 'CHƯA CÓ') return ''
  if (/^\d+$/.test(v)) return v.slice(0, 12)
  return v.replace(/[^A-Z0-9]/g, '').slice(0, 15)
}

/** Payload mở rộng cho tạo / cập nhật Firestore (gồm boolean). */
export function leadCoreDraftToFirestoreFields(draft: LeadCoreDraft): Record<string, unknown> {
  const source1 = norm(draft.source1)
  const sourcePrimary = source1 || norm(draft.source)
  const o: Record<string, unknown> = {
    fullName: norm(draft.fullName),
    customerId: norm(draft.customerId),
    ...(norm(draft.systemCode) ? { systemCode: norm(draft.systemCode) } : {}),
    dateOfBirth: normalizeDobToDdMmYyyy(draft.dateOfBirth) || norm(draft.dateOfBirth),
    phone: formatVnPhoneInput(draft.phone) || norm(draft.phone),
    parentPhone: formatVnPhoneInput(draft.parentPhone) || norm(draft.parentPhone),
    source: sourcePrimary,
    province: norm(draft.province),
    address: norm(draft.permanentAddress) || norm(draft.address),
    highSchool: norm(draft.highSchool),
    gradeClass: norm(draft.gradeClass),
    ...(() => {
      const fmt = studyFormatFromParts(draft.studyIntention, draft.educationLevel)
      return { educationLevel: fmt, studyIntention: fmt }
    })(),
    description: norm(draft.description),
    nationalIdNotAvailable: draft.nationalIdNotAvailable,
    studentEmail: norm(draft.studentEmail),
    source1,
    source2: norm(draft.source2),
    fatherName: norm(draft.fatherName),
    fatherPhone: formatVnPhoneInput(draft.fatherPhone) || norm(draft.fatherPhone),
    motherName: norm(draft.motherName),
    motherPhone: formatVnPhoneInput(draft.motherPhone) || norm(draft.motherPhone),
    guardian: norm(draft.guardian),
    scholarship1Id: norm(draft.scholarship1Id),
    scholarship2Id: norm(draft.scholarship2Id),
  }
  const nid = normNationalId(draft)
  if (draft.nationalIdNotAvailable) o.nationalId = ''
  else if (nid) o.nationalId = nid
  else o.nationalId = ''

  const opt = (k: keyof LeadCoreDraft, key: string) => {
    const v = norm(String(draft[k] ?? ''))
    if (v) o[key] = v
  }
  opt('gender', 'gender')
  opt('placeOfBirth', 'placeOfBirth')
  opt('majorInterest', 'majorInterest')
  opt('academicPerformance', 'academicPerformance')
  opt('graduationScore', 'graduationScore')
  opt('applicantCategory', 'applicantCategory')
  opt('ethnicity', 'ethnicity')
  opt('permanentAddress', 'permanentAddress')
  opt('currentResidence', 'currentResidence')
  opt('schoolType', 'schoolType')
  opt('financialStatus', 'financialStatus')
  opt('hanoiArea', 'hanoiArea')
  opt('campus', 'campus')
  opt('schoolYear', 'schoolYear')
  opt('aspirations', 'aspirations')
  opt('hobbies', 'hobbies')
  opt('fieldTripNotes', 'fieldTripNotes')
  opt('profileNote1', 'profileNote1')
  opt('profileNote2', 'profileNote2')
  opt('otherAttentionNotes', 'otherAttentionNotes')
  return o
}

/**
 * Chỉ các field đổi so với `before` — dùng `updateDoc` (không gửi field không đổi).
 * So sánh với bản đã chuẩn hóa từ lead (leadToCoreDraft) để tránh dirty giả
 * (vd. permanentAddress lấy từ address, SĐT format lại) → timeline / nút Lưu sai.
 */
export function buildLeadCoreFirestorePatch(before: Lead, draft: LeadCoreDraft): Record<string, unknown> {
  const baseline = leadCoreDraftToFirestoreFields(leadToCoreDraft(before))
  const next = leadCoreDraftToFirestoreFields(draft)
  const patch: Record<string, unknown> = {}
  const keys = Object.keys(next)

  const sameScalar = (a: unknown, b: unknown): boolean => {
    if (typeof a === 'boolean' || typeof b === 'boolean') return Boolean(a) === Boolean(b)
    const sa = a == null ? '' : typeof a === 'string' ? a.trim() : String(a)
    const sb = b == null ? '' : typeof b === 'string' ? b.trim() : String(b)
    return sa === sb
  }

  for (const k of keys) {
    const nv = next[k]
    if (k === 'nationalId') {
      const beforeNid = before.nationalIdNotAvailable
        ? ''
        : String(before.nationalId ?? '').trim().toUpperCase()
      const nn = draft.nationalIdNotAvailable ? '' : normNationalId(draft)
      if (!sameScalar(nn, beforeNid) || Boolean(before.nationalIdNotAvailable) !== draft.nationalIdNotAvailable) {
        patch.nationalId = nn
        patch.nationalIdNotAvailable = draft.nationalIdNotAvailable
      }
      continue
    }
    if (k === 'nationalIdNotAvailable') continue
    if (!sameScalar(baseline[k], nv)) patch[k] = nv
  }
  if (
    Boolean(before.nationalIdNotAvailable) !== draft.nationalIdNotAvailable &&
    patch.nationalIdNotAvailable === undefined
  ) {
    patch.nationalIdNotAvailable = draft.nationalIdNotAvailable
  }

  // Chỉ cập nhật hash khi có thay đổi field người dùng (tránh lưu «ảo» chỉ vì hash lệch).
  const userChanged = Object.keys(patch).some((k) => k !== 'uniqueHash' && k !== 'nationalIdHash')
  if (userChanged) {
    const fmt = studyFormatFromParts(draft.studyIntention, draft.educationLevel)
    const nextPhoneHash = computeLeadUniqueHash({
      phone: draft.phone,
      parentPhone: draft.parentPhone,
      fullName: draft.fullName,
      customerId: draft.customerId,
      educationLevel: fmt,
      gradeClass: draft.gradeClass,
      dateOfBirth: draft.dateOfBirth,
    })
    if (nextPhoneHash && nextPhoneHash !== before.uniqueHash) {
      patch.uniqueHash = nextPhoneHash
    }

    const nextNidHash = nationalIdHashFromInput(draft.nationalId, draft.nationalIdNotAvailable)
    const prevNidHash = String(before.nationalIdHash ?? '').trim() || null
    if (nextNidHash !== prevNidHash) {
      patch.nationalIdHash = nextNidHash ?? deleteField()
    }
  }

  return patch
}

/** Field hệ thống — không tính là «user sửa hồ sơ» trên UI / timeline. */
const CORE_SYSTEM_PATCH_KEYS = new Set(['uniqueHash', 'nationalIdHash'])

export function leadCorePatchHasUserChanges(patch: Record<string, unknown>): boolean {
  return Object.keys(patch).some((k) => !CORE_SYSTEM_PATCH_KEYS.has(k))
}

export function isCoreDraftDirty(before: Lead, draft: LeadCoreDraft): boolean {
  return leadCorePatchHasUserChanges(buildLeadCoreFirestorePatch(before, draft))
}

/** Trường CRM / nhãn chấm điểm trên panel — đồng bộ với playbook & tri thức khi chưa lưu. */
export type LeadDetailMatchOverrides = {
  priorityTag?: PriorityTag
  calculatedScore?: number
  status?: LeadCounselorStatus
  pipelineStatus?: LeadPipelineStatus
}

/** Gộp bản nháp form vào lead — dùng preview chấm điểm trước khi lưu. */
export function mergeCoreDraftIntoLead(lead: Lead, draft: LeadCoreDraft): Lead {
  const base = leadCoreDraftToFirestoreFields(draft)
  const merged: Lead = {
    ...lead,
    ...(base as Partial<Lead>),
    nationalId: draft.nationalIdNotAvailable ? undefined : normNationalId(draft) || undefined,
    nationalIdNotAvailable: draft.nationalIdNotAvailable || undefined,
    majorInterest: norm(draft.majorInterest) || undefined,
    academicPerformance: norm(draft.academicPerformance) || undefined,
    graduationScore: norm(draft.graduationScore) || undefined,
    ...(() => {
      const fmt = studyFormatFromParts(draft.studyIntention, draft.educationLevel)
      return {
        educationLevel: fmt || lead.educationLevel,
        studyIntention: fmt || undefined,
      }
    })(),
    ethnicity: norm(draft.ethnicity) || undefined,
    permanentAddress: norm(draft.permanentAddress) || norm(draft.address) || undefined,
    currentResidence: norm(draft.currentResidence) || undefined,
    address: norm(draft.permanentAddress) || norm(draft.address) || lead.address,
    schoolType: norm(draft.schoolType) || undefined,
    financialStatus: norm(draft.financialStatus) || undefined,
    hanoiArea: norm(draft.hanoiArea) || undefined,
    aspirations: norm(draft.aspirations) || undefined,
    hobbies: norm(draft.hobbies) || undefined,
    fieldTripNotes: norm(draft.fieldTripNotes) || undefined,
    profileNote1: norm(draft.profileNote1) || undefined,
    profileNote2: norm(draft.profileNote2) || undefined,
    otherAttentionNotes: norm(draft.otherAttentionNotes) || undefined,
    studentEmail: norm(draft.studentEmail) || undefined,
    gender: norm(draft.gender) || undefined,
    placeOfBirth: norm(draft.placeOfBirth) || undefined,
    applicantCategory: norm(draft.applicantCategory) || undefined,
    source1: norm(draft.source1) || undefined,
    source2: norm(draft.source2) || undefined,
    source: norm(draft.source1) || norm(draft.source) || lead.source,
    fatherName: norm(draft.fatherName) || undefined,
    fatherPhone: norm(draft.fatherPhone) || undefined,
    motherName: norm(draft.motherName) || undefined,
    motherPhone: norm(draft.motherPhone) || undefined,
    guardian: norm(draft.guardian) || undefined,
    scholarship1Id: norm(draft.scholarship1Id) || undefined,
    scholarship2Id: norm(draft.scholarship2Id) || undefined,
    dateOfBirth: norm(draft.dateOfBirth) || undefined,
  }
  return merged
}

/** Lead dùng khớp playbook / tri thức / kịch bản — gồm form hồ sơ + nhãn preview + CRM chưa lưu. */
export function mergeLeadDetailPreview(
  lead: Lead,
  draft: LeadCoreDraft,
  overrides?: LeadDetailMatchOverrides,
): Lead {
  const merged = mergeCoreDraftIntoLead(lead, draft)
  if (!overrides) return merged
  return {
    ...merged,
    ...(overrides.priorityTag !== undefined ? { priorityTag: overrides.priorityTag } : {}),
    ...(overrides.calculatedScore !== undefined ? { calculatedScore: overrides.calculatedScore } : {}),
    ...(overrides.status !== undefined ? { status: overrides.status } : {}),
    ...(overrides.pipelineStatus !== undefined ? { pipelineStatus: overrides.pipelineStatus } : {}),
  }
}
