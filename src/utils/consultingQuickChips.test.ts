import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import type { ConsultingPlaybook, Lead } from '../types'
import {
  buildConsultingChips,
  extractQuestionsFromStrategy,
  filterConsultingChips,
  matchUtteranceToChips,
} from './consultingQuickChips'

const ts = Timestamp.now()

function lead(partial: Partial<Lead> & Pick<Lead, 'id'>): Lead {
  return {
    customerId: 'c1',
    fullName: 'A',
    phone: '1',
    parentPhone: '',
    source: 'web',
    educationLevel: 'Công nghệ thông tin',
    assignedTo: null,
    status: 'NEW',
    description: '',
    highSchool: '',
    gradeClass: '',
    province: 'Hà Nội',
    address: '',
    calculatedScore: 80,
    priorityTag: 'HOT',
    uploadedAt: ts,
    updatedAt: ts,
    pipelineStatus: 'NEW',
    uniqueHash: 'h',
    createdAt: ts,
    ...partial,
  }
}

function pb(partial: Partial<ConsultingPlaybook> & Pick<ConsultingPlaybook, 'id' | 'title'>): ConsultingPlaybook {
  return {
    isActive: true,
    priority: 50,
    triggerConditions: [{ field: 'educationLevel', operator: 'EQUALS', value: 'Công nghệ thông tin' }],
    strategy: 'Hỏi phụ huynh về ngân sách?\nNhấn mạnh lab.',
    keySellingPoints: ['Lab mạnh', 'Cam kết việc làm'],
    objectionHandling: ['Học phí đắt -> Có trả góp 3 đợt', 'Xa nhà → Có KTX'],
    createdAt: ts,
    updatedAt: ts,
    ...partial,
  }
}

describe('extractQuestionsFromStrategy', () => {
  it('picks question lines', () => {
    expect(extractQuestionsFromStrategy('Hello\nNgân sách thế nào?\nHỏi thêm về ngành')).toEqual([
      'Ngân sách thế nào?',
      'Hỏi thêm về ngành',
    ])
  })
})

describe('buildConsultingChips', () => {
  it('builds objection and usp chips from matched playbooks', () => {
    const chips = buildConsultingChips({
      lead: lead({ id: 'l1' }),
      playbooks: [pb({ id: 'p1', title: 'IT HOT' })],
    })
    expect(chips.some((c) => c.kind === 'objection' && c.label.includes('Học phí'))).toBe(true)
    expect(chips.some((c) => c.kind === 'usp')).toBe(true)
    expect(chips.find((c) => c.label.includes('Học phí'))?.copyText).toContain('trả góp')
  })
})

describe('matchUtteranceToChips', () => {
  it('matches student words to objection chip', () => {
    const chips = buildConsultingChips({
      lead: lead({ id: 'l1' }),
      playbooks: [pb({ id: 'p1', title: 'IT' })],
    })
    const hit = matchUtteranceToChips('em thấy học phí đắt quá', chips)
    expect(hit[0]?.label).toMatch(/học phí/i)
  })
})

describe('filterConsultingChips', () => {
  it('filters by query', () => {
    const chips = buildConsultingChips({
      lead: lead({ id: 'l1' }),
      playbooks: [pb({ id: 'p1', title: 'IT' })],
    })
    expect(filterConsultingChips(chips, 'ktx').some((c) => /xa nhà/i.test(c.label))).toBe(true)
  })
})
