import type { Lead, RuleCondition, ScriptCategory, ScriptSnippet } from '../types'
import { SCRIPT_CATEGORIES } from '../types'

function norm(s: string): string {
  return s.trim().toLowerCase()
}

function leadFieldValue(lead: Lead, field: string): string {
  switch (field) {
    case 'region':
      return lead.province
    case 'province':
      return lead.province ?? ''
    case 'major':
    case 'majorInterest':
      return lead.educationLevel
    case 'educationLevel':
      return lead.educationLevel
    case 'schoolType':
      return ''
    case 'financialStatus':
      return ''
    case 'academicLevel':
      return lead.educationLevel
    case 'source':
      return lead.source
    case 'highSchool':
    case 'highSchoolName':
      return lead.highSchool
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

export function matchRuleCondition(lead: Lead, c: RuleCondition): boolean {
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

/** Snippet áp dụng khi bật và mọi `matchConditions` thỏa (AND). */
export function snippetMatchesLead(lead: Lead, snippet: ScriptSnippet): boolean {
  if (snippet.isActive === false) return false
  if (!snippet.matchConditions.length) return false
  return snippet.matchConditions.every((c) => matchRuleCondition(lead, c))
}

export interface ConsultingFlowStep {
  category: ScriptCategory
  snippets: ScriptSnippet[]
}

/**
 * Lọc snippet khớp lead, rồi gom theo thứ tự giai đoạn tư vấn: chào → USP → tầm nhìn → xử lý từ chối → kết.
 * Trong mỗi bước, các snippet được sắp theo `title` (locale vi).
 */
export function assembleConsultingFlow(lead: Lead, allSnippets: ScriptSnippet[]): ConsultingFlowStep[] {
  const matched = allSnippets.filter((s) => snippetMatchesLead(lead, s))
  const byCategory = new Map<ScriptCategory, ScriptSnippet[]>()
  for (const cat of SCRIPT_CATEGORIES) {
    byCategory.set(cat, [])
  }
  for (const s of matched) {
    const bucket = byCategory.get(s.category)
    if (bucket) bucket.push(s)
  }
  for (const [, arr] of byCategory) {
    arr.sort((a, b) => a.title.localeCompare(b.title, 'vi'))
  }
  return SCRIPT_CATEGORIES.map((category) => ({
    category,
    snippets: byCategory.get(category) ?? [],
  })).filter((step) => step.snippets.length > 0)
}
