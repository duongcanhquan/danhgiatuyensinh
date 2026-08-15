import { describe, expect, it } from 'vitest'
import { describeLeadCorePatchAudit, leadCoreFieldLabelVi } from './leadCoreFieldLabels'

describe('leadCoreFieldLabels', () => {
  it('maps technical keys to Vietnamese labels', () => {
    expect(leadCoreFieldLabelVi('source2')).toBe('Nguồn 2')
    expect(leadCoreFieldLabelVi('fatherName')).toBe('Họ tên bố')
    expect(leadCoreFieldLabelVi('scholarship2Id')).toBe('Học bổng 2')
  })

  it('describes audit without technical field ids', () => {
    const text = describeLeadCorePatchAudit({
      source2: 'Zalo',
      fatherName: 'A',
      fatherPhone: '09',
      motherName: 'B',
      motherPhone: '08',
      guardian: 'C',
      scholarship2Id: 's2',
      uniqueHash: 'x',
    })
    expect(text).toContain('Nguồn 2')
    expect(text).toContain('Họ tên bố')
    expect(text).toContain('Học bổng 2')
    expect(text).not.toContain('source2')
    expect(text).not.toContain('fatherName')
    expect(text).not.toContain('uniqueHash')
  })
})
