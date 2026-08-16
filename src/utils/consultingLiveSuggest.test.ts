import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ConsultingPlaybook, KnowledgeDocument, Lead } from '../types'
import { Timestamp } from 'firebase/firestore'

vi.mock('./aiEngine', () => ({
  resolveAIIntegrationConfig: vi.fn(() => ({
    provider: 'Gemini',
    apiKey: 'test-key',
    model: 'gemini-2.5-flash-lite',
  })),
  invokeLlmJsonText: vi.fn(async () =>
    JSON.stringify({ cauTraLoi: 'Em hiểu quan ngại học phí ạ. Học phí CNTT khoảng 18tr/năm và có hỗ trợ trả góp.', canCu: 'Tri thức học phí' }),
  ),
}))

import { suggestConsultingReply } from './consultingLiveSuggest'
import { invokeLlmJsonText } from './aiEngine'
import type { ConsultingChip } from './consultingQuickChips'

const lead = {
  id: 'l1',
  fullName: 'A',
  educationLevel: 'Cao đẳng chính quy',
  majorInterest: 'CNTT',
  province: 'HN',
  priorityTag: 'WARM',
} as Lead

const knowledge: KnowledgeDocument[] = [
  {
    id: 'k1',
    title: 'Học phí',
    content: 'Học phí ngành CNTT khoảng 18 triệu/năm, có trả góp.',
    type: 'FAQ',
    uploadedAt: Timestamp.now(),
  },
]

const chips: ConsultingChip[] = [
  {
    id: 'c1',
    kind: 'objection',
    label: 'Học phí đắt',
    copyText: 'Chip cố định về học phí.',
  },
]

describe('suggestConsultingReply', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns chip when not preferring LLM', async () => {
    const r = await suggestConsultingReply({
      utterance: 'học phí đắt quá',
      lead,
      playbooks: [] as ConsultingPlaybook[],
      knowledgeDocs: knowledge,
      chips,
      preferLlm: false,
    })
    expect(r.source).toBe('chip')
    expect(invokeLlmJsonText).not.toHaveBeenCalled()
  })

  it('calls LLM when preferLlm even if chip matches', async () => {
    const r = await suggestConsultingReply({
      utterance: 'học phí đắt quá',
      lead,
      playbooks: [] as ConsultingPlaybook[],
      knowledgeDocs: knowledge,
      chips,
      preferLlm: true,
    })
    expect(r.source).toBe('llm')
    expect(r.reply).toContain('học phí')
    expect(invokeLlmJsonText).toHaveBeenCalled()
  })
})
