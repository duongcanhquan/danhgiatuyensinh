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

  it('team scope uses directory roster', () => {
    expect(
      resolveKpiDailyTargetUids({
        canGlobal: false,
        canTeam: true,
        selfUid: 'tl',
        directoryIds: ['a', 'b', 'tl'],
        counselorUidFilter: undefined,
      }),
    ).toEqual(['a', 'b', 'tl'])
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

  it('global without directory falls back to null (full scan)', () => {
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

  it('global with directory uses those ids', () => {
    expect(
      resolveKpiDailyTargetUids({
        canGlobal: true,
        canTeam: false,
        selfUid: 'u1',
        directoryIds: ['a', 'b'],
        counselorUidFilter: undefined,
      }),
    ).toEqual(['a', 'b'])
  })
})
