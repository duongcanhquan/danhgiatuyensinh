export type KnowledgeCategoryDef = { id: string; label: string }

export const KNOWLEDGE_BUILTIN_CATEGORIES: KnowledgeCategoryDef[] = [
  { id: 'GENERAL', label: 'Tư vấn chung' },
  { id: 'TUITION', label: 'Học phí / lệ phí' },
  { id: 'POLICY', label: 'Quy chế / chính sách' },
  { id: 'MAJOR_INFO', label: 'Thông tin ngành' },
  { id: 'FAQ', label: 'Câu hỏi thường gặp' },
  { id: 'PROCESS', label: 'Quy trình / thủ tục' },
]

const BUILTIN_IDS = new Set(KNOWLEDGE_BUILTIN_CATEGORIES.map((c) => c.id))

export function normalizeKnowledgeCategoryId(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')
    .replace(/[^A-Z0-9_]/g, '')
    .slice(0, 48)
}

export function mergeKnowledgeCategories(custom: KnowledgeCategoryDef[]): KnowledgeCategoryDef[] {
  const seen = new Set<string>()
  const out: KnowledgeCategoryDef[] = []
  for (const c of [...KNOWLEDGE_BUILTIN_CATEGORIES, ...custom]) {
    const id = normalizeKnowledgeCategoryId(c.id)
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push({ id, label: c.label.trim() || id })
  }
  return out
}

export function isBuiltinKnowledgeCategory(id: string): boolean {
  return BUILTIN_IDS.has(normalizeKnowledgeCategoryId(id))
}

export function knowledgeCategoryLabel(
  id: string,
  categories: KnowledgeCategoryDef[],
): string {
  const norm = normalizeKnowledgeCategoryId(id)
  return categories.find((c) => c.id === norm)?.label ?? norm
}
