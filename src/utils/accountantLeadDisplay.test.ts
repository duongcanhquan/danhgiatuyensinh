import { describe, expect, it } from 'vitest'
import type { Lead } from '../types'
import {
  accountantFinanceStatusTag,
  isAdminUploaderLabel,
  resolveAccountantCounselorName,
} from './accountantLeadDisplay'
import { sumApprovedPaymentsVnd } from './accountantN8nPayload'

describe('resolveAccountantCounselorName', () => {
  it('prefers assigned counselor from directory over Superadmin uploader', () => {
    expect(
      resolveAccountantCounselorName(
        { assignedTo: 'u-tvv', assignedCounselorId: '', uploaderName: 'Superadmin' },
        { directoryNames: new Map([['u-tvv', 'Nguyễn An']]) },
      ),
    ).toBe('Nguyễn An')
  })

  it('does not fall back to Superadmin when assignee has no directory name', () => {
    expect(
      resolveAccountantCounselorName({
        assignedTo: 'u-unknown',
        assignedCounselorId: '',
        uploaderName: 'Super Admin',
      }),
    ).toBe('Chưa đặt tên')
  })

  it('uses non-admin uploader when unassigned', () => {
    expect(
      resolveAccountantCounselorName({
        assignedTo: '',
        assignedCounselorId: '',
        uploaderName: 'Trần Bình',
      }),
    ).toBe('Trần Bình')
  })

  it('detects admin uploader labels', () => {
    expect(isAdminUploaderLabel('Superadmin')).toBe(true)
    expect(isAdminUploaderLabel('Nguyễn An')).toBe(false)
  })
})

describe('accountantFinanceStatusTag', () => {
  it('does not label YÊU CẦU FULL NE as completed Full NE', () => {
    const lead = {
      id: '1',
      fullName: 'A',
      finance: { fullNeStatus: 'YÊU CẦU FULL NE', enrollmentStatus: 'CỌC THÀNH CÔNG' },
    } as Lead
    expect(accountantFinanceStatusTag(lead)).toBe('Chờ Full NE')
  })

  it('prefers Full NE / Kiểm tra lại over CRM ENROLLED', () => {
    expect(
      accountantFinanceStatusTag({
        id: '1',
        fullName: 'A',
        status: 'ENROLLED',
        finance: { fullNeStatus: 'ĐÃ FULL NE' },
      } as Lead),
    ).toBe('Full NE')
    expect(
      accountantFinanceStatusTag({
        id: '1',
        fullName: 'A',
        status: 'ENROLLED',
        finance: { enrollmentStatus: 'KIỂM TRA LẠI' },
      } as Lead),
    ).toBe('Kiểm tra lại')
  })

  it('folds Sheet enrollment without diacritics', () => {
    const lead = {
      id: '1',
      fullName: 'A',
      finance: { enrollmentStatus: 'COC THANH CONG' },
    } as Lead
    expect(accountantFinanceStatusTag(lead)).toBe('Cọc')
  })

  it('labels confirmed Full NE only', () => {
    const lead = {
      id: '1',
      fullName: 'A',
      finance: { fullNeStatus: 'ĐÃ FULL NE' },
    } as Lead
    expect(accountantFinanceStatusTag(lead)).toBe('Full NE')
  })
})

describe('sumApprovedPaymentsVnd', () => {
  it('counts Sheet approval variants', () => {
    expect(
      sumApprovedPaymentsVnd({
        payments: {
          deposit: { amountVnd: 1_000_000, approvalStatus: 'Dong y' },
          supplementL1: { amountVnd: 500_000, approvalStatus: 'OK' },
        },
      }),
    ).toBe(1_500_000)
  })
})
