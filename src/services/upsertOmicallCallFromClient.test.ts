import { beforeEach, describe, expect, it, vi } from 'vitest'

const setDoc = vi.fn()
const getDoc = vi.fn()
const doc = vi.fn((_db: unknown, ...parts: string[]) => ({ path: parts.join('/') }))

vi.mock('firebase/firestore', () => {
  class FakeTs {
    static now() {
      return new FakeTs()
    }
  }
  return {
    Timestamp: FakeTs,
    doc: (...a: unknown[]) => doc(...a),
    setDoc: (...a: unknown[]) => setDoc(...a),
    getDoc: (...a: unknown[]) => getDoc(...a),
  }
})

import { isPlaceholderOmicallCallUid, upsertOmicallCallFromClient } from './upsertOmicallCallFromClient'

describe('upsertOmicallCallFromClient', () => {
  beforeEach(() => {
    setDoc.mockReset()
    getDoc.mockReset()
    setDoc.mockResolvedValue(undefined)
    getDoc.mockResolvedValue({ exists: () => false, data: () => undefined })
  })

  it('writes final omicallCalls doc with endedAt and lead mapping', async () => {
    await upsertOmicallCallFromClient({} as never, {
      transactionId: 'tx-1',
      leadId: 'lead-1',
      phone: '0901234567',
      counselorUid: 'u1',
      orgId: 'vietmy',
      billSeconds: 48,
      sipUser: '101',
      hotline: '1900',
    })

    expect(setDoc).toHaveBeenCalledTimes(1)
    const payload = setDoc.mock.calls[0]![1] as Record<string, unknown>
    expect(payload.transactionId).toBe('tx-1')
    expect(payload.leadId).toBe('lead-1')
    expect(payload.counselorUid).toBe('u1')
    expect(payload.orgId).toBe('vietmy')
    expect(payload.billSeconds).toBe(48)
    expect(payload.outcome).toBe('CONNECTED')
    expect(payload.isFinal).toBe(true)
    expect(payload.syncSource).toBe('sdk')
    expect(payload.sipUser).toBe('101')
    expect(payload.hotline).toBe('1900')
    expect(payload.endedAt).toBeTruthy()
  })

  it('skips empty ids', async () => {
    await upsertOmicallCallFromClient({} as never, {
      transactionId: '',
      leadId: 'lead-1',
      phone: '090',
      counselorUid: 'u1',
    })
    expect(setDoc).not.toHaveBeenCalled()
  })

  it('rejects placeholder call uids', async () => {
    expect(isPlaceholderOmicallCallUid('pending-1')).toBe(true)
    await expect(
      upsertOmicallCallFromClient({} as never, {
        transactionId: 'pending-1',
        leadId: 'lead-1',
        phone: '090',
        counselorUid: 'u1',
      }),
    ).rejects.toThrow(/mã cuộc gọi thật/)
    expect(setDoc).not.toHaveBeenCalled()
  })

  it('preserves createdAt on merge', async () => {
    const oldCreated = { ms: 1 }
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ createdAt: oldCreated }) })
    await upsertOmicallCallFromClient({} as never, {
      transactionId: 'tx-2',
      leadId: 'lead-1',
      phone: '090',
      counselorUid: 'u1',
      billSeconds: 0,
    })
    const payload = setDoc.mock.calls[0]![1] as Record<string, unknown>
    expect(payload.createdAt).toBe(oldCreated)
    expect(payload.outcome).toBe('NO_ANSWER')
  })
})
