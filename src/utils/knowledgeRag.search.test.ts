import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import type { KnowledgeDocument } from '../types'
import { searchKnowledgeByQuery } from './knowledgeRag'

function doc(partial: Partial<KnowledgeDocument> & Pick<KnowledgeDocument, 'id' | 'title' | 'content'>): KnowledgeDocument {
  return {
    type: 'FAQ',
    uploadedAt: Timestamp.now(),
    ...partial,
  }
}

describe('searchKnowledgeByQuery', () => {
  const docs = [
    doc({ id: '1', title: 'Học phí Cao đẳng', content: 'Học phí ngành CNTT khoảng 18 triệu/năm.' }),
    doc({ id: '2', title: 'KTX nội trú', content: 'Ký túc xá có chỗ ở gần trường, đăng ký sớm.' }),
    doc({ id: '3', title: 'Hồ sơ nhập học', content: 'Mang CCCD và học bạ khi nhập học.' }),
  ]

  it('finds tuition by utterance', () => {
    const hits = searchKnowledgeByQuery(docs, 'học phí đắt quá')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]!.doc.id).toBe('1')
  })

  it('returns empty for blank query', () => {
    expect(searchKnowledgeByQuery(docs, ' ')).toEqual([])
  })
})
