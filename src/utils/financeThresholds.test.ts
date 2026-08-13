import { describe, expect, it } from 'vitest'
import {
  defaultFinanceDepositThresholds,
  parseFinanceDepositThresholds,
  resolveDepositThresholdVnd,
  resolveLpxtMinVnd,
} from './financeThresholds'

describe('financeDepositThresholds (Apps Script defaults)', () => {
  it('mặc định 150k / 1tr / 2tr (9+)', () => {
    const t = defaultFinanceDepositThresholds()
    expect(t.lpxtMinVnd).toBe(150_000)
    expect(t.depositStandardVnd).toBe(1_000_000)
    expect(t.depositNinePlusVnd).toBe(2_000_000)
    expect(resolveDepositThresholdVnd('Cao đẳng', t)).toBe(1_000_000)
    expect(resolveDepositThresholdVnd('Hệ 9+', t)).toBe(2_000_000)
    expect(resolveLpxtMinVnd(t)).toBe(150_000)
  })

  it('parse override từ org settings', () => {
    const t = parseFinanceDepositThresholds({
      lpxtMinVnd: 200_000,
      depositStandardVnd: 1_500_000,
      depositNinePlusVnd: 3_000_000,
    })
    expect(t.lpxtMinVnd).toBe(200_000)
    expect(resolveDepositThresholdVnd('9+', t)).toBe(3_000_000)
    expect(resolveDepositThresholdVnd('TC', t)).toBe(1_500_000)
  })

  it('bỏ qua giá trị không hợp lệ', () => {
    const t = parseFinanceDepositThresholds({
      lpxtMinVnd: -1,
      depositStandardVnd: 'abc',
      depositNinePlusVnd: 0,
    })
    expect(t).toEqual(defaultFinanceDepositThresholds())
  })
})
