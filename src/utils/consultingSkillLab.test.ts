import { describe, expect, it } from 'vitest'
import type { ConsultingPlaybook, KnowledgeDocument, ScriptSnippet } from '../types'
import { Timestamp } from 'firebase/firestore'
import {
  buildSkillLabContextBlock,
  buildSkillLabSystemPrompt,
  collectSkillLabItems,
  filterSkillLabItems,
  pickSkillLabContext,
  skillLabStarterPrompts,
  trimChatTurns,
} from './consultingSkillLab'
import { KNOWLEDGE_BUILTIN_CATEGORIES } from './knowledgeCategories'

const ts = Timestamp.now()

function doc(p: Partial<KnowledgeDocument> & Pick<KnowledgeDocument, 'id' | 'title' | 'content'>): KnowledgeDocument {
  return { type: 'MAJOR_INFO', uploadedAt: ts, ...p }
}

describe('consultingSkillLab', () => {
  const documents = [
    doc({ id: 'cntt', title: 'Ngành CNTT', content: 'Học 3 năm, chú trọng thực hành lập trình.' }),
    doc({ id: 'fee', title: 'Học phí 2026', type: 'TUITION', content: 'Học phí khoảng 18 triệu/năm.' }),
  ]
  const playbooks: ConsultingPlaybook[] = [
    {
      id: 'pb1',
      title: 'Xử lý học phí đắt',
      isActive: true,
      priority: 1,
      triggerConditions: [],
      strategy: 'Nhấn trả góp và học bổng.',
      objectionHandling: ['Trường công rẻ hơn'],
      createdAt: ts,
      updatedAt: ts,
      contentCategory: 'tuition',
    },
  ]
  const snippets: ScriptSnippet[] = [
    {
      id: 'sn1',
      title: 'Chào phụ huynh',
      category: 'GREETING',
      content: 'Dạ em chào cô/chú, em là tư vấn viên nhà trường ạ.',
      matchConditions: [],
      isActive: true,
      lastUpdated: ts,
    },
  ]

  it('collects knowledge, playbooks and snippets', () => {
    const items = collectSkillLabItems({
      documents,
      playbooks,
      snippets,
      categories: KNOWLEDGE_BUILTIN_CATEGORIES,
    })
    expect(items.map((i) => i.key)).toEqual(['knowledge:cntt', 'knowledge:fee', 'playbook:pb1', 'snippet:sn1'])
  })

  it('filters by kind', () => {
    const items = collectSkillLabItems({
      documents,
      playbooks,
      snippets,
      categories: KNOWLEDGE_BUILTIN_CATEGORIES,
    })
    expect(filterSkillLabItems(items, { kind: 'playbook' }).every((i) => i.kind === 'playbook')).toBe(true)
    expect(filterSkillLabItems(items, { kind: 'knowledge' })).toHaveLength(2)
  })

  it('filters by query across titles', () => {
    const items = collectSkillLabItems({
      documents,
      playbooks,
      snippets,
      categories: KNOWLEDGE_BUILTIN_CATEGORIES,
    })
    const hits = filterSkillLabItems(items, { query: 'học phí' })
    expect(hits[0]!.id).toBe('fee')
    expect(hits.some((h) => h.id === 'pb1')).toBe(true)
  })

  it('picks selected item first in context', () => {
    const all = collectSkillLabItems({
      documents,
      playbooks,
      snippets,
      categories: KNOWLEDGE_BUILTIN_CATEGORIES,
    })
    const selected = all.find((i) => i.id === 'cntt')!
    const ctx = pickSkillLabContext({ all, selected, userText: 'học phí' })
    expect(ctx[0]!.id).toBe('cntt')
    expect(ctx.some((i) => i.id === 'fee')).toBe(true)
  })

  it('builds grounded system prompt without inventing when context empty', () => {
    const sys = buildSkillLabSystemPrompt({ mode: 'ask', context: '' })
    expect(sys).toMatch(/chưa có trong kho tri thức đã duyệt/)
    expect(buildSkillLabContextBlock([])).toBe('')
  })

  it('roleplay starters mention the selected title', () => {
    const all = collectSkillLabItems({
      documents,
      playbooks,
      snippets,
      categories: KNOWLEDGE_BUILTIN_CATEGORIES,
    })
    const item = all.find((i) => i.id === 'cntt')!
    expect(skillLabStarterPrompts(item, 'roleplay').join(' ')).toMatch(/Ngành CNTT/)
  })

  it('trims chat turns', () => {
    expect(trimChatTurns([1, 2, 3, 4], 2)).toEqual([3, 4])
  })
})
