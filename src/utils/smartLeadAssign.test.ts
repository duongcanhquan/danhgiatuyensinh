import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  pickLeadIdsForAssign,
  planLeadAssignments,
  summarizeAssignPlan,
} from './smartLeadAssign'

describe('pickLeadIdsForAssign', () => {
  const rows = [
    { id: 'c', createdAtMs: 300 },
    { id: 'a', createdAtMs: 100 },
    { id: 'b', createdAtMs: 200 },
  ]

  it('keeps table_order and caps n', () => {
    expect(pickLeadIdsForAssign(rows, 'table_order', 2)).toEqual(['c', 'a'])
  })

  it('sorts oldest first', () => {
    expect(pickLeadIdsForAssign(rows, 'oldest', 2)).toEqual(['a', 'b'])
  })

  it('random uses provided rng', () => {
    // Always swap toward reverse-ish: floor(0.99 * (i+1)) = i → no swap; use 0 to always pick j=0
    const seq = [0, 0, 0]
    let i = 0
    const ids = pickLeadIdsForAssign(rows, 'random', 3, {
      random: () => seq[i++] ?? 0,
    })
    expect(ids).toHaveLength(3)
    expect(new Set(ids)).toEqual(new Set(['a', 'b', 'c']))
  })

  it('returns empty when n<=0', () => {
    expect(pickLeadIdsForAssign(rows, 'table_order', 0)).toEqual([])
  })
})

describe('planLeadAssignments', () => {
  it('assigns all to single uid', () => {
    const plan = planLeadAssignments(['l1', 'l2', 'l3'], ['c1', 'c2'], 'single', { singleUid: 'c2' })
    expect([...plan.assignments.values()]).toEqual(['c2', 'c2', 'c2'])
    expect(plan.perCounselor.get('c2')).toBe(3)
  })

  it('round-robins across counselors', () => {
    const plan = planLeadAssignments(['a', 'b', 'c', 'd'], ['c1', 'c2'], 'round_robin')
    expect(plan.assignments.get('a')).toBe('c1')
    expect(plan.assignments.get('b')).toBe('c2')
    expect(plan.assignments.get('c')).toBe('c1')
    expect(plan.assignments.get('d')).toBe('c2')
    expect(plan.perCounselor.get('c1')).toBe(2)
    expect(plan.perCounselor.get('c2')).toBe(2)
  })

  it('lowest_load prefers lighter counselor then balances', () => {
    const loads = new Map([
      ['c1', 10],
      ['c2', 0],
    ])
    const plan = planLeadAssignments(['a', 'b', 'c'], ['c1', 'c2'], 'lowest_load', {
      currentLoads: loads,
    })
    expect(plan.assignments.get('a')).toBe('c2')
    expect(plan.assignments.get('b')).toBe('c2')
    // after two to c2 (load 2), c1 still 10 — still c2 until catches... actually c2 goes 0→1→2, c1 is 10
    expect(plan.assignments.get('c')).toBe('c2')
    expect(plan.perCounselor.get('c2')).toBe(3)
  })

  it('throws when single missing uid', () => {
    expect(() => planLeadAssignments(['l1'], [], 'single')).toThrow(/phụ trách/)
  })

  it('summarizes plan', () => {
    const plan = planLeadAssignments(['a', 'b'], ['c1', 'c2'], 'round_robin')
    expect(summarizeAssignPlan(plan)).toMatch(/2 người/)
  })
})

const commit = vi.fn()
const update = vi.fn()

vi.mock('firebase/firestore', () => {
  class FakeTs {
    ms = 1
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
  }
})

describe('bulkReassignLeads', () => {
  beforeEach(() => {
    update.mockReset()
    commit.mockReset()
    commit.mockResolvedValue(undefined)
  })

  it('writes assignee mirror fields in batches', async () => {
    const { bulkReassignLeads } = await import('./bulkLeadReassign')
    const r = await bulkReassignLeads({} as never, [
      { leadId: 'l1', counselorUid: 'c1' },
      { leadId: 'l2', counselorUid: 'c2' },
    ])
    expect(r.updated).toBe(2)
    expect(update).toHaveBeenCalledTimes(2)
    expect(update.mock.calls[0]![1]).toMatchObject({
      assignedTo: 'c1',
      assignedCounselorId: 'c1',
    })
    expect(commit).toHaveBeenCalledTimes(1)
  })
})
