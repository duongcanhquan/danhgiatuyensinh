import { describe, expect, it } from 'vitest'
import { evaluateClientValidCall, foldOmicallCallsToKpiSummaries, resolveCallIsValid } from './kpiFromOmicallCalls'
import type { OmicallCallRecord } from '../types'
import { Timestamp } from 'firebase/firestore'

describe('resolveCallIsValid', () => {
  it('keeps true flag even under min bill', () => {
    expect(resolveCallIsValid({ isValidCall: true, billSeconds: 10 })).toBe(true)
  })

  it('overrides stale false when call meets current 30s rules (client cũ 45s)', () => {
    expect(
      resolveCallIsValid({
        isValidCall: false,
        billSeconds: 35,
        leadId: 'l',
        counselorUid: 'u',
        outcome: 'CONNECTED',
      }),
    ).toBe(true)
    expect(
      resolveCallIsValid({
        isValidCall: false,
        billSeconds: 20,
        leadId: 'l',
        counselorUid: 'u',
        outcome: 'CONNECTED',
      }),
    ).toBe(false)
  })

  it('re-evaluates when flag missing (CF wire cũ)', () => {
    expect(
      resolveCallIsValid({
        billSeconds: 60,
        leadId: 'l1',
        counselorUid: 'u1',
        outcome: 'CONNECTED',
      }),
    ).toBe(true)
    expect(
      resolveCallIsValid({
        billSeconds: 10,
        leadId: 'l1',
        counselorUid: 'u1',
        outcome: 'CONNECTED',
      }),
    ).toBe(false)
  })
})

describe('evaluateClientValidCall', () => {
  it('defaults to 30s min bill', () => {
    expect(
      evaluateClientValidCall({ billSeconds: 30, leadId: 'l', counselorUid: 'u', outcome: 'CONNECTED' })
        .isValidCall,
    ).toBe(true)
    expect(
      evaluateClientValidCall({ billSeconds: 29, leadId: 'l', counselorUid: 'u', outcome: 'CONNECTED' })
        .isValidCall,
    ).toBe(false)
  })
})

describe('foldOmicallCallsToKpiSummaries', () => {
  it('counts HL via resolve when isValidCall omitted', () => {
    const at = Timestamp.fromDate(new Date('2026-08-09T05:00:00.000Z'))
    const calls: OmicallCallRecord[] = [
      {
        id: 'c1',
        transactionId: 't1',
        direction: 'outbound',
        phoneNumber: '090',
        counselorUid: 'u1',
        leadId: 'lead1',
        answerSeconds: 60,
        billSeconds: 60,
        durationSeconds: 60,
        recordSeconds: 0,
        outcome: 'CONNECTED',
        endedAt: at,
      },
    ]
    const rows = foldOmicallCallsToKpiSummaries(calls, ['2026-08-09'])
    expect(rows[0]).toMatchObject({ totalCalls: 1, validCalls: 1, uniqueLeadsCalled: 1 })
  })
})
