import { describe, expect, it } from 'vitest'
import { DEFAULT_MASTER_CATALOGS } from '../types'
import { APPLICANT_CATEGORIES_CATALOG_ID } from './applicantCategoryCatalog'

describe('default master catalogs (agent parity)', () => {
  it('includes applicant_categories + campuses + school_years without duplicate ids', () => {
    const ids = DEFAULT_MASTER_CATALOGS.map((c) => c.id)
    expect(ids).toContain(APPLICANT_CATEGORIES_CATALOG_ID)
    expect(ids).toContain('campuses')
    expect(ids).toContain('school_years')
    expect(ids).toContain('training_programs')
    expect(ids).toContain('majors')
    expect(new Set(ids).size).toBe(ids.length)
  })
})
