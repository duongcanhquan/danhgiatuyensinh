import { describe, expect, it, vi, beforeEach } from 'vitest'

const updateDoc = vi.fn()
const addDoc = vi.fn()
const commitAuditLog = vi.fn()

vi.mock('firebase/firestore', () => {
  class FakeTs {
    ms: number
    constructor(ms = 1) {
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
    doc: vi.fn((_db: unknown, ...p: string[]) => ({ path: p.join('/') })),
    collection: vi.fn((_db: unknown, ...p: string[]) => ({ path: p.join('/') })),
    updateDoc: (...a: unknown[]) => updateDoc(...a),
    addDoc: (...a: unknown[]) => addDoc(...a),
    deleteField: () => ({ __delete: true }),
  }
})

vi.mock('../services/auditLog', () => ({
  commitAuditLog: (...a: unknown[]) => commitAuditLog(...a),
}))

import { persistLeadCallDisposition } from './persistLeadCallDisposition'

describe('persistLeadCallDisposition', () => {
  beforeEach(() => {
    updateDoc.mockReset()
    addDoc.mockReset()
    commitAuditLog.mockReset()
    updateDoc.mockResolvedValue(undefined)
    addDoc.mockResolvedValue({ id: 'ix' })
    commitAuditLog.mockResolvedValue(undefined)
  })

  it('writes lead disposition patch + CALL interaction with note', async () => {
    const lead = {
      id: 'lead-1',
      callAttemptCount: 0,
      scoringSignals: { askedTuition: true },
      priorityTag: 'WARM' as const,
      status: 'NEW' as const,
      pipelineStatus: 'NEW' as const,
    }
    const result = await persistLeadCallDisposition(
      {} as never,
      { id: 'u1', role: 'counselor', displayName: 'TVV', email: 'a@b.c' },
      lead,
      { dispositionId: 'callback_later', counselorNote: 'Em bảo tuần sau' },
    )
    expect(result.dispositionId).toBe('callback_later')
    expect(updateDoc).toHaveBeenCalledTimes(1)
    const patch = updateDoc.mock.calls[0]![1] as Record<string, unknown>
    expect(patch.lastCallDispositionId).toBe('callback_later')
    expect(patch.callWorkBucket).toBe('callback')
    expect(patch.callAttemptCount).toBe(1)

    const ix = addDoc.mock.calls[0]![1] as Record<string, unknown>
    expect(ix.channel).toBe('CALL')
    expect(ix.callDispositionId).toBe('callback_later')
    expect(ix.counselorNote).toContain('Em bảo tuần sau')
  })

  it('enrolled_elsewhere forces LOSS on lead', async () => {
    await persistLeadCallDisposition(
      {} as never,
      { id: 'u1', role: 'counselor', displayName: 'TVV', email: null },
      {
        id: 'lead-1',
        priorityTag: 'HOT',
        status: 'CONTACTED' as const,
        pipelineStatus: 'CONTACTED' as const,
      },
      { dispositionId: 'enrolled_elsewhere' },
    )
    const patch = updateDoc.mock.calls[0]![1] as Record<string, unknown>
    expect(patch.priorityTag).toBe('LOSS')
    expect(patch.scoringSignals).toMatchObject({ enrolledElsewhere: true })
  })
})
