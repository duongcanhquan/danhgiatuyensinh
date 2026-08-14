import { describe, expect, it } from 'vitest'
import { APPLICANT_CATEGORIES_CATALOG_ID, DEFAULT_APPLICANT_CATEGORY_ENTRIES } from './applicantCategoryCatalog'
import { seedEntriesForMasterCatalog, shouldSeedEmptyMasterCatalog } from './masterCatalogSeed'

describe('masterCatalogSeed', () => {
  it('seeds applicant categories and leaves campuses empty', () => {
    const applicants = seedEntriesForMasterCatalog(APPLICANT_CATEGORIES_CATALOG_ID)
    expect(applicants).toHaveLength(DEFAULT_APPLICANT_CATEGORY_ENTRIES.length)
    expect(applicants.map((e) => e.label)).toContain('Học sinh lớp 12')
    expect(seedEntriesForMasterCatalog('campuses')).toEqual([])
    expect(seedEntriesForMasterCatalog('school_years')).toEqual([])
  })

  it('only forces seed for empty applicant catalog', () => {
    expect(shouldSeedEmptyMasterCatalog(APPLICANT_CATEGORIES_CATALOG_ID, 0)).toBe(true)
    expect(shouldSeedEmptyMasterCatalog(APPLICANT_CATEGORIES_CATALOG_ID, 2)).toBe(false)
    expect(shouldSeedEmptyMasterCatalog('campuses', 0)).toBe(false)
  })
})
