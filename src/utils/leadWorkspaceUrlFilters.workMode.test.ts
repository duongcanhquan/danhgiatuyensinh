import { describe, expect, it } from 'vitest'
import {
  LWF,
  leadFilterSignatureForHydrate,
  parseWorkModeFromUrl,
  stripListFiltersKeepOpenView,
  urlHasLeadListFilters,
} from './leadWorkspaceUrlFilters'

describe('leadWorkspaceUrlFilters work mode', () => {
  it('exposes wm URL key', () => {
    expect(LWF.WM).toBe('wm')
  })

  it('parses work mode from URL via parseWorkModeFromUrl', () => {
    expect(parseWorkModeFromUrl(null)).toBe('all')
    expect(parseWorkModeFromUrl('')).toBe('all')
    expect(parseWorkModeFromUrl('bogus')).toBe('all')
    expect(parseWorkModeFromUrl('score_queue')).toBe('score_queue')
    expect(parseWorkModeFromUrl('volume_filter')).toBe('volume_filter')
    expect(parseWorkModeFromUrl('care_close')).toBe('care_close')
  })

  it('includes wm in hydrate signature when set', () => {
    const sp = new URLSearchParams()
    sp.set(LWF.WM, 'volume_filter')
    const sig = leadFilterSignatureForHydrate(sp)
    expect(sig).toContain('wm=volume_filter')
  })

  it('includes empty wm slot in hydrate signature when unset', () => {
    const sig = leadFilterSignatureForHydrate(new URLSearchParams())
    expect(sig).toContain('wm=')
  })

  it('detects wm as a list filter on URL', () => {
    expect(urlHasLeadListFilters(new URLSearchParams('wm=care_close'))).toBe(true)
    expect(urlHasLeadListFilters(new URLSearchParams('q=an&wm=score_queue'))).toBe(true)
  })

  it('includes origin in hydrate signature', () => {
    const sp = new URLSearchParams()
    sp.set(LWF.ORIGIN, 'portal')
    expect(leadFilterSignatureForHydrate(sp)).toContain('origin=portal')
  })

  it('preserves origin tab when stripping list filters', () => {
    const sp = new URLSearchParams('origin=portal&wm=care_close&tag=HOT&open=abc')
    const next = stripListFiltersKeepOpenView(sp)
    expect(next.get(LWF.ORIGIN)).toBe('portal')
    expect(next.get('open')).toBe('abc')
    expect(next.get(LWF.WM)).toBeNull()
    expect(next.get(LWF.TAG)).toBeNull()
  })
})
