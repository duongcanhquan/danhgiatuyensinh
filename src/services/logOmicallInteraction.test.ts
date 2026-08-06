import { beforeEach, describe, expect, it, vi } from 'vitest'

const getDocs = vi.fn()
const addDoc = vi.fn()
const updateDoc = vi.fn()
const commitAuditLog = vi.fn()

vi.mock('firebase/firestore', () => {
  class FakeTs {
    ms: number
    constructor(ms = 1_700_000_000_000) {
      this.ms = ms
    }
    toMillis() {
      return this.ms
    }
    static now() {
      return new FakeTs()
    }
  }
  return {
    Timestamp: FakeTs,
    collection: vi.fn((_db: unknown, ...parts: string[]) => ({ path: parts.join('/') })),
    doc: vi.fn((_db: unknown, ...parts: string[]) => ({ path: parts.join('/') })),
    query: vi.fn((...args: unknown[]) => args),
    where: vi.fn((...args: unknown[]) => args),
    limit: vi.fn((n: number) => n),
    getDocs: (...a: unknown[]) => getDocs(...a),
    addDoc: (...a: unknown[]) => addDoc(...a),
    updateDoc: (...a: unknown[]) => updateDoc(...a),
  }
})

vi.mock('./auditLog', () => ({
  commitAuditLog: (...a: unknown[]) => commitAuditLog(...a),
}))

import { logOmicallInteraction } from './logOmicallInteraction'

const profile = {
  id: 'u1',
  role: 'counselor' as const,
  displayName: 'TVV A',
  omicallSipUser: 'sip101',
}

function callPayload(overrides: Record<string, unknown> = {}) {
  return {
    uid: 'call-1',
    state: 'ended' as const,
    direction: 'outbound' as const,
    remoteNumber: '090',
    displayNumber: '090',
    callingDuration: { value: 12, text: '12s' },
    userData: JSON.stringify({
      leadId: 'lead-1',
      phone: '090',
      target: 'student',
      counselorUid: 'u1',
    }),
    ...overrides,
  }
}

describe('logOmicallInteraction', () => {
  beforeEach(() => {
    getDocs.mockReset()
    addDoc.mockReset()
    updateDoc.mockReset()
    commitAuditLog.mockReset()
    addDoc.mockResolvedValue({ id: 'ix1' })
    updateDoc.mockResolvedValue(undefined)
    commitAuditLog.mockResolvedValue(undefined)
  })

  it('writes interaction + lastCall patch on first log', async () => {
    getDocs.mockResolvedValue({ empty: true, docs: [] })
    const result = await logOmicallInteraction({} as never, callPayload(), profile)
    expect(result).toEqual({ leadId: 'lead-1' })
    expect(addDoc).toHaveBeenCalledTimes(1)
    expect(updateDoc).toHaveBeenCalledTimes(1)
    const patch = updateDoc.mock.calls[0]![1] as Record<string, unknown>
    expect(patch.lastCalledByLabel).toBe('sip101')
    expect(patch.lastCallOutcome).toBe('CONNECTED')
    expect(patch.lastCallAt).toBeTruthy()
  })

  it('still patches lastCall when providerCallId already exists', async () => {
    getDocs.mockResolvedValue({ empty: false, docs: [{ id: 'existing' }] })
    const result = await logOmicallInteraction({} as never, callPayload(), profile)
    expect(result).toEqual({ leadId: 'lead-1' })
    expect(addDoc).not.toHaveBeenCalled()
    expect(updateDoc).toHaveBeenCalledTimes(1)
    const patch = updateDoc.mock.calls[0]![1] as Record<string, unknown>
    expect(patch.lastCallAt).toBeTruthy()
    expect(patch.lastCalledByLabel).toBe('sip101')
  })

  it('rethrows when lastCall patch fails (so caller can retry)', async () => {
    getDocs.mockResolvedValue({ empty: true, docs: [] })
    updateDoc.mockRejectedValue(new Error('permission-denied'))
    await expect(logOmicallInteraction({} as never, callPayload(), profile)).rejects.toThrow(
      /permission-denied/,
    )
  })
})
