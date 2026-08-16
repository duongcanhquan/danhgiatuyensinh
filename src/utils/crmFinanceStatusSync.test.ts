import { describe, expect, it } from 'vitest'
import {
  counselorStatusSuggestedFromEnrollment,
  crmStatusUpgradeFromEnrollment,
} from './crmFinanceStatusSync'

describe('crmFinanceStatusSync', () => {
  it('maps enrollment → CRM suggestion', () => {
    expect(counselorStatusSuggestedFromEnrollment('CỌC THÀNH CÔNG')).toBe('DEPOSIT_PAID')
    expect(counselorStatusSuggestedFromEnrollment('ĐÃ HOÀN THIỆN')).toBe('ENROLLED')
    expect(counselorStatusSuggestedFromEnrollment('MỚI')).toBeNull()
    expect(counselorStatusSuggestedFromEnrollment('KIỂM TRA LẠI')).toBeNull()
  })

  it('only upgrades CRM progress', () => {
    expect(crmStatusUpgradeFromEnrollment('NEW', 'CỌC THÀNH CÔNG')).toBe('DEPOSIT_PAID')
    expect(crmStatusUpgradeFromEnrollment('INTERESTED', 'ĐÃ HOÀN THIỆN')).toBe('ENROLLED')
    expect(crmStatusUpgradeFromEnrollment('ENROLLED', 'CỌC THÀNH CÔNG')).toBeNull()
    expect(crmStatusUpgradeFromEnrollment('DEAD', 'CỌC THÀNH CÔNG')).toBeNull()
    expect(crmStatusUpgradeFromEnrollment('DEPOSIT_PAID', 'CỌC THÀNH CÔNG')).toBeNull()
  })
})
