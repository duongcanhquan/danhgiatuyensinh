import { describe, expect, it } from 'vitest'
import {
  ANALYTICS_FULL_SCOPE_MAX,
  DASHBOARD_FULL_SCOPE_MAX,
  LEADS_PAGE_SIZE,
  LEADS_UI_FULL_SCOPE_MAX,
} from './useLeads'

describe('lead scope read caps (P0 cost)', () => {
  it('keeps UI fullScope under a hard ceiling', () => {
    expect(LEADS_UI_FULL_SCOPE_MAX).toBeLessThanOrEqual(2000)
    expect(DASHBOARD_FULL_SCOPE_MAX).toBeLessThanOrEqual(LEADS_UI_FULL_SCOPE_MAX)
    expect(DASHBOARD_FULL_SCOPE_MAX).toBeGreaterThanOrEqual(LEADS_PAGE_SIZE)
    expect(ANALYTICS_FULL_SCOPE_MAX).toBeLessThanOrEqual(3000)
    expect(ANALYTICS_FULL_SCOPE_MAX).toBeGreaterThanOrEqual(LEADS_UI_FULL_SCOPE_MAX)
  })
})
