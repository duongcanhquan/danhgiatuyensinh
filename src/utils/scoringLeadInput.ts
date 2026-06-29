import type { Lead } from '../types'
import type { ExcelLeadRow } from './excelLeadMapper'

/** Gộp dòng Excel / nháp → Partial Lead để chấm điểm (đủ 20 cột chuẩn + cột mở rộng). */
export function partialLeadFromExcelRow(row: Partial<ExcelLeadRow>): Partial<Lead> {
  const studyFormat = String(row.studyIntention ?? row.educationLevel ?? '').trim()
  const address = String(row.address ?? '').trim()
  const source = String(row.source ?? '').trim()
  return {
    customerId: row.customerId,
    fullName: row.fullName,
    dateOfBirth: row.dateOfBirth,
    phone: row.phone,
    parentPhone: row.parentPhone,
    source,
    source1: source || undefined,
    ...(row.assignedToRaw?.trim() ? { assignedTo: row.assignedToRaw.trim() } : {}),
    educationLevel: studyFormat || row.educationLevel,
    studyIntention: studyFormat || row.studyIntention,
    majorInterest: row.majorInterest?.trim() || undefined,
    academicPerformance: row.academicPerformance?.trim() || undefined,
    schoolType: row.schoolType?.trim() || undefined,
    financialStatus: row.financialStatus?.trim() || undefined,
    hanoiArea: row.hanoiArea?.trim() || undefined,
    highSchool: row.highSchool,
    gradeClass: row.gradeClass,
    province: row.province,
    address,
    permanentAddress: address || undefined,
    description: row.description,
    aspirations: row.aspirations?.trim() || undefined,
    hobbies: row.hobbies?.trim() || undefined,
    fieldTripNotes: row.fieldTripNotes?.trim() || undefined,
    profileNote1: row.profileNote1?.trim() || undefined,
    profileNote2: row.profileNote2?.trim() || undefined,
    otherAttentionNotes: row.otherAttentionNotes?.trim() || undefined,
  }
}
