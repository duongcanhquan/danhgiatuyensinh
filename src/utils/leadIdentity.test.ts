import { describe, expect, it } from 'vitest'
import {
  computeLeadUniqueHash,
  computeNationalIdHash,
  leadDedupeStrength,
  normalizeNationalIdKey,
  shouldQueryExistingByUniqueHash,
} from './leadIdentity'

describe('computeLeadUniqueHash', () => {
  it('matches Node crypto SHA-256 for phone-based basis (stable vs Firestore)', () => {
    const h = computeLeadUniqueHash({ phone: '0912345678' })
    expect(h).toBe('6467758576179174e4a05b038abda3b94c93a8f52b6092a34710dbd81120963d')
  })

  it('treats Excel-style 9-digit mobile same as leading-zero form', () => {
    expect(computeLeadUniqueHash({ phone: '912345678' })).toBe(
      computeLeadUniqueHash({ phone: '0912345678' }),
    )
  })

  it('is deterministic for identity fallback', () => {
    const row = { fullName: 'Nguyễn Văn A', customerId: 'KH01', educationLevel: 'ĐH', gradeClass: '12' }
    expect(computeLeadUniqueHash(row)).toBe(computeLeadUniqueHash(row))
  })

  it('does not collapse empty rows onto one shared hash when salted', () => {
    expect(leadDedupeStrength({})).toBe('weak')
    expect(shouldQueryExistingByUniqueHash({})).toBe(false)
    expect(computeLeadUniqueHash({}, 0)).not.toBe(computeLeadUniqueHash({}, 1))
  })
})

describe('normalizeNationalIdKey / computeNationalIdHash (Apps Script parity)', () => {
  it('returns empty for CHƯA CÓ / notAvailable / blank — không dùng để chặn trùng', () => {
    expect(normalizeNationalIdKey('CHƯA CÓ', false)).toBe('')
    expect(normalizeNationalIdKey('001234567890', true)).toBe('')
    expect(normalizeNationalIdKey('  ', false)).toBe('')
    expect(computeNationalIdHash('')).toBeNull()
  })

  it('normalizes digits and passport alphanumeric uppercase', () => {
    expect(normalizeNationalIdKey('001-234-567-890', false)).toBe('001234567890')
    expect(normalizeNationalIdKey('ab1234567', false)).toBe('AB1234567')
  })

  it('hashes stable nationalId key (separate from phone uniqueHash)', () => {
    const a = computeNationalIdHash(normalizeNationalIdKey('001234567890', false))
    const b = computeNationalIdHash(normalizeNationalIdKey('001234567890', false))
    expect(a).toBeTruthy()
    expect(a).toBe(b)
    expect(a).not.toBe(computeLeadUniqueHash({ phone: '0912345678' }))
  })
})
