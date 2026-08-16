import { describe, expect, it } from 'vitest'
import type { Lead } from '../types'
import {
  buildOpsPersonRows,
  buildOpsSourceRows,
  resolveOpsDateRange,
  sumOpsStatusCounts,
} from './opsMonitorSummary'

function ts(ms: number) {
  return { toMillis: () => ms }
}

function lead(partial: Partial<Lead> & Pick<Lead, 'id'>): Lead {
  return {
    fullName: 'A',
    phone: '1',
    status: 'NEW',
    assignedTo: 'c1',
    ...partial,
  } as Lead
}

describe('resolveOpsDateRange', () => {
  it('swaps custom range when from > to', () => {
    expect(resolveOpsDateRange('custom', '2026-08-10', '2026-08-01')).toEqual({
      fromKey: '2026-08-01',
      toKey: '2026-08-10',
    })
  })
})

describe('buildOpsPersonRows', () => {
  it('counts deposit / enrolled / open by assignee in range (ngày tải lên)', () => {
    const dayMs = Date.parse('2026-08-10T05:00:00+07:00')
    const members = [
      { counselorUid: 'c1', displayName: 'An' },
      { counselorUid: 'c2', displayName: 'Bình' },
    ]
    const leads = [
      lead({ id: '1', assignedTo: 'c1', status: 'DEPOSIT_PAID', uploadedAt: ts(dayMs) as Lead['uploadedAt'] }),
      lead({ id: '2', assignedTo: 'c1', status: 'ENROLLED', uploadedAt: ts(dayMs) as Lead['uploadedAt'] }),
      lead({ id: '3', assignedTo: 'c1', status: 'INTERESTED', uploadedAt: ts(dayMs) as Lead['uploadedAt'] }),
      lead({ id: '4', assignedTo: 'c2', status: 'NEW', uploadedAt: ts(dayMs) as Lead['uploadedAt'] }),
      lead({
        id: '5',
        assignedTo: 'c1',
        status: 'NEW',
        uploadedAt: ts(Date.parse('2026-07-01T05:00:00+07:00')) as Lead['uploadedAt'],
      }),
    ]
    const rows = buildOpsPersonRows({
      members,
      leads,
      fromKey: '2026-08-10',
      toKey: '2026-08-10',
    })
    expect(rows).toHaveLength(2)
    const an = rows.find((r) => r.counselorUid === 'c1')!
    expect(an.total).toBe(3)
    expect(an.deposit).toBe(1)
    expect(an.enrolled).toBe(1)
    expect(an.open).toBe(1)
    expect(sumOpsStatusCounts(rows).total).toBe(4)
  })

  it('filters by counselor and source', () => {
    const dayMs = Date.parse('2026-08-10T05:00:00+07:00')
    const members = [
      { counselorUid: 'c1', displayName: 'An' },
      { counselorUid: 'c2', displayName: 'Bình' },
    ]
    const leads = [
      lead({
        id: '1',
        assignedTo: 'c1',
        status: 'NEW',
        source1: 'Facebook',
        uploadedAt: ts(dayMs) as Lead['uploadedAt'],
      }),
      lead({
        id: '2',
        assignedTo: 'c2',
        status: 'NEW',
        source1: 'Hotline',
        uploadedAt: ts(dayMs) as Lead['uploadedAt'],
      }),
    ]
    const rows = buildOpsPersonRows({
      members,
      leads,
      fromKey: '2026-08-10',
      toKey: '2026-08-10',
      counselorUidFilter: 'c2',
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.counselorUid).toBe('c2')

    const sources = buildOpsSourceRows({
      members,
      leads,
      fromKey: '2026-08-10',
      toKey: '2026-08-10',
      sourceFilter: 'Facebook',
    })
    expect(sources).toHaveLength(1)
    expect(sources[0]!.source).toBe('Facebook')
    expect(sources[0]!.total).toBe(1)
  })
})
