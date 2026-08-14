import { describe, expect, it } from 'vitest'
import { DEFAULT_MASTER_CATALOGS } from '../types'
import { APPLICANT_CATEGORIES_CATALOG_ID } from './applicantCategoryCatalog'
import { seedEntriesForMasterCatalog } from './masterCatalogSeed'

describe('default master catalogs (unified)', () => {
  it('includes applicant_categories + campuses + school_years without duplicate ids', () => {
    const ids = DEFAULT_MASTER_CATALOGS.map((c) => c.id)
    expect(ids).toContain(APPLICANT_CATEGORIES_CATALOG_ID)
    expect(ids).toContain('campuses')
    expect(ids).toContain('school_years')
    expect(ids).toContain('training_programs')
    expect(ids).toContain('majors')
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('seed helper covers every default catalog id', () => {
    for (const c of DEFAULT_MASTER_CATALOGS) {
      expect(() => seedEntriesForMasterCatalog(c.id)).not.toThrow()
    }
  })
})
