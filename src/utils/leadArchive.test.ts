import { describe, expect, it } from 'vitest'
import {
  archiveScopeLabel,
  assertArchiveScope,
  ictYearBounds,
  isArchivedLeadRecord,
  isLeadOperational,
  leadMatchesArchiveScope,
  leadRecordMillis,
  resolveArchiveUploadedRange,
  stripArchiveMetadata,
} from './leadArchive'

describe('leadArchive', () => {
  it('treats missing lifecycle as operational', () => {
    expect(isArchivedLeadRecord({})).toBe(false)
    expect(isLeadOperational({})).toBe(true)
    expect(isArchivedLeadRecord({ lifecycle: 'archived' })).toBe(true)
    expect(isLeadOperational({ lifecycle: 'archived' })).toBe(false)
  })

  it('refuses to archive the entire live collection', () => {
    expect(assertArchiveScope({})).toMatch(/Không cất cả kho/)
    expect(assertArchiveScope({ year: 2024 })).toBeNull()
    expect(assertArchiveScope({ ids: ['abc'] })).toBeNull()
    expect(assertArchiveScope({ intakeProgram: 'Đợt 1' })).toBeNull()
  })

  it('labels mass-archive groups', () => {
    expect(archiveScopeLabel({ year: 2025, intakeProgram: 'CĐ 2025' })).toBe('Năm 2025 · Đợt CĐ 2025')
  })

  it('uses ICT calendar year bounds', () => {
    const { start, endExclusive } = ictYearBounds(2024)
    expect(start.toISOString()).toBe(new Date('2024-01-01T00:00:00.000+07:00').toISOString())
    expect(endExclusive.toISOString()).toBe(new Date('2025-01-01T00:00:00.000+07:00').toISOString())
  })

  it('intersects year with uploaded date range', () => {
    const range = resolveArchiveUploadedRange({
      year: 2024,
      uploadedFrom: '2024-06-01',
      uploadedTo: '2024-06-30',
    })
    expect(range).not.toBeNull()
    expect(range!.start.toISOString()).toBe(new Date('2024-06-01T00:00:00.000+07:00').toISOString())
    expect(range!.endExclusive.toISOString()).toBe(new Date('2024-07-01T00:00:00.000+07:00').toISOString())
  })

  it('strips archive metadata on restore', () => {
    const out = stripArchiveMetadata({
      fullName: 'A',
      lifecycle: 'archived',
      archivedAt: 'x',
      archiveLabel: 'Năm 2024',
    })
    expect(out.fullName).toBe('A')
    expect(out.lifecycle).toBeUndefined()
    expect(out.archiveLabel).toBeUndefined()
  })

  it('prefers uploadedAt then importedAt then createdAt', () => {
    expect(
      leadRecordMillis({
        uploadedAt: '2024-06-01T00:00:00.000+07:00',
        createdAt: '2020-01-01T00:00:00.000+07:00',
      }),
    ).toBe(Date.parse('2024-06-01T00:00:00.000+07:00'))
    expect(leadRecordMillis({ createdAt: { seconds: 1_704_067_200 } })).toBe(1_704_067_200 * 1000)
  })

  it('matches year via createdAt and skips other orgs', () => {
    expect(
      leadMatchesArchiveScope({ orgId: 'vietmy', createdAt: '2024-03-01T00:00:00.000+07:00' }, 'vietmy', {
        year: 2024,
      }),
    ).toBe(true)
    expect(
      leadMatchesArchiveScope({ orgId: 'other', createdAt: '2024-03-01T00:00:00.000+07:00' }, 'vietmy', {
        year: 2024,
      }),
    ).toBe(false)
    expect(
      leadMatchesArchiveScope({ createdAt: '2024-03-01T00:00:00.000+07:00' }, 'vietmy', { year: 2024 }),
    ).toBe(true)
    expect(
      leadMatchesArchiveScope({ createdAt: '2024-03-01T00:00:00.000+07:00' }, 'other-school', { year: 2024 }),
    ).toBe(false)
    expect(
      leadMatchesArchiveScope({ orgId: 'vietmy', lifecycle: 'archived', createdAt: '2024-03-01T00:00:00.000+07:00' }, 'vietmy', {
        year: 2024,
      }),
    ).toBe(false)
  })
})
