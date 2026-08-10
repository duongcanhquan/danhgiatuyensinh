import { describe, expect, it } from 'vitest'
import { resolveKpiDailyTargetUids } from './resolveKpiDailyTargetUids'

describe('resolveKpiDailyTargetUids', () => {
  it('self scope returns only self', () => {
    expect(
      resolveKpiDailyTargetUids({
        canGlobal: false,
        canTeam: false,
        selfUid: 'u1',
        directoryIds: ['u1', 'u2'],
        counselorUidFilter: undefined,
      }),
    ).toEqual(['u1'])
  })

  it('team scope includes roster and self even if self missing from roster', () => {
    expect(
      resolveKpiDailyTargetUids({
        canGlobal: false,
        canTeam: true,
        selfUid: 'tl',
        directoryIds: ['a', 'b'],
        counselorUidFilter: undefined,
      }),
    ).toEqual(['a', 'b', 'tl'])
  })

  it('team scope dedupes self already in roster', () => {
    expect(
      resolveKpiDailyTargetUids({
        canGlobal: false,
        canTeam: true,
        selfUid: 'tl',
        directoryIds: ['a', 'tl'],
        counselorUidFilter: undefined,
      }),
    ).toEqual(['a', 'tl'])
  })

  it('filter wins', () => {
    expect(
      resolveKpiDailyTargetUids({
        canGlobal: true,
        canTeam: true,
        selfUid: 'u1',
        directoryIds: ['a', 'b'],
        counselorUidFilter: 'b',
      }),
    ).toEqual(['b'])
  })

  it('global always full scan even with directory', () => {
    expect(
      resolveKpiDailyTargetUids({
        canGlobal: true,
        canTeam: false,
        selfUid: 'u1',
        directoryIds: ['a', 'b'],
        counselorUidFilter: undefined,
      }),
    ).toBeNull()
  })

  it('global without directory still full scan', () => {
    expect(
      resolveKpiDailyTargetUids({
        canGlobal: true,
        canTeam: false,
        selfUid: 'u1',
        directoryIds: [],
        counselorUidFilter: undefined,
      }),
    ).toBeNull()
  })
})
