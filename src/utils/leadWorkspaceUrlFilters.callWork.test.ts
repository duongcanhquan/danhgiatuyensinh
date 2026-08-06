import { describe, expect, it } from 'vitest'
import {
  LWF,
  parseCallWorkBucketFromUrl,
  parseDispositionFromUrl,
  leadFilterSignatureForHydrate,
} from './leadWorkspaceUrlFilters'

describe('leadWorkspaceUrlFilters call work', () => {
  it('parses cq bucket from URL', () => {
    expect(parseCallWorkBucketFromUrl(null)).toBe('all')
    expect(parseCallWorkBucketFromUrl('')).toBe('all')
    expect(parseCallWorkBucketFromUrl('uncalled')).toBe('uncalled')
    expect(parseCallWorkBucketFromUrl('CALLBACK')).toBe('callback')
    expect(parseCallWorkBucketFromUrl('nope')).toBe('all')
  })

  it('parses disposition raw string', () => {
    expect(parseDispositionFromUrl(null)).toBe('')
    expect(parseDispositionFromUrl('knm')).toBe('knm')
  })

  it('includes cq/disp in hydrate signature', () => {
    const sp = new URLSearchParams()
    sp.set(LWF.CQ, 'callback')
    sp.set(LWF.DISP, 'knm')
    const sig = leadFilterSignatureForHydrate(sp)
    expect(sig).toContain('cq=callback')
    expect(sig).toContain('disp=knm')
  })
})
