import { describe, expect, it } from 'vitest'
import { decideAuthNullEvent, shouldSoftRefreshAuthSession } from './authSessionStability'

describe('decideAuthNullEvent', () => {
  it('ignores null when currentUser still present', () => {
    expect(
      decideAuthNullEvent({ hadSession: true, authReady: true, currentUserPresent: true }),
    ).toEqual({ action: 'ignore' })
  })

  it('uses grace while auth not ready', () => {
    expect(
      decideAuthNullEvent({ hadSession: false, authReady: false, currentUserPresent: false }),
    ).toEqual({ action: 'grace', ms: 600 })
  })

  it('uses longer grace after an existing session', () => {
    expect(
      decideAuthNullEvent({ hadSession: true, authReady: true, currentUserPresent: false }),
    ).toEqual({ action: 'grace', ms: 1200 })
  })

  it('logs out immediately when never had session and auth ready', () => {
    expect(
      decideAuthNullEvent({ hadSession: false, authReady: true, currentUserPresent: false }),
    ).toEqual({ action: 'logout_now' })
  })
})

describe('shouldSoftRefreshAuthSession', () => {
  it('soft-refreshes same authenticated uid with profile', () => {
    expect(
      shouldSoftRefreshAuthSession({
        incomingUid: 'u1',
        currentUid: 'u1',
        status: 'authenticated',
        hasProfile: true,
      }),
    ).toBe(true)
  })

  it('full pipeline for new uid or no profile', () => {
    expect(
      shouldSoftRefreshAuthSession({
        incomingUid: 'u2',
        currentUid: 'u1',
        status: 'authenticated',
        hasProfile: true,
      }),
    ).toBe(false)
    expect(
      shouldSoftRefreshAuthSession({
        incomingUid: 'u1',
        currentUid: 'u1',
        status: 'authenticated',
        hasProfile: false,
      }),
    ).toBe(false)
  })
})
