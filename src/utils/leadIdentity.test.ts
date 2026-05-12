import { describe, expect, it } from 'vitest'
import { computeLeadUniqueHash } from './leadIdentity'

describe('computeLeadUniqueHash', () => {
  it('matches Node crypto SHA-256 for phone-based basis (stable vs Firestore)', () => {
    const h = computeLeadUniqueHash({ phone: '0912345678' })
    expect(h).toBe('6467758576179174e4a05b038abda3b94c93a8f52b6092a34710dbd81120963d')
  })

  it('is deterministic for identity fallback', () => {
    const row = { fullName: 'Nguyễn Văn A', customerId: 'KH01', educationLevel: 'ĐH', gradeClass: '12' }
    expect(computeLeadUniqueHash(row)).toBe(computeLeadUniqueHash(row))
  })
})
