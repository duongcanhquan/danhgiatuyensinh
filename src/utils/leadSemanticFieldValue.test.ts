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

  it('source / leadSource ưu tiên source1 (Nguồn 1 CRM)', () => {
    const l = stubLead({ source: '', source1: 'Facebook Ads', source2: 'Zalo' })
    expect(leadSemanticFieldValue(l, 'source')).toBe('Facebook Ads')
    expect(leadSemanticFieldValue(l, 'leadSource')).toBe('Facebook Ads')
    expect(leadSemanticFieldValue(l, 'source1')).toBe('Facebook Ads')
    expect(leadSemanticFieldValue(l, 'source2')).toBe('Zalo')
  })

  it('academicPerformance đọc trực tiếp từ hồ sơ', () => {
    const l = stubLead({ academicPerformance: 'Giỏi', educationLevel: 'Đại học' })
    expect(leadSemanticFieldValue(l, 'academicPerformance')).toBe('Giỏi')
  })
})
