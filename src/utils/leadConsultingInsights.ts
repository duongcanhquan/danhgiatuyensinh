import type { ConsultingPlaybook, KnowledgeDocument, Lead, PriorityTag } from '../types'
import type { InfoScoreRuntime } from './infoScoreRules'
import { knowledgeDocDisplayScore } from './knowledgeRag'
import { computeMockMlWinProbability, resolveMlWinDisplay, type MvpBreakdownItem } from './mlWinMock'
import { playbooksMatchingLead, type PlaybookMatchResult } from './playbookMatch'

export type LeadInfoGap = {
  id: string
  label: string
  pointsIfMatch: number
  hint?: string
}

export type LeadConsultingInsights = {
  infoPercent: number
  infoExplanation: string
  infoSource: 'firestore' | 'mvp_mock'
  infoGaps: LeadInfoGap[]
  potentialInfoGain: number
  priorityTag: PriorityTag | undefined
  calculatedScore: number | undefined
  playbookMatches: PlaybookMatchResult[]
  topKnowledge: { doc: KnowledgeDocument; score: number }[]
  quickSearchTerms: string[]
}

export function buildLeadConsultingInsights(
  lead: Lead,
  playbooks: ConsultingPlaybook[],
  knowledgeDocs: KnowledgeDocument[],
  opts?: {
    infoScoreRuntime?: InfoScoreRuntime | null
    priorityTag?: PriorityTag
    calculatedScore?: number
    topKnowledgeLimit?: number
    topGapsLimit?: number
  },
): LeadConsultingInsights {
  const ml = resolveMlWinDisplay(lead, opts?.infoScoreRuntime ?? null)
  const liveBreakdown = computeMockMlWinProbability(lead, opts?.infoScoreRuntime ?? null).mvpBreakdown

  const gapItems: MvpBreakdownItem[] =
    ml.mvpBreakdown?.items ??
    liveBreakdown?.items ??
    []

  const infoGaps: LeadInfoGap[] = gapItems
    .filter((i) => i.id !== 'base' && !i.matched)
    .sort((a, b) => b.pointsIfMatch - a.pointsIfMatch)
    .slice(0, opts?.topGapsLimit ?? 12)
    .map((i) => ({
      id: i.id,
      label: i.label,
      pointsIfMatch: i.pointsIfMatch,
      hint: i.hint,
    }))

  const potentialInfoGain = infoGaps.reduce((s, g) => s + g.pointsIfMatch, 0)

  const playbookMatches = playbooksMatchingLead(lead, playbooks)

  const topKnowledge = [...knowledgeDocs]
    .map((doc) => ({ doc, score: knowledgeDocDisplayScore(lead, doc) }))
    .sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title, 'vi'))
    .slice(0, opts?.topKnowledgeLimit ?? 5)

  const quickSearchTerms = [
    lead.majorInterest?.trim(),
    lead.educationLevel?.trim(),
    lead.province?.trim(),
    lead.financialStatus?.trim(),
    lead.highSchool?.trim(),
  ].filter((x): x is string => Boolean(x))

  return {
    infoPercent: ml.mlWinProbability,
    infoExplanation: ml.mlExplanation,
    infoSource: ml.source,
    infoGaps,
    potentialInfoGain,
    priorityTag: opts?.priorityTag ?? lead.priorityTag,
    calculatedScore: opts?.calculatedScore ?? lead.calculatedScore,
    playbookMatches,
    topKnowledge,
    quickSearchTerms: [...new Set(quickSearchTerms)].slice(0, 5),
  }
}

/** Map id trường điểm thông tin → nhãn gợi ý trên form hồ sơ. */
export const INFO_GAP_FORM_HINT: Record<string, string> = {
  customerId: 'Mã KH',
  fullName: 'Họ tên',
  dateOfBirth: 'Ngày sinh',
  phone: 'Điện thoại SV',
  parentPhone: 'ĐT phụ huynh',
  source: 'Nguồn',
  majorInterest: 'Ngành quan tâm',
  academicPerformance: 'Học lực',
  highSchool: 'Trường THPT',
  aspirations: 'Mong muốn',
  financialStatus: 'Nhóm tài chính',
  hanoiArea: 'Quận/huyện',
  province: 'Tỉnh/TP',
  address: 'Địa chỉ',
  description: 'Mô tả',
  educationLevel: 'Hệ đào tạo',
  profileNote1: 'Ghi chú 1',
  profileNote2: 'Ghi chú 2',
  otherAttentionNotes: 'Lưu ý khác',
  gradeClass: 'Lớp',
  hobbies: 'Sở thích',
  assignedTo: 'Phân công TVV',
}
