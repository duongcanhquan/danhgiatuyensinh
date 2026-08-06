import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = {
  failOnCommit: null as number | null,
  commitCount: 0,
  updateCalls: [] as Array<{ path: string; data: Record<string, unknown> }>,
}

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
    doc: (_db: unknown, col: string, id: string) => ({ path: `${col}/${id}`, id }),
    writeBatch: () => {
      const batchUpdates: typeof state.updateCalls = []
      return {
        update: (ref: { path: string }, data: Record<string, unknown>) => {
          batchUpdates.push({ path: ref.path, data })
        },
        commit: async () => {
          state.commitCount += 1
          if (state.failOnCommit != null && state.commitCount === state.failOnCommit) {
            throw new Error('batch failed')
          }
          for (const u of batchUpdates) state.updateCalls.push(u)
        },
      }
    },
  }
})

import {
  BulkPriorityPartialError,
  bulkSetLeadPriorityTags,
  isPriorityTag,
} from './bulkLeadPriorityTag'

describe('bulkLeadPriorityTag', () => {
  beforeEach(() => {
    state.failOnCommit = null
    state.commitCount = 0
    state.updateCalls = []
  })

  it('accepts known tags only', () => {
    expect(isPriorityTag('HOT')).toBe(true)
    expect(isPriorityTag('WARM')).toBe(true)
    expect(isPriorityTag('nope')).toBe(false)
  })

  it('commits in chunks and returns committedIds', async () => {
    const ids = Array.from({ length: 5 }, (_, i) => `id${i}`)
    const result = await bulkSetLeadPriorityTags({} as never, ids, 'HOT', { chunkSize: 2 })
    expect(result.updated).toBe(5)
    expect(result.committedIds).toEqual(ids)
    expect(state.commitCount).toBe(3)
    expect(state.updateCalls.every((u) => u.data.priorityTag === 'HOT')).toBe(true)
  })

  it('throws BulkPriorityPartialError with committed ids when a later chunk fails', async () => {
    state.failOnCommit = 2
    const ids = ['a', 'b', 'c', 'd']
    await expect(bulkSetLeadPriorityTags({} as never, ids, 'WARM', { chunkSize: 2 })).rejects.toMatchObject({
      name: 'BulkPriorityPartialError',
      committedIds: ['a', 'b'],
      remainingIds: ['c', 'd'],
    })
    expect(BulkPriorityPartialError).toBeTruthy()
    expect(state.updateCalls.map((u) => u.path.split('/')[1])).toEqual(['a', 'b'])
  })
})
