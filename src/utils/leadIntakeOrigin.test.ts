import { describe, expect, it } from 'vitest'
import {
  leadIntakeOriginToUrlParam,
  leadMatchesIntakeOrigin,
  leadMatchesIntakeOriginTab,
  parseLeadIntakeOrigin,
  parseLeadIntakeOriginFromUrl,
  resolveLeadIntakeOrigin,
  LEAD_INTAKE_ORIGIN_TABS,
} from './leadIntakeOrigin'

describe('parseLeadIntakeOrigin', () => {
  it('accepts known origins', () => {
    expect(parseLeadIntakeOrigin('campaign_upload')).toBe('campaign_upload')
    expect(parseLeadIntakeOrigin('manual')).toBe('manual')
    expect(parseLeadIntakeOrigin('public_portal')).toBe('public_portal')
  })

  it('rejects unknown', () => {
    expect(parseLeadIntakeOrigin('')).toBeUndefined()
    expect(parseLeadIntakeOrigin('portal')).toBeUndefined()
  })
})

describe('parseLeadIntakeOriginFromUrl', () => {
  it('defaults to campaign', () => {
    expect(parseLeadIntakeOriginFromUrl(null)).toBe('campaign_upload')
    expect(parseLeadIntakeOriginFromUrl('')).toBe('campaign_upload')
    expect(parseLeadIntakeOriginFromUrl('bogus')).toBe('campaign_upload')
  })

  it('maps short codes; bookmark manual → portal tab', () => {
    expect(parseLeadIntakeOriginFromUrl('campaign')).toBe('campaign_upload')
    expect(parseLeadIntakeOriginFromUrl('manual')).toBe('public_portal')
    expect(parseLeadIntakeOriginFromUrl('portal')).toBe('public_portal')
  })
})

describe('LEAD_INTAKE_ORIGIN_TABS', () => {
  it('has campaign and portal only', () => {
    expect([...LEAD_INTAKE_ORIGIN_TABS]).toEqual(['campaign_upload', 'public_portal'])
  })
})

describe('leadMatchesIntakeOriginTab', () => {
  it('portal tab includes manual and public_portal', () => {
    expect(leadMatchesIntakeOriginTab({ intakeOrigin: 'manual' }, 'public_portal')).toBe(true)
    expect(leadMatchesIntakeOriginTab({ uploadedBy: 'public_portal' }, 'public_portal')).toBe(true)
    expect(leadMatchesIntakeOriginTab({ uploadBatchId: 'manual-abc-1' }, 'public_portal')).toBe(true)
    expect(leadMatchesIntakeOriginTab({}, 'public_portal')).toBe(false)
    expect(leadMatchesIntakeOriginTab({ uploadedBy: 'public_portal' }, 'campaign_upload')).toBe(false)
    expect(leadMatchesIntakeOriginTab({}, 'campaign_upload')).toBe(true)
  })
})

describe('leadIntakeOriginToUrlParam', () => {
  it('uses short codes', () => {
    expect(leadIntakeOriginToUrlParam('campaign_upload')).toBe('campaign')
    expect(leadIntakeOriginToUrlParam('manual')).toBe('manual')
    expect(leadIntakeOriginToUrlParam('public_portal')).toBe('portal')
  })
})

describe('resolveLeadIntakeOrigin', () => {
  it('prefers stored field', () => {
    expect(
      resolveLeadIntakeOrigin({
        intakeOrigin: 'manual',
        uploadedBy: 'public_portal',
      }),
    ).toBe('manual')
  })

  it('detects portal legacy', () => {
    expect(resolveLeadIntakeOrigin({ uploadedBy: 'public_portal' })).toBe('public_portal')
    expect(resolveLeadIntakeOrigin({ registrationChannel: 'public_portal' })).toBe('public_portal')
    expect(resolveLeadIntakeOrigin({ uploadBatchId: 'public-123' })).toBe('public_portal')
  })

  it('detects manual legacy by batch prefix', () => {
    expect(resolveLeadIntakeOrigin({ uploadBatchId: 'manual-abc-1' })).toBe('manual')
  })

  it('defaults remaining to campaign', () => {
    expect(resolveLeadIntakeOrigin({})).toBe('campaign_upload')
    expect(resolveLeadIntakeOrigin({ uploadBatchId: crypto.randomUUID() })).toBe('campaign_upload')
  })
})

describe('leadMatchesIntakeOrigin', () => {
  it('matches resolved origin', () => {
    expect(leadMatchesIntakeOrigin({ uploadedBy: 'public_portal' }, 'public_portal')).toBe(true)
    expect(leadMatchesIntakeOrigin({ uploadedBy: 'public_portal' }, 'manual')).toBe(false)
  })
})
