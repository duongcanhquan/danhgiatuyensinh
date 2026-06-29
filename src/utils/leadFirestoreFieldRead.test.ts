import { describe, expect, it } from 'vitest'
import { readLeadSemanticFieldsFromFirestore } from './leadFirestoreFieldRead'

describe('leadFirestoreFieldRead', () => {
  it('đọc alias legacy cho trường THPT và quận huyện', () => {
    const f = readLeadSemanticFieldsFromFirestore({
      schoolName: 'THPT Chương Mỹ B',
      district: 'Chương Mỹ',
      region: 'HÀ NỘI',
      leadSource: 'Facebook',
      academicLevel: 'Giỏi',
    })
    expect(f.highSchool).toBe('THPT Chương Mỹ B')
    expect(f.hanoiArea).toBe('Chương Mỹ')
    expect(f.province).toBe('HÀ NỘI')
    expect(f.sourcePrimary).toBe('Facebook')
    expect(f.academicPerformance).toBe('Giỏi')
  })
})
