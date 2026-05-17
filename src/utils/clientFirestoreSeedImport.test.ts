import { describe, expect, it } from 'vitest'
import { parseConsultingPlaybooksJson, parseKnowledgeDocumentsJson } from './clientFirestoreSeedImport'

describe('parseKnowledgeDocumentsJson', () => {
  it('accepts valid array', () => {
    const rows = parseKnowledgeDocumentsJson([
      { id: 'a', title: 'T', type: 'POLICY', content: 'C' },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]!.id).toBe('a')
  })

  it('uppercases custom type id', () => {
    const rows = parseKnowledgeDocumentsJson([{ id: 'a', title: 'T', type: 'wrong', content: 'C' }])
    expect(rows[0]!.type).toBe('WRONG')
  })
})

describe('parseConsultingPlaybooksJson', () => {
  it('parses triggerConditions', () => {
    const rows = parseConsultingPlaybooksJson([
      {
        id: 'p1',
        title: 'Test',
        priority: 5,
        triggerConditions: [{ field: 'province', operator: 'IN', value: ['A', 'B'] }],
        strategy: 'S',
        keySellingPoints: ['u'],
        objectionHandling: ['o'],
      },
    ])
    expect(rows[0]!.triggerConditions[0]!.operator).toBe('IN')
    expect(rows[0]!.triggerConditions[0]!.value).toEqual(['A', 'B'])
  })
})
