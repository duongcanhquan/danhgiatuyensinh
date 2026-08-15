import { describe, expect, it } from 'vitest'
import type { Lead } from '../types'
import {
  buildLeadCoreFirestorePatch,
  isCoreDraftDirty,
  leadCorePatchHasUserChanges,
  leadToCoreDraft,
} from './leadProfileEdit'

function leadStub(partial: Partial<Lead> = {}): Lead {
  return {
    id: 'L1',
    fullName: 'Nguyen Van A',
    phone: '0901234567',
    status: 'new',
    priorityTag: 'COLD',
    calculatedScore: 0,
    pipelineStatus: 'NEW',
    uniqueHash: 'hash1',
    uploadedAt: {} as Lead['uploadedAt'],
    updatedAt: {} as Lead['updatedAt'],
    createdAt: {} as Lead['createdAt'],
    ...partial,
  } as Lead
}

describe('isCoreDraftDirty empty-field parity', () => {
  it('is not dirty when optional fields are missing on lead but empty in draft', () => {
    const lead = leadStub({
      fullName: 'Nguyen Van A',
      phone: '0901234567',
      // no fatherName / source2 / etc.
    })
    const draft = leadToCoreDraft(lead)
    expect(isCoreDraftDirty(lead, draft)).toBe(false)
    expect(leadCorePatchHasUserChanges(buildLeadCoreFirestorePatch(lead, draft))).toBe(false)
  })

  it('is not dirty when address is only on address (not permanentAddress)', () => {
    const lead = leadStub({
      address: '12 Nguyen Trai',
      // permanentAddress missing — form maps address → permanentAddress
    })
    const draft = leadToCoreDraft(lead)
    expect(isCoreDraftDirty(lead, draft)).toBe(false)
    expect(buildLeadCoreFirestorePatch(lead, draft)).toEqual({})
  })

  it('is not dirty when phone is unformatted on lead but form formats it', () => {
    const lead = leadStub({ phone: '901234567' })
    const draft = leadToCoreDraft(lead)
    expect(isCoreDraftDirty(lead, draft)).toBe(false)
  })

  it('is dirty when user edits a real field', () => {
    const lead = leadStub()
    const draft = leadToCoreDraft(lead)
    draft.fatherName = 'Nguyen Van B'
    expect(isCoreDraftDirty(lead, draft)).toBe(true)
    const patch = buildLeadCoreFirestorePatch(lead, draft)
    expect(patch.fatherName).toBe('Nguyen Van B')
    expect(Object.keys(patch).filter((k) => k !== 'uniqueHash' && k !== 'nationalIdHash')).toEqual([
      'fatherName',
    ])
  })
})
