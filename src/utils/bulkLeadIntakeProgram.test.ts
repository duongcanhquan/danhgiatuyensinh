import { beforeEach, describe, expect, it, vi } from 'vitest'

const commit = vi.fn()
const update = vi.fn()

const memoryStore = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => memoryStore.get(k) ?? null,
  setItem: (k: string, v: string) => {
    memoryStore.set(k, v)
  },
  removeItem: (k: string) => {
    memoryStore.delete(k)
  },
  clear: () => memoryStore.clear(),
})

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
    doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join('/') }),
    writeBatch: () => ({
      update: (...a: unknown[]) => update(...a),
      commit: (...a: unknown[]) => commit(...a),
    }),
    deleteField: () => ({ __delete: true }),
  }
})

import { bulkSetLeadIntakeProgram } from './bulkLeadIntakeProgram'
import {
  intakeProgramsMatch,
  loadRecentIntakePrograms,
  normalizeIntakeProgramLabel,
  rememberIntakeProgram,
} from './intakeProgramRecent'

describe('intakeProgramRecent', () => {
  beforeEach(() => {
    memoryStore.clear()
  })

  it('normalizes label', () => {
    expect(normalizeIntakeProgramLabel('  Đợt 9 2026  ')).toBe('Đợt 9 2026')
  })

  it('remembers programs MRU without duplicates', () => {
    rememberIntakeProgram('A')
    rememberIntakeProgram('B')
    rememberIntakeProgram('a')
    expect(loadRecentIntakePrograms()).toEqual(['a', 'B'])
  })

  it('matches program labels case-insensitively', () => {
    expect(intakeProgramsMatch('Đợt 9', 'đợt 9')).toBe(true)
    expect(intakeProgramsMatch('A', 'B')).toBe(false)
    expect(intakeProgramsMatch('', null)).toBe(true)
  })
})

describe('bulkSetLeadIntakeProgram', () => {
  beforeEach(() => {
    update.mockReset()
    commit.mockReset()
    commit.mockResolvedValue(undefined)
  })

  it('writes intakeProgram on leads', async () => {
    const r = await bulkSetLeadIntakeProgram({} as never, ['l1', 'l2'], 'Đợt mới')
    expect(r.updated).toBe(2)
    expect(update).toHaveBeenCalledTimes(2)
    expect(update.mock.calls[0]![1]).toMatchObject({ intakeProgram: 'Đợt mới' })
    expect(commit).toHaveBeenCalledTimes(1)
  })

  it('clears program with deleteField when empty', async () => {
    await bulkSetLeadIntakeProgram({} as never, ['l1'], '')
    expect(update.mock.calls[0]![1].intakeProgram).toEqual({ __delete: true })
  })
})
