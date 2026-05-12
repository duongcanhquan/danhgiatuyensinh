import type { ConsultingPlaybook, Lead, PlaybookTriggerCondition } from '../types'

function norm(s: string): string {
  return s.trim().toLowerCase()
}

function leadFieldValue(lead: Lead, field: string): string {
  switch (field) {
    case 'region':
      return lead.region
    case 'province':
      return lead.province ?? ''
    case 'hanoiArea':
      return lead.hanoiArea ?? ''
    case 'major':
    case 'majorInterest':
      return lead.majorInterest
    case 'schoolType':
      return lead.schoolType
    case 'financialStatus':
      return lead.financialStatus
    case 'academicLevel':
      return lead.academicLevel ?? ''
    case 'studyIntention':
      return lead.studyIntention ?? ''
    case 'priorityTag':
      return lead.priorityTag
    case 'pipelineStatus':
      return lead.pipelineStatus
    case 'status':
      return lead.status
    default:
      return ''
  }
}

function matchCondition(lead: Lead, c: PlaybookTriggerCondition): boolean {
  const raw = leadFieldValue(lead, String(c.field))
  const fieldVal = norm(raw)
  const op = c.operator ?? 'EQUALS'
  const val = c.value
  const list = Array.isArray(val) ? val.map((x) => norm(String(x))) : [norm(String(val))]

  if (op === 'EQUALS') return fieldVal === list[0]
  if (op === 'CONTAINS') return list[0] !== '' && fieldVal.includes(list[0]!)
  if (op === 'IN') return list.includes(fieldVal)
  if (op === 'NOT_IN') return !list.includes(fieldVal)
  return false
}

/** Playbook khớp khi TẤT CẢ điều kiện trigger đúng (AND). */
export function playbooksMatchingLead(
  lead: Lead,
  playbooks: ConsultingPlaybook[],
): ConsultingPlaybook[] {
  return playbooks
    .filter((p) => p.isActive)
    .filter((p) => p.triggerConditions.every((c) => matchCondition(lead, c)))
    .sort((a, b) => b.priority - a.priority)
}
