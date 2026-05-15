import type { Lead } from '../types'

/**
 * Giá trị chuỗi một «logical field» cho playbook, script hub, và các chỗ cần đồng bộ với
 * `leadToEvaluationRecord` / đọc Firestore (`mapDoc`) — tránh đọc thiếu hoặc gộp nhầm cột.
 */
export function leadSemanticFieldValue(lead: Lead, field: string): string {
  const f = String(field).trim()
  switch (f) {
    case 'region':
    case 'province':
      return lead.province ?? ''
    case 'customerId':
      return lead.customerId ?? ''
    case 'email':
      return lead.customerId ?? ''
    case 'fullName':
      return lead.fullName ?? ''
    case 'phone':
      return lead.phone ?? ''
    case 'parentPhone':
      return lead.parentPhone ?? ''
    case 'source':
    case 'leadSource':
      return lead.source ?? ''
    case 'educationLevel':
      return lead.educationLevel ?? ''
    case 'major':
    case 'majorInterest':
      return (lead.majorInterest?.trim() || lead.educationLevel || '').trim()
    case 'academicLevel':
      return (lead.academicPerformance?.trim() || lead.educationLevel || '').trim()
    case 'studyIntention':
      return lead.studyIntention?.trim() ?? ''
    case 'schoolType':
      return lead.schoolType?.trim() ?? ''
    case 'financialStatus':
      return lead.financialStatus?.trim() ?? ''
    case 'hanoiArea':
      return lead.hanoiArea?.trim() ?? ''
    case 'highSchool':
    case 'highSchoolName':
      return lead.highSchool ?? ''
    case 'gradeClass':
      return lead.gradeClass ?? ''
    case 'address':
      return lead.address ?? ''
    case 'description':
      return lead.description ?? ''
    case 'dateOfBirth':
      return lead.dateOfBirth?.trim() ?? ''
    case 'aspirations':
      return lead.aspirations?.trim() ?? ''
    case 'hobbies':
      return lead.hobbies?.trim() ?? ''
    case 'fieldTripNotes':
      return lead.fieldTripNotes?.trim() ?? ''
    case 'profileNote1':
      return lead.profileNote1?.trim() ?? ''
    case 'profileNote2':
      return lead.profileNote2?.trim() ?? ''
    case 'otherAttentionNotes':
      return lead.otherAttentionNotes?.trim() ?? ''
    case 'pipelineStatus':
      return lead.pipelineStatus ?? ''
    case 'status':
      return lead.status ?? ''
    case 'priorityTag':
      return lead.priorityTag ?? ''
    case 'assignedTo':
      return lead.assignedTo != null ? String(lead.assignedTo) : ''
    case 'assignedCounselorId':
      return lead.assignedCounselorId != null ? String(lead.assignedCounselorId) : ''
    default:
      return ''
  }
}
