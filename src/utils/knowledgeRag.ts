import type { KnowledgeDocument, Lead } from '../types'
import { leadSearchableText } from './playbookMatch'

const KNOWLEDGE_TYPE_ORDER: Record<string, number> = {
  GENERAL: 0,
  FAQ: 1,
  TUITION: 2,
  POLICY: 3,
  MAJOR_INFO: 4,
  PROCESS: 5,
}

/** Cùng tập trường với playbook keyword — RAG và UI tri thức đồng bộ. */
function leadSearchBlob(lead: Lead): string {
  return leadSearchableText(lead).toLowerCase()
}

function docRelevanceScore(leadBlob: string, d: KnowledgeDocument): number {
  let score = 0
  const title = d.title.toLowerCase()
  const body = d.content.toLowerCase()
  if (leadBlob && title && leadBlob.split(/\s+/).some((tok) => tok.length > 2 && title.includes(tok))) {
    score += 3
  }
  if (leadBlob && body && leadBlob.split(/\s+/).some((tok) => tok.length > 2 && body.includes(tok))) {
    score += 2
  }
  const typeBoost: Record<string, number> = {
    TUITION: 2,
    MAJOR_INFO: 2,
    FAQ: 1,
    POLICY: 1,
    PROCESS: 1,
    GENERAL: 0,
  }
  score += typeBoost[String(d.type)] ?? 0
  return score
}

function sortDocs(docs: KnowledgeDocument[], lead?: Lead | null): KnowledgeDocument[] {
  const blob = lead ? leadSearchBlob(lead) : ''
  return [...docs].sort((a, b) => {
    if (lead && blob) {
      const ra = docRelevanceScore(blob, a)
      const rb = docRelevanceScore(blob, b)
      if (ra !== rb) return rb - ra
    }
    const ta = KNOWLEDGE_TYPE_ORDER[String(a.type)] ?? 99
    const tb = KNOWLEDGE_TYPE_ORDER[String(b.type)] ?? 99
    if (ta !== tb) return ta - tb
    return b.uploadedAt.toMillis() - a.uploadedAt.toMillis()
  })
}

function concatDocs(docs: KnowledgeDocument[], maxChars: number): string {
  const parts: string[] = []
  let used = 0
  for (const d of docs) {
    const header = `### [${d.type}] ${d.title}\n`
    const body = `${d.content.trim()}\n\n`
    const chunk = header + body
    if (used + chunk.length > maxChars) {
      const remain = maxChars - used - header.length - 24
      if (remain > 200) {
        parts.push(`${header}${d.content.trim().slice(0, remain)}…\n`)
      }
      break
    }
    parts.push(chunk)
    used += chunk.length
  }
  return parts.join('\n').trim()
}

/**
 * Ghép toàn bộ kho tri thức (ưu tiên loại tài liệu, mới nhất trước).
 */
export function buildInstitutionalRagBlock(docs: KnowledgeDocument[], maxChars = 14_000): string {
  if (!docs.length) return ''
  return concatDocs(sortDocs(docs), maxChars)
}

/**
 * RAG theo ngữ cảnh hồ sơ: ưu tiên tài liệu liên quan ngành/tỉnh/từ khóa trong lead.
 */
/** Điểm hiển thị trên tab Tri thức (ưu tiên tư vấn chung + token khớp hồ sơ). */
export function knowledgeDocDisplayScore(lead: Lead, doc: KnowledgeDocument): number {
  const blob = leadSearchBlob(lead)
  let score = docRelevanceScore(blob, doc)
  if (doc.type === 'GENERAL') score += 50
  if (doc.type === 'FAQ') score += 20
  const text = `${doc.title} ${doc.content}`.toLowerCase()
  if (blob) {
    for (const token of blob.split(/\s+/).filter((t) => t.length >= 3)) {
      if (text.includes(token)) score += 8
    }
  }
  return score
}

/** Tài liệu có liên quan hồ sơ (token / loại tư vấn chung). */
export function isKnowledgeDocRelevantToLead(lead: Lead, doc: KnowledgeDocument): boolean {
  if (doc.type === 'GENERAL' || doc.type === 'FAQ') return true
  return docRelevanceScore(leadSearchBlob(lead), doc) > 0
}

export function countLeadRelevantKnowledge(lead: Lead, docs: KnowledgeDocument[]): number {
  return docs.filter((d) => isKnowledgeDocRelevantToLead(lead, d)).length
}

export function buildLeadContextualRagBlock(
  lead: Lead,
  docs: KnowledgeDocument[],
  maxChars = 14_000,
): string {
  if (!docs.length) return ''
  const sorted = sortDocs(docs, lead)
  const blob = leadSearchBlob(lead)
  const relevant = sorted.filter((d) => docRelevanceScore(blob, d) > 0)
  const picked = relevant.length >= 2 ? relevant : sorted
  return concatDocs(picked, maxChars)
}
