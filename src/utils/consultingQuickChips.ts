import type { ConsultingPlaybook, Lead, ScriptSnippet } from '../types'
import { playbooksMatchingLead } from './playbookMatch'
import { parseObjectionLine } from './playbookObjectionPairs'
import { snippetMatchesLead } from './scriptEngine'

export type ConsultingChipKind = 'objection' | 'usp' | 'question' | 'snippet'

export type ConsultingChip = {
  id: string
  kind: ConsultingChipKind
  /** Nhãn nút ngắn (khách nói / USP ngắn). */
  label: string
  /** Nội dung copy khi bấm. */
  copyText: string
  sourceTitle?: string
}

const KIND_ORDER: Record<ConsultingChipKind, number> = {
  objection: 0,
  question: 1,
  usp: 2,
  snippet: 3,
}

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
}

/** Câu hỏi gợi ý từ chiến lược (dòng kết thúc bằng ? hoặc bắt đầu bằng Hỏi). */
export function extractQuestionsFromStrategy(strategy: string, max = 8): string[] {
  const lines = strategy
    .split(/\n+/)
    .map((l) => l.replace(/^[-•*\d.)\s]+/, '').trim())
    .filter(Boolean)
  const out: string[] = []
  for (const line of lines) {
    if (out.length >= max) break
    if (/\?\s*$/.test(line) || /^hỏi\b/i.test(line) || /^câu hỏi\b/i.test(line)) {
      out.push(line)
    }
  }
  return out
}

export function buildConsultingChips(input: {
  lead: Lead
  playbooks: ConsultingPlaybook[]
  snippets?: ScriptSnippet[]
  maxChips?: number
}): ConsultingChip[] {
  const max = input.maxChips ?? 40
  const matches = playbooksMatchingLead(input.lead, input.playbooks)
  const chips: ConsultingChip[] = []

  for (const m of matches) {
    const pb = m.playbook
    if (!pb.isActive) continue
    for (const [i, line] of (pb.objectionHandling ?? []).entries()) {
      const { objection, response } = parseObjectionLine(line)
      if (!objection.trim()) continue
      chips.push({
        id: `obj-${pb.id}-${i}`,
        kind: 'objection',
        label: objection.slice(0, 72),
        copyText: (response.trim() || objection).slice(0, 2000),
        sourceTitle: pb.title,
      })
    }
    for (const [i, q] of extractQuestionsFromStrategy(pb.strategy ?? '').entries()) {
      chips.push({
        id: `q-${pb.id}-${i}`,
        kind: 'question',
        label: q.slice(0, 72),
        copyText: q.slice(0, 2000),
        sourceTitle: pb.title,
      })
    }
    for (const [i, usp] of (pb.keySellingPoints ?? []).entries()) {
      const t = usp.trim()
      if (!t) continue
      chips.push({
        id: `usp-${pb.id}-${i}`,
        kind: 'usp',
        label: t.slice(0, 72),
        copyText: t.slice(0, 2000),
        sourceTitle: pb.title,
      })
    }
  }

  for (const sn of input.snippets ?? []) {
    if (sn.isActive === false) continue
    if (!snippetMatchesLead(input.lead, sn)) continue
    if (sn.category !== 'OBJECTION_HANDLING' && sn.category !== 'CLOSING' && sn.category !== 'USP') {
      continue
    }
    const parts = sn.content.split(/\n---\n/)
    const label = (parts[0] ?? sn.title).trim().slice(0, 72)
    const copy = (parts[1] ?? sn.content).trim()
    if (!label) continue
    chips.push({
      id: `sn-${sn.id}`,
      kind: 'snippet',
      label,
      copyText: copy.slice(0, 2000) || label,
      sourceTitle: sn.title,
    })
  }

  chips.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
  return chips.slice(0, max)
}

export function filterConsultingChips(chips: readonly ConsultingChip[], query: string): ConsultingChip[] {
  const q = norm(query)
  if (!q) return [...chips]
  return chips.filter((c) => {
    const blob = norm(`${c.label} ${c.copyText} ${c.sourceTitle ?? ''}`)
    return blob.includes(q) || q.split(/\s+/).every((tok) => tok.length < 2 || blob.includes(tok))
  })
}

/**
 * Khớp lời khách với chip (không LLM): ưu tiên label chứa token / token chứa trong label.
 */
export function matchUtteranceToChips(
  utterance: string,
  chips: readonly ConsultingChip[],
  limit = 5,
): ConsultingChip[] {
  const u = norm(utterance)
  if (!u || u.length < 2) return []
  const tokens = u.split(/\s+/).filter((t) => t.length >= 2)
  const scored = chips.map((c) => {
    const label = norm(c.label)
    const copy = norm(c.copyText)
    let score = 0
    if (label && u.includes(label)) score += 20
    if (label && label.includes(u)) score += 16
    for (const tok of tokens) {
      if (label.includes(tok)) score += 4
      if (copy.includes(tok)) score += 1
    }
    return { c, score }
  })
  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.c)
}

export const CONSULTING_CHIP_KIND_LABEL: Record<ConsultingChipKind, string> = {
  objection: 'Phản đối',
  question: 'Câu hỏi',
  usp: 'Điểm bán',
  snippet: 'Mảnh thoại',
}
