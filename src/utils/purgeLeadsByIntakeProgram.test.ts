import { describe, expect, it } from 'vitest'
import { isFirestoreIndexError, leadMatchesPurgeProgram } from './purgeLeadsByIntakeProgram'
import type { Lead } from '../types'
import { Timestamp } from 'firebase/firestore'

function lead(partial: Partial<Lead> & { id: string }): Lead {
  const now = Timestamp.now()
  return {
    fullName: 'A',
    phone: '1',
    email: '',
    source: '',
    educationLevel: '',
    province: '',
    calculatedScore: 0,
    priorityTag: 'COLD',
    status: 'NEW',
    createdAt: now,
    updatedAt: now,
    ...partial,
  } as Lead
}

describe('leadMatchesPurgeProgram', () => {
  it('khớp chương trình không phân biệt hoa thường', () => {
    expect(leadMatchesPurgeProgram(lead({ id: '1', intakeProgram: 'Dot Loi 1' }), 'dot loi 1')).toBe(
      true,
    )
  })

  it('__UNSET__ chỉ khớp hồ sơ chưa gắn', () => {
    expect(leadMatchesPurgeProgram(lead({ id: '1', intakeProgram: '' }), '__UNSET__')).toBe(true)
    expect(leadMatchesPurgeProgram(lead({ id: '2' }), '__UNSET__')).toBe(true)
    expect(leadMatchesPurgeProgram(lead({ id: '3', intakeProgram: 'X' }), '__UNSET__')).toBe(false)
  })
})

describe('isFirestoreIndexError', () => {
  it('nhận diện lỗi thiếu composite index', () => {
    expect(
      isFirestoreIndexError(
        new Error('The query requires an index. You can create it here: https://console.firebase.google.com/...'),
      ),
    ).toBe(true)
    expect(isFirestoreIndexError({ code: 'failed-precondition', message: 'x' })).toBe(true)
    expect(isFirestoreIndexError(new Error('permission-denied'))).toBe(false)
  })
})
