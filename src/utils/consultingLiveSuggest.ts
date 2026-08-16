import type { ConsultingPlaybook, KnowledgeDocument, Lead } from '../types'
import { buildPlaybookContextBlock } from './counselingAiDefaults'
import { invokeLlmJsonText, resolveAIIntegrationConfig } from './aiEngine'
import {
  buildLeadContextualRagBlock,
  formatKnowledgeHitsForPrompt,
  searchKnowledgeByQuery,
} from './knowledgeRag'
import { playbooksMatchingLead } from './playbookMatch'
import { matchUtteranceToChips, type ConsultingChip } from './consultingQuickChips'

export type ConsultingSuggestResult = {
  reply: string
  source: 'chip' | 'knowledge' | 'llm'
  basis?: string
  chip?: ConsultingChip
}

/**
 * Gợi ý câu TVV có thể nói: ưu tiên chip → trích tri thức → LLM (nếu bật).
 */
export async function suggestConsultingReply(input: {
  utterance: string
  lead: Lead
  playbooks: ConsultingPlaybook[]
  knowledgeDocs: KnowledgeDocument[]
  chips: ConsultingChip[]
  preferLlm: boolean
  forceLlm?: boolean
}): Promise<ConsultingSuggestResult> {
  const u = input.utterance.trim()
  if (!u) throw new Error('Gõ nhanh lời khách đang nói trước.')

  const chipHits = matchUtteranceToChips(u, input.chips, 4)
  if (!input.forceLlm && chipHits.length > 0 && !input.preferLlm) {
    return {
      reply: chipHits[0]!.copyText,
      source: 'chip',
      basis: `Chip: ${chipHits[0]!.label}`,
      chip: chipHits[0],
    }
  }

  const knowledgeHits = searchKnowledgeByQuery(input.knowledgeDocs, u, {
    lead: input.lead,
    limit: 4,
  })

  if (!input.forceLlm && !input.preferLlm && knowledgeHits.length > 0 && chipHits.length === 0) {
    const top = knowledgeHits[0]!
    return {
      reply: top.snippet || top.doc.content.trim().slice(0, 280),
      source: 'knowledge',
      basis: `Tri thức: ${top.doc.title}`,
    }
  }

  const cfg = resolveAIIntegrationConfig()
  if (!cfg?.apiKey?.trim()) {
    if (chipHits[0]) {
      return {
        reply: chipHits[0].copyText,
        source: 'chip',
        basis: `Chip (chưa có khóa AI): ${chipHits[0].label}`,
        chip: chipHits[0],
      }
    }
    if (knowledgeHits[0]) {
      return {
        reply: knowledgeHits[0].snippet || knowledgeHits[0].doc.content.trim().slice(0, 280),
        source: 'knowledge',
        basis: `Tri thức (chưa có khóa AI): ${knowledgeHits[0].doc.title}`,
      }
    }
    throw new Error('Chưa có khóa AI — vào Cài đặt → Tư vấn → AI hỗ trợ để gắn khóa.')
  }

  const matches = playbooksMatchingLead(input.lead, input.playbooks).map((m) => m.playbook)
  const hitBlock = formatKnowledgeHitsForPrompt(knowledgeHits, 3_500)
  const rag =
    hitBlock || buildLeadContextualRagBlock(input.lead, input.knowledgeDocs, 6_000)
  const pbBlock = buildPlaybookContextBlock(matches, 3_000)
  const system = [
    'Bạn hỗ trợ TVV tuyển sinh VietMy đang gọi điện với thí sinh/phụ huynh.',
    'Chỉ dùng tri thức và playbook đã cho — không bịa học phí, hạn nộp, quy chế.',
    'Trả JSON: {"cauTraLoi":"string — 2–5 câu TVV nói ngay, tiếng Việt đời thường","canCu":"string — nguồn ngắn (tên tài liệu/chip)"}',
  ].join('\n')
  const user = [
    `## Lời khách vừa nói\n${u}`,
    `## Hồ sơ\n${input.lead.fullName} | ${input.lead.province ?? ''} | ${input.lead.educationLevel} | ${input.lead.majorInterest ?? ''} | ${input.lead.priorityTag}`,
    chipHits[0] ? `## Chip gần khớp (tham khảo)\n${chipHits[0].label}: ${chipHits[0].copyText}` : '',
    rag ? `## Tri thức\n${rag}` : '',
    pbBlock ? `## Playbook\n${pbBlock}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  const raw = await invokeLlmJsonText(cfg, system, user)
  const parsed = JSON.parse(raw) as { cauTraLoi?: string; canCu?: string }
  const text = String(parsed.cauTraLoi ?? '').trim()
  if (!text) throw new Error('AI không trả câu trả lời.')
  return {
    reply: text,
    source: 'llm',
    basis: String(parsed.canCu ?? '').trim() || 'AI soạn từ tri thức / mẫu',
  }
}
