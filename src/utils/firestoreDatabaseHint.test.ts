import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CRM_FIRESTORE_DATABASE_ID,
  resolveFirestoreDatabaseIdForCrm,
} from './firestoreDatabaseHint'

describe('resolveFirestoreDatabaseIdForCrm', () => {
  it('defaults to warmlist when env empty', () => {
    expect(resolveFirestoreDatabaseIdForCrm(undefined)).toBe(DEFAULT_CRM_FIRESTORE_DATABASE_ID)
    expect(resolveFirestoreDatabaseIdForCrm('')).toBe('warmlist')
    expect(resolveFirestoreDatabaseIdForCrm('  ')).toBe('warmlist')
  })

  it('honors explicit warmlist or other named db', () => {
    expect(resolveFirestoreDatabaseIdForCrm('warmlist')).toBe('warmlist')
    expect(resolveFirestoreDatabaseIdForCrm(' otherdb ')).toBe('otherdb')
  })

  it('allows explicit (default) to mean Firebase default', () => {
    expect(resolveFirestoreDatabaseIdForCrm('(default)')).toBeUndefined()
  })
})
