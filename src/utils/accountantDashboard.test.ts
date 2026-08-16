import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import type { Lead } from '../types'
import { buildAccountantDashboardStats } from './accountantDashboard'

function lead(partial: Partial<Lead> & { id: string }): Lead {
  const now = Timestamp.now()
  return {
    id: partial.id,
    fullName: partial.fullName ?? 'HS',
    phone: '',
    educationLevel: partial.educationLevel ?? 'Cao đẳng',
    majorInterest: partial.majorInterest ?? 'Điều dưỡng',
    source: '',
    province: '',
    status: 'NEW',
    pipelineStatus: 'NEW',
    createdAt: now,
    updatedAt: now,
    ...partial,
  } as Lead
}

describe('buildAccountantDashboardStats', () => {
  it('sums approved payments in today range and ranks counselors', () => {
    const at = new Date('2026-08-16T10:00:00+07:00')
    const leads = [
      lead({
        id: 'a',
        uploaderName: 'TVV An',
        assignedTo: 'u1',
        finance: {
          enrollmentStatus: 'CỌC THÀNH CÔNG',
          payments: {
            deposit: {
              amountVnd: 5_000_000,
              collectedAt: '16/08/2026',
              approvalStatus: 'ĐỒNG Ý',
            },
          },
        },
      }),
      lead({
        id: 'b',
        uploaderName: 'TVV Bình',
        majorInterest: 'Dược',
        finance: {
          enrollmentStatus: 'MỚI',
          payments: {
            deposit: {
              amountVnd: 2_000_000,
              collectedAt: '16/08/2026',
              approvalStatus: 'ĐỒNG Ý',
            },
          },
        },
      }),
      lead({
        id: 'c',
        finance: {
          enrollmentStatus: 'MỚI',
          payments: {
            deposit: {
              amountVnd: 9_000_000,
              collectedAt: '01/08/2026',
              approvalStatus: 'ĐỒNG Ý',
            },
          },
        },
      }),
    ]

    const today = buildAccountantDashboardStats(
      leads,
      { range: 'today', major: '', educationLevel: '' },
      { at },
    )
    expect(today.totalApprovedVnd).toBe(7_000_000)
    expect(today.studentCount).toBe(2)
    expect(today.byCounselor[0]?.name).toBe('TVV An')
    expect(today.byCounselor[0]?.amountVnd).toBe(5_000_000)

    const filtered = buildAccountantDashboardStats(
      leads,
      { range: 'today', major: 'Dược', educationLevel: '' },
      { at },
    )
    expect(filtered.totalApprovedVnd).toBe(2_000_000)
    expect(filtered.studentCount).toBe(1)
  })
})
