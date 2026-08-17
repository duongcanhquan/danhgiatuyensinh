import type { ConsultingPlaybook, KnowledgeDocument, ScriptSnippet } from '../types'
import { SCRIPT_CATEGORY_LABELS } from '../types'
import { knowledgeCategoryLabel, knowledgeDocSearchScore, type KnowledgeCategoryDef } from './knowledgeCategories'
import {
  playbookContentCategoryLabel,
  resolvePlaybookContentCategory,
} from './playbookContentCategories'

export type SkillLabKind = 'knowledge' | 'playbook' | 'snippet'
export type SkillLabMode = 'ask' | 'roleplay'

export type SkillLabItem = {
  key: string
  kind: SkillLabKind
  id: string
  title: string
  categoryId: string
  categoryLabel: string
  body: string
}

export function knowledgeToLabItem(d: KnowledgeDocument, categories: KnowledgeCategoryDef[]): SkillLabItem {
  return {
    key: `knowledge:${d.id}`,
    kind: 'knowledge',
    id: d.id,
    title: d.title,
    categoryId: String(d.type || 'GENERAL'),
    categoryLabel: knowledgeCategoryLabel(String(d.type || 'GENERAL'), categories),
    body: d.content.trim(),
  }
}

export function playbookToLabItem(p: ConsultingPlaybook): SkillLabItem {
  const cat = resolvePlaybookContentCategory(p)
  const usp = (p.keySellingPoints ?? []).map((x) => `- ${x}`).join('\n')
  const obj = (p.objectionHandling ?? []).map((x) => `- ${x}`).join('\n')
  const body = [p.strategy?.trim() ?? '', usp ? `Điểm mạnh:\n${usp}` : '', obj ? `Xử lý từ chối:\n${obj}` : '']
    .filter(Boolean)
    .join('\n\n')
  return {
    key: `playbook:${p.id}`,
    kind: 'playbook',
    id: p.id,
    title: p.title,
    categoryId: cat,
    categoryLabel: playbookContentCategoryLabel(cat),
    body,
  }
}

export function snippetToLabItem(s: ScriptSnippet): SkillLabItem {
  return {
    key: `snippet:${s.id}`,
    kind: 'snippet',
    id: s.id,
    title: s.title,
    categoryId: s.category,
    categoryLabel: SCRIPT_CATEGORY_LABELS[s.category] ?? s.category,
    body: s.content.trim(),
  }
}

export function collectSkillLabItems(input: {
  documents: readonly KnowledgeDocument[]
  playbooks: readonly ConsultingPlaybook[]
  snippets: readonly ScriptSnippet[]
  categories: KnowledgeCategoryDef[]
}): SkillLabItem[] {
  const docs = input.documents.map((d) => knowledgeToLabItem(d, input.categories))
  const pbs = input.playbooks.filter((p) => p.isActive !== false).map(playbookToLabItem)
  const snips = input.snippets.filter((s) => s.isActive !== false).map(snippetToLabItem)
  return [...docs, ...pbs, ...snips]
}

