import type { ConsultingPlaybook, Lead, PlaybookTriggerCondition } from '../types'
import { leadSemanticFieldValue } from './leadSemanticFieldValue'
import { PLAYBOOK_FIELD_LABEL, PLAYBOOK_OPERATOR_LABEL } from './playbookFieldOptions'

function norm(s: string): string {
  return s.trim().toLowerCase()
}

function leadFieldValue(lead: Lead, field: string): string {
  return leadSemanticFieldValue(lead, field)
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

/** Các trường gộp thành văn bản để khớp từ khóa trên hồ sơ. */
const LEAD_KEYWORD_SCAN_FIELDS = [
  'fullName',
  'province',
  'region',
  'educationLevel',
  'majorInterest',
  'major',
  'academicLevel',
  'schoolType',
  'financialStatus',
  'studyIntention',
  'priorityTag',
  'pipelineStatus',
  'status',
  'source',
  'description',
  'profileNote1',
  'profileNote2',
  'otherAttentionNotes',
  'aspirations',
  'hobbies',
  'highSchool',
  'address',
] as const

export function leadSearchableText(lead: Lead): string {
  return LEAD_KEYWORD_SCAN_FIELDS.map((f) => leadFieldValue(lead, f))
    .filter(Boolean)
    .join(' ')
}

export function playbookConditionsMatch(lead: Lead, conditions: PlaybookTriggerCondition[]): boolean {
  if (!conditions.length) return false
  return conditions.every((c) => matchCondition(lead, c))
}

export function playbookKeywordsMatch(lead: Lead, keywords: string[] | undefined): boolean {
  if (!keywords?.length) return false
  const hay = norm(leadSearchableText(lead))
  if (!hay) return false
  return keywords.some((k) => {
    const needle = norm(k)
    return needle.length > 0 && hay.includes(needle)
  })
}

export type PlaybookMatchKind = 'all' | 'conditions' | 'keywords'

export const PLAYBOOK_MATCH_KIND_LABEL: Record<PlaybookMatchKind, string> = {
  all: 'Áp dụng mọi hồ sơ',
  conditions: 'Khớp điều kiện',
  keywords: 'Khớp từ khóa',
}

export interface PlaybookMatchResult {
  playbook: ConsultingPlaybook
  kind: PlaybookMatchKind
}

export function describePlaybookMatch(result: PlaybookMatchResult): string {
  const p = result.playbook
  if (result.kind === 'all') return PLAYBOOK_MATCH_KIND_LABEL.all
  if (result.kind === 'keywords') {
    const kws = p.matchKeywords ?? []
    return kws.length ? `${PLAYBOOK_MATCH_KIND_LABEL.keywords}: ${kws.slice(0, 3).join(', ')}${kws.length > 3 ? '…' : ''}` : PLAYBOOK_MATCH_KIND_LABEL.keywords
  }
  const parts = (p.triggerConditions ?? []).map((c) => {
    const field = PLAYBOOK_FIELD_LABEL[String(c.field)] ?? String(c.field)
    const op = PLAYBOOK_OPERATOR_LABEL[c.operator ?? 'EQUALS'] ?? c.operator
    const val = Array.isArray(c.value) ? c.value.join(', ') : String(c.value ?? '')
    return `${field} ${op} «${val}»`
  })
  return parts.length ? parts.join(' · ') : PLAYBOOK_MATCH_KIND_LABEL.conditions
}

function matchKindRank(kind: PlaybookMatchKind): number {
  if (kind === 'conditions') return 0
  if (kind === 'keywords') return 1
  return 2
}

function resolvePlaybookMatch(lead: Lead, playbook: ConsultingPlaybook): PlaybookMatchKind | null {
  if (!playbook.isActive) return null
  if (playbook.matchAllLeads) return 'all'
  const condOk = playbookConditionsMatch(lead, playbook.triggerConditions ?? [])
  if (condOk) return 'conditions'
  const kwOk = playbookKeywordsMatch(lead, playbook.matchKeywords)
  if (kwOk) return 'keywords'
  return null
}

/** Playbook khớp khi: bật + (áp dụng mọi hồ sơ | tất cả điều kiện AND | ít nhất một từ khóa trong hồ sơ). */
export function playbooksMatchingLead(lead: Lead, playbooks: ConsultingPlaybook[]): PlaybookMatchResult[] {
  const results: PlaybookMatchResult[] = []
  for (const p of playbooks) {
    const kind = resolvePlaybookMatch(lead, p)
    if (kind) results.push({ playbook: p, kind })
  }
  return results.sort((a, b) => {
    if (b.playbook.priority !== a.playbook.priority) return b.playbook.priority - a.playbook.priority
    const rk = matchKindRank(a.kind) - matchKindRank(b.kind)
    if (rk !== 0) return rk
    return a.playbook.title.localeCompare(b.playbook.title, 'vi')
  })
}
