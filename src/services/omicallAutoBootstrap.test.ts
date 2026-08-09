import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./omicallSyncMyExtension', () => ({
  syncOmicallMyExtension: vi.fn(),
}))

import { runOmicallCounselorBootstrap } from './omicallAutoBootstrap'
import { syncOmicallMyExtension } from './omicallSyncMyExtension'

describe('runOmicallCounselorBootstrap', () => {
  beforeEach(() => {
    vi.mocked(syncOmicallMyExtension).mockReset()
    try {
      sessionStorage.clear()
    } catch {
      /* ignore */
    }
  })

  it('skips sync when SIP user and password are already complete', async () => {
    const msg = await runOmicallCounselorBootstrap({
      configEnabled: true,
      hasCompleteSipCreds: true,
    })
    expect(msg).toBeNull()
    expect(syncOmicallMyExtension).not.toHaveBeenCalled()
  })

  it('syncs when sipUser exists but password is still missing', async () => {
    vi.mocked(syncOmicallMyExtension).mockResolvedValue({
      ok: true,
      updated: true,
      sipUser: '201',
      message: 'Đã gán số nội bộ 201 từ OMICall.',
    })
    const msg = await runOmicallCounselorBootstrap({
      configEnabled: true,
      hasCompleteSipCreds: false,
    })
    expect(syncOmicallMyExtension).toHaveBeenCalledTimes(1)
    expect(msg).toMatch(/201/)
  })
})
