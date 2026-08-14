import { describe, expect, it } from 'vitest'
import {
  applicantCategoryLabels,
  applicantCategoryOptionsFromEntries,
  DEFAULT_APPLICANT_CATEGORY_ENTRIES,
} from './applicantCategoryCatalog'

describe('applicantCategoryCatalog', () => {
  it('falls back to default seed when catalog empty', () => {
    const opts = applicantCategoryOptionsFromEntries([])
    expect(opts.length).toBe(DEFAULT_APPLICANT_CATEGORY_ENTRIES.length)
    expect(opts.map((o) => o.value)).toContain('Học sinh lớp 12')
    expect(opts.find((o) => o.value === 'Học sinh lớp 12')?.labelEn).toMatch(/Grade 12/i)
  })

  it('uses admin entries when present (label = stored value)', () => {
    const opts = applicantCategoryOptionsFromEntries([
      {
        id: 'custom',
        label: 'Ứng viên nước ngoài',
        labelEn: 'International applicant',
        synonyms: ['Ứng viên quốc tế'],
        isActive: true,
      },
    ])
    expect(opts).toHaveLength(1)
    expect(opts[0]!.value).toBe('Ứng viên nước ngoài')
    expect(opts[0]!.labelVn).toBe('Ứng viên quốc tế')
    expect(opts[0]!.labelEn).toBe('International applicant')
    expect(applicantCategoryLabels([{ id: 'x', label: 'A', isActive: true }])).toEqual(['A'])
  })

  it('skips inactive entries', () => {
    const opts = applicantCategoryOptionsFromEntries([
      { id: 'a', label: 'Active', isActive: true },
      { id: 'b', label: 'Off', isActive: false },
    ])
    expect(opts.map((o) => o.value)).toEqual(['Active'])
  })
})
