import { describe, expect, it } from 'vitest'
import { leadMatchesClientSearch } from '../hooks/useLeads'
import type { Lead } from '../types'

function lead(over: Partial<Lead> = {}): Lead {
  return {
    id: 'L1',
    customerId: '',
    fullName: 'NGUYEN VAN A',
    phone: '0987654321',
    parentPhone: '',
    source: 'Web đăng ký',
    educationLevel: 'Cao đẳng',
    assignedCounselorId: null,
    assignedTo: null,
    status: 'NEW',
    pipelineStatus: 'NEW',
    description: '',
    highSchool: 'THPT A',
    gradeClass: '',
    province: 'Ha Noi',
    address: '',
    calculatedScore: 0,
    priorityTag: 'COLD',
    createdAt: null as unknown as Lead['createdAt'],
    updatedAt: null as unknown as Lead['updatedAt'],
    uploadedAt: null as unknown as Lead['uploadedAt'],
    ...over,
  } as Lead
}

describe('leadMatchesClientSearch', () => {
  it('matches systemCode and studentEmail', () => {
    const l = lead({ systemCode: '2608150007', studentEmail: 'a@school.edu.vn', source1: 'Portal' })
    expect(leadMatchesClientSearch(l, '2608150007', undefined)).toBe(true)
    expect(leadMatchesClientSearch(l, 'a@school', undefined)).toBe(true)
    expect(leadMatchesClientSearch(l, 'portal', undefined)).toBe(true)
    expect(leadMatchesClientSearch(l, '9999999999', undefined)).toBe(false)
  })
})
