import { describe, expect, it } from 'vitest'
import { buildTeamRosterSummary, type TeamRosterCallEvent, type TeamRosterLeadInput } from './teamRosterSummary'

/** 2026-08-09 12:00 ICT */
const NOW = new Date('2026-08-09T05:00:00.000Z')

function lead(
  partial: Partial<TeamRosterLeadInput> & Pick<TeamRosterLeadInput, 'id' | 'assigneeUid'>,
): TeamRosterLeadInput {
  return {
    callWorkBucket: null,
    lastCallDispositionId: null,
    lastCallAtMs: null,
    ...partial,
  }
}

describe('buildTeamRosterSummary', () => {
  it('counts held leads, called, HOT success, and non-HOT unsuccessful per counselor', () => {
    const leads: TeamRosterLeadInput[] = [
      lead({ id: 'a', assigneeUid: 'tvv1', callWorkBucket: 'uncalled' }),
      lead({ id: 'b', assigneeUid: 'tvv1', callWorkBucket: 'called', lastCallDispositionId: 'college_hot' }),
      lead({
        id: 'c',
        assigneeUid: 'tvv1',
        callWorkBucket: 'called',
        lastCallDispositionId: 'not_interested',
      }),
      lead({ id: 'd', assigneeUid: 'tvv1', callWorkBucket: 'callback', lastCallDispositionId: 'knm' }),
      lead({ id: 'e', assigneeUid: 'tvv2', callWorkBucket: 'called', lastCallDispositionId: 'college_hot' }),
      lead({ id: 'orphan', assigneeUid: null, callWorkBucket: 'called', lastCallDispositionId: 'college_hot' }),
    ]

    const rows = buildTeamRosterSummary({
      members: [
        { counselorUid: 'tvv1', displayName: 'An' },
        { counselorUid: 'tvv2', displayName: 'Bình' },
      ],
      leads,
      callEvents: [],
      now: NOW,
    })

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      counselorUid: 'tvv1',
      displayName: 'An',
      totalLeads: 4,
      calledLeads: 3,
      successLeads: 1,
      unsuccessfulLeads: 2,
    })
    expect(rows[1]).toMatchObject({
      counselorUid: 'tvv2',
      totalLeads: 1,
      calledLeads: 1,
      successLeads: 1,
      unsuccessfulLeads: 0,
    })
  })

  it('computes day / week / month call rates from call events on held leads', () => {
    const leads: TeamRosterLeadInput[] = [
      lead({ id: 'l1', assigneeUid: 'tvv1', callWorkBucket: 'called', lastCallDispositionId: 'knm' }),
      lead({ id: 'l2', assigneeUid: 'tvv1', callWorkBucket: 'called', lastCallDispositionId: 'knm' }),
      lead({ id: 'l3', assigneeUid: 'tvv1', callWorkBucket: 'uncalled' }),
      lead({ id: 'l4', assigneeUid: 'tvv1', callWorkBucket: 'uncalled' }),
    ]

    // ICT dates: today 2026-08-09, week includes 2026-08-03..09, month Aug 1..9
    const callEvents: TeamRosterCallEvent[] = [
      { leadId: 'l1', atMs: Date.parse('2026-08-09T03:00:00.000Z') }, // today
      { leadId: 'l2', atMs: Date.parse('2026-08-05T03:00:00.000Z') }, // this week, not today
      { leadId: 'l3', atMs: Date.parse('2026-07-20T03:00:00.000Z') }, // previous month — ignore for Aug rates
    ]

    const [row] = buildTeamRosterSummary({
      members: [{ counselorUid: 'tvv1', displayName: 'An' }],
      leads,
      callEvents,
      now: NOW,
    })

    expect(row.calledInDay).toBe(1)
    expect(row.calledInWeek).toBe(2)
    expect(row.calledInMonth).toBe(2)
    expect(row.callRateDay).toBeCloseTo(0.25)
    expect(row.callRateWeek).toBeCloseTo(0.5)
    expect(row.callRateMonth).toBeCloseTo(0.5)
  })

  it('falls back to lastCallAtMs when no call event for that lead', () => {
    const leads: TeamRosterLeadInput[] = [
      lead({
        id: 'l1',
        assigneeUid: 'tvv1',
        callWorkBucket: 'called',
        lastCallAtMs: Date.parse('2026-08-09T04:00:00.000Z'),
      }),
      lead({ id: 'l2', assigneeUid: 'tvv1', callWorkBucket: 'uncalled' }),
    ]

    const [row] = buildTeamRosterSummary({
      members: [{ counselorUid: 'tvv1', displayName: 'An' }],
      leads,
      callEvents: [],
      now: NOW,
    })

    expect(row.calledInDay).toBe(1)
    expect(row.callRateDay).toBeCloseTo(0.5)
  })

  it('returns zero rates when counselor has no leads', () => {
    const [row] = buildTeamRosterSummary({
      members: [{ counselorUid: 'tvv1', displayName: 'An' }],
      leads: [],
      callEvents: [],
      now: NOW,
    })
    expect(row).toMatchObject({
      totalLeads: 0,
      calledLeads: 0,
      callRateDay: 0,
      callRateWeek: 0,
      callRateMonth: 0,
    })
  })
})
