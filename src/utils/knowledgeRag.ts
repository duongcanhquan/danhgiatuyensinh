import type { KnowledgeDocument } from '../types'

const KNOWLEDGE_TYPE_ORDER: Record<KnowledgeDocument['type'], number> = {
  TUITION: 0,
  POLICY: 1,
  MAJOR_INFO: 2,
}

/**
 * Concatenate knowledge documents into a single RAG block (truncated for LLM context limits).
 */
export function buildInstitutionalRagBlock(docs: KnowledgeDocument[], maxChars = 14_000): string {
  if (!docs.length) return ''
  const sorted = [...docs].sort((a, b) => {
    const ta = KNOWLEDGE_TYPE_ORDER[a.type] ?? 9
    const tb = KNOWLEDGE_TYPE_ORDER[b.type] ?? 9
    if (ta !== tb) return ta - tb
    return b.uploadedAt.toMillis() - a.uploadedAt.toMillis()
  })
  const parts: string[] = []
  let used = 0
  for (const d of sorted) {
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
