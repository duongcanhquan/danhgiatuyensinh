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

/** Builtin trước; mục custom trùng id ghi đè nhãn hiển thị (đổi tên danh mục mặc định). */
export function mergeKnowledgeCategories(custom: KnowledgeCategoryDef[]): KnowledgeCategoryDef[] {
  const byId = new Map<string, KnowledgeCategoryDef>()
  for (const c of KNOWLEDGE_BUILTIN_CATEGORIES) {
    byId.set(c.id, { id: c.id, label: c.label })
  }
  for (const c of custom) {
    const id = normalizeKnowledgeCategoryId(c.id)
    if (!id) continue
    byId.set(id, { id, label: c.label.trim() || id })
  }
  return [...byId.values()]
}

/** Điểm khớp từ khóa — cao hơn = ưu tiên lên đầu danh sách. */
export function knowledgeDocSearchScore(
  doc: { title: string; content: string },
  query: string,
): number {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  const title = doc.title.toLowerCase()
  const content = doc.content.toLowerCase()
  let score = 0
  if (title === q) score += 120
  else if (title.startsWith(q)) score += 90
  else if (title.includes(q)) score += 70
  if (content.startsWith(q)) score += 35
  else if (content.includes(q)) score += 25
  for (const word of q.split(/\s+/).filter((w) => w.length >= 2)) {
    if (title.includes(word)) score += 18
    if (content.includes(word)) score += 8
  }
  return score
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
