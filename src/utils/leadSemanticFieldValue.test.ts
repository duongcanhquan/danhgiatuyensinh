import { describe, expect, it } from 'vitest'
import type { Lead } from '../types'
import { Timestamp } from 'firebase/firestore'
import { leadSemanticFieldValue } from './leadSemanticFieldValue'

function stubLead(over: Partial<Lead>): Lead {
  const t = Timestamp.fromMillis(1_700_000_000_000)
  return {
    id: 'x',
    customerId: '',
    fullName: '',
    phone: '',
    parentPhone: '',
    source: '',
    educationLevel: '',
    assignedTo: null,
    status: 'NEW',
    description: '',
    highSchool: '',
    gradeClass: '',
    province: '',
    address: '',
    calculatedScore: 0,
    priorityTag: 'COLD',
    uploadedAt: t,
    updatedAt: t,
    pipelineStatus: 'NEW',
    uniqueHash: 'h',
    createdAt: t,
    ...over,
  }
}

describe('leadSemanticFieldValue', () => {
  it('major / majorInterest ưu tiên majorInterest rồi educationLevel', () => {
    const l = stubLead({ educationLevel: 'Cao đẳng', majorInterest: '  CNTT  ' })
    expect(leadSemanticFieldValue(l, 'majorInterest')).toBe('CNTT')
    expect(leadSemanticFieldValue(l, 'major')).toBe('CNTT')
  })

  it('academicLevel ưu tiên academicPerformance', () => {
    const l = stubLead({ educationLevel: 'X', academicPerformance: 'Giỏi' })
    expect(leadSemanticFieldValue(l, 'academicLevel')).toBe('Giỏi')
  })

  it('đọc financialStatus và hanoiArea', () => {
    const l = stubLead({ financialStatus: 'FULL_PAY', hanoiArea: 'Ba Đình' })
    expect(leadSemanticFieldValue(l, 'financialStatus')).toBe('FULL_PAY')
    expect(leadSemanticFieldValue(l, 'hanoiArea')).toBe('Ba Đình')
  })
})