export function filterSkillLabItems(
  items: readonly SkillLabItem[],
  opts: { kind?: SkillLabKind | 'all'; categoryId?: string; query?: string },
): SkillLabItem[] {
  const kind = opts.kind ?? 'all'
  const categoryId = (opts.categoryId ?? '').trim()
  const q = (opts.query ?? '').trim()
  let rows = kind === 'all' ? [...items] : items.filter((i) => i.kind === kind)
  if (categoryId) rows = rows.filter((i) => i.categoryId === categoryId)
  if (q.length < 2) {
    return rows.sort((a, b) => a.title.localeCompare(b.title, 'vi'))
  }
  return [...rows]
    .map((item) => ({ item, score: knowledgeDocSearchScore({ title: item.title, content: item.body }, q) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title, 'vi'))
    .map((x) => x.item)
}

export function buildSkillLabContextBlock(items: readonly SkillLabItem[], maxChars = 10_000): string {
  if (!items.length) return ''
  const parts: string[] = []
  let used = 0
  for (const item of items) {
    const kindLabel =
      item.kind === 'knowledge' ? 'Tri thức' : item.kind === 'playbook' ? 'Mẫu tư vấn' : 'Mảnh thoại'
    const header = `### [${kindLabel} · ${item.categoryLabel}] ${item.title}\n`
    const body = `${item.body.trim()}\n\n`
    const chunk = header + body
    if (used + chunk.length > maxChars) {
      const remain = maxChars - used - header.length - 24
      if (remain > 160) parts.push(`${header}${item.body.trim().slice(0, remain)}…\n`)
      break
    }
    parts.push(chunk)
    used += chunk.length
  }
  return parts.join('\n').trim()
}

export function pickSkillLabContext(input: {
  all: readonly SkillLabItem[]
  selected: SkillLabItem | null
  userText: string
  limit?: number
}): SkillLabItem[] {
  const limit = input.limit ?? 6
  const hits = filterSkillLabItems(input.all, { query: input.userText }).slice(0, limit)
  const out: SkillLabItem[] = []
  const seen = new Set<string>()
  if (input.selected) {
    out.push(input.selected)
    seen.add(input.selected.key)
  }
  for (const h of hits) {
    if (seen.has(h.key)) continue
    out.push(h)
    seen.add(h.key)
    if (out.length >= limit) break
  }
  if (out.length < 3) {
    for (const item of input.all) {
      if (seen.has(item.key)) continue
      if (item.kind !== 'knowledge') continue
      out.push(item)
      seen.add(item.key)
      if (out.length >= 3) break
    }
  }
  return out
}

export function buildSkillLabSystemPrompt(opts: { mode: SkillLabMode; context: string }): string {
  const grounded = opts.context.trim()
    ? `## Kho đã duyệt\n${opts.context.trim()}`
    : '## Kho đã duyệt\n(Trống — chưa có tài liệu khớp. Nói rõ «chưa có trong kho tri thức đã duyệt».)'

  if (opts.mode === 'roleplay') {
    return [
      'Bạn đóng vai phụ huynh hoặc thí sinh đang tìm hiểu tuyển sinh (tiếng Việt, đời thường, ngắn).',
      'TVV đang luyện kỹ năng — không phải khách hàng thật.',
      'Chỉ hỏi / lo / phản đối dựa trên kho đã duyệt. Không bịa học phí, hạn, học bổng, quy chế.',
      'Sau mỗi lượt TVV: phản ứng tự nhiên (gật một phần, hỏi thêm, hoặc còn e ngại). Không chấm điểm trừ khi TVV hỏi «nhận xét».',
      'Nếu kho trống về chủ đề: nói «em chưa rõ, anh/chị giải thích giúp» — không bịa.',
      grounded,
    ].join('\n')
  }

  return [
    'Bạn là huấn luyện viên tư vấn tuyển sinh: giúp TVV hiểu tài liệu đã duyệt và luyện câu nói.',
    'Chỉ khẳng định học phí, ngành, quy chế, học bổng, thời hạn… khi có trong kho. Thiếu thì nói «chưa có trong kho tri thức đã duyệt».',
    'Không bịa số liệu. Giọng tiếng Việt, rõ, có thể đọc khi gọi điện (2–6 câu trừ khi TVV xin chi tiết).',
    'Khi hỏi cách nói: đưa câu TVV có thể nói ngay, rồi một dòng «Căn cứ: …».',
    grounded,
  ].join('\n')
}

export function defaultSkillLabStarters(): string[] {
  return [
    'Học phí các ngành chính hiện nay là bao nhiêu?',
    'Phụ huynh hỏi trường có tốt không — TVV nên nói gì?',
    'Quy trình nhập học gồm những bước nào?',
    'Có học bổng nào, điều kiện ra sao?',
    'Khách chưa chọn ngành — gợi ý câu hỏi để hiểu mong muốn.',
  ]
}

export function skillLabStarterPrompts(item: SkillLabItem | null, mode: SkillLabMode): string[] {
  if (!item) {
    return mode === 'roleplay'
      ? [
          'Phụ huynh: học phí đắt quá, trường công rẻ hơn.',
          'Thí sinh: em chưa biết chọn ngành nào.',
          'Phụ huynh: trường này ra trường có việc không?',
          'Phụ huynh: hồ sơ nhập học cần gì?',
        ]
      : defaultSkillLabStarters()
  }
  if (mode === 'roleplay') {
    return [
      `Tôi là phụ huynh, đang băn khoăn về: ${item.title}.`,
      `Hãy hỏi TVV như khách chưa tin — chủ đề «${item.title}».`,
      'Phản đối: so sánh với trường khác / học phí.',
    ]
  }
  if (item.kind === 'knowledge') {
    return [
      `Tóm tắt «${item.title}» thành lời gọi điện 45 giây.`,
      `Câu hỏi phụ huynh thường gặp về «${item.title}» và câu TVV nên đáp.`,
      `Rút 3 ý bắt buộc TVV phải thuộc trong tài liệu này.`,
    ]
  }
  if (item.kind === 'playbook') {
    return [
      `Tóm tắt mẫu «${item.title}» cho TVV mới.`,
      `Đóng vài câu xử lý từ chối theo mẫu này.`,
      `Khi nào dùng mẫu «${item.title}», khi nào không.`,
    ]
  }
  return [
    `Khi nào dùng mảnh thoại «${item.title}»?`,
    `Chỉnh câu này cho tự nhiên hơn khi gọi phụ huynh.`,
    `Gợi ý 2 biến thể (ngắn / đủ ý) từ mảnh thoại này.`,
  ]
}

export function trimChatTurns<T>(turns: readonly T[], keep = 10): T[] {
  if (turns.length <= keep) return [...turns]
  return turns.slice(-keep)
}
