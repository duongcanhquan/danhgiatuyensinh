import { describe, expect, it } from 'vitest'
import type { Lead } from '../types'
import {
  compareLeadsPortalListOrder,
  leadMatchesNguonFilter,
  leadMatchesTinhTrangFilter,
  leadNguonDisplay,
  leadPortalListSortRank,
  leadTinhTrangLabel,
  parseTinhTrangFromUrl,
} from './leadListEnrollment'

function stub(partial: Partial<Lead> & { id: string }): Lead {
  return {
    customerId: '',
    fullName: 'A',
    phone: '0901234567',
    parentPhone: '',
    source: '',
    educationLevel: '',
    status: 'NEW',
    pipelineStatus: 'NEW',
    description: '',
    calculatedScore: 0,
    priorityTag: 'COLD',
    ...partial,
  } as Lead
}

describe('leadNguonDisplay / leadMatchesNguonFilter', () => {
  it('prefers intakeProgram then source', () => {
    expect(leadNguonDisplay(stub({ id: '1', intakeProgram: 'Đợt A', source: 'Zalo' }))).toBe('Đợt A')
    expect(leadNguonDisplay(stub({ id: '2', source: 'Zalo' }))).toBe('Zalo')
  })

  it('matches program or source', () => {
    expect(leadMatchesNguonFilter(stub({ id: '1', intakeProgram: 'Đợt A' }), 'Đợt A')).toBe(true)
    expect(leadMatchesNguonFilter(stub({ id: '2', source: 'Zalo' }), 'Zalo')).toBe(true)
    expect(leadMatchesNguonFilter(stub({ id: '3', source: 'Web' }), 'Zalo')).toBe(false)
    expect(leadMatchesNguonFilter(stub({ id: '4' }), '__UNSET__')).toBe(true)
  })
})

describe('tinh trang filter', () => {
  it('parses url and matches tags', () => {
    expect(parseTinhTrangFromUrl('COC_THANH_CONG')).toBe('COC_THANH_CONG')
    expect(parseTinhTrangFromUrl('nope')).toBe('ALL')
    const coc = stub({
      id: '1',
      finance: { enrollmentStatus: 'CỌC THÀNH CÔNG' },
    })
    expect(leadTinhTrangLabel(coc)).toBe('Cọc thành công')
    expect(leadMatchesTinhTrangFilter(coc, 'COC_THANH_CONG')).toBe(true)
    expect(leadMatchesTinhTrangFilter(coc, 'MOI')).toBe(false)
    expect(
      leadTinhTrangLabel(
        stub({
          id: '2',
          finance: { enrollmentStatus: 'MỚI' },
        }),
      ),
    ).toBe('Chưa thu phí')
  })
})

describe('portal list sort', () => {
  it('puts deposit-complete after new leads; newer first within tier', () => {
    const newer = stub({
      id: 'n',
      finance: { enrollmentStatus: 'MỚI' },
      uploadedAt: { toMillis: () => 2000 } as Lead['uploadedAt'],
    })
    const older = stub({
      id: 'o',
      finance: { enrollmentStatus: 'MỚI' },
      uploadedAt: { toMillis: () => 1000 } as Lead['uploadedAt'],
    })
    const done = stub({
      id: 'd',
      finance: { enrollmentStatus: 'CỌC THÀNH CÔNG' },
      uploadedAt: { toMillis: () => 3000 } as Lead['uploadedAt'],
    })
    expect(leadPortalListSortRank(newer)).toBeLessThan(leadPortalListSortRank(done))
    expect(compareLeadsPortalListOrder(newer, older)).toBeLessThan(0)
    expect(compareLeadsPortalListOrder(done, newer)).toBeGreaterThan(0)
  })
})
