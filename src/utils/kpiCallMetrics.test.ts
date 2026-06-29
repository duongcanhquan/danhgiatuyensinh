import { describe, expect, it } from 'vitest'
import { classifyConnectedCallDuration, isLeadChamCall } from './kpiCallMetrics'

describe('kpiCallMetrics', () => {
  it('lead chạm: 1–29s connected', () => {
    expect(isLeadChamCall(true, 15)).toBe(true)
    expect(isLeadChamCall(true, 29)).toBe(true)
    expect(isLeadChamCall(true, 30)).toBe(false)
    expect(isLeadChamCall(true, 0)).toBe(false)
    expect(isLeadChamCall(false, 20)).toBe(false)
  })

  it('answered valid from 30s', () => {
    expect(classifyConnectedCallDuration(30, {})).toBe('answered_valid')
    expect(classifyConnectedCallDuration(10, {})).toBe('lead_cham')
  })
})
