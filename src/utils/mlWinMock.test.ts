import { Timestamp } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import type { Lead } from '../types'
import { getDefaultInfoScoreRules, infoScoreMaxRaw } from './infoScoreRules'
import { buildMlWinHoverText, computeMockMlWinProbability, resolveMlWinDisplay } from './mlWinMock'

function stubLead(over: Partial<Lead> = {}): Lead {
  const t = Timestamp.fromMillis(1_700_000_000_000)
  return {
    id: 'lead-test',
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

describe('resolveMlWinDisplay', () => {
  it('uses Firestore when mlWinProbability + mlExplanation are set', () => {
    const ml = resolveMlWinDisplay(
      stubLead({
        mlWinProbability: 72,
        mlExplanation: '  Mô hình nội bộ  ',
      }),
    )
    expect(ml.source).toBe('firestore')
    expect(ml.mlWinProbability).toBe(72)
    expect(ml.mlExplanation).toBe('Mô hình nội bộ')
    expect(ml.mvpBreakdown).toBeUndefined()
    expect(buildMlWinHoverText(ml)).toContain('Firestore')
  })

  it('uses MVP mock when Firestore fields are incomplete', () => {
    const ml = resolveMlWinDisplay(stubLead({ mlWinProbability: 80 }))
    expect(ml.source).toBe('mvp_mock')
    expect(ml.mvpBreakdown).toBeDefined()
  })
})

describe('computeMockMlWinProbability', () => {
  it('counts VN student phone as 10 digits after +84 normalization', () => {
    const m = computeMockMlWinProbability(
      stubLead({
        phone: '+84901234567',
        fullName: 'Nguyễn A',
      }),
    )
    const phoneRow = m.mvpBreakdown?.items.find((i) => i.id === 'phone')
    expect(phoneRow?.matched).toBe(true)
    // base 10 + tên 4 + SĐT đủ 10 số 8
    expect(m.mlWinProbability).toBe(22)
  })

  it('does not match student phone when national digits are not length 10', () => {
    const m = computeMockMlWinProbability(stubLead({ phone: '090' }))
    const phoneRow = m.mvpBreakdown?.items.find((i) => i.id === 'phone')
    expect(phoneRow?.matched).toBe(false)
  })

  it('sums all MVP rows when 20 tiêu chí chuẩn đều khớp (max theo cấu hình mặc định)', () => {
    const rules = getDefaultInfoScoreRules()
    const maxRaw = infoScoreMaxRaw(rules)
    const m = computeMockMlWinProbability(
      stubLead({
        fullName: 'X',
        phone: '0901234567',
        customerId: 'KH1',
        parentPhone: '0912345678',
        source: 'Web',
        dateOfBirth: '2006-01-01',
        majorInterest: 'CNTT',
        academicPerformance: 'Khá',
        highSchool: 'THPT 1',
        aspirations: 'Đại học',
        financialStatus: 'FULL_PAY',
        hanoiArea: 'Ba Đình',
        hobbies: 'Đọc sách',
        profileNote1: 'G1',
        profileNote2: 'G2',
        gradeClass: '12A1',
        province: 'HN',
        address: 'P1',
        assignedTo: 'uid-tvv-1',
        otherAttentionNotes: 'OK',
      }),
    )
    expect(m.mvpBreakdown?.rawScore).toBe(maxRaw)
    expect(m.mlWinProbability).toBe(maxRaw)
    expect(m.mvpBreakdown?.clampedPercent).toBe(maxRaw)
  })

  it('buildMlWinHoverText lists steps and raw score for MVP', () => {
    const ml = resolveMlWinDisplay(stubLead({ fullName: 'A', phone: '0901234567' }))
    const tip = buildMlWinHoverText(ml)
    expect(tip).toContain('Điểm thô')
    expect(tip).toMatch(/Điện thoại|điện thoại/i)
  })
})
