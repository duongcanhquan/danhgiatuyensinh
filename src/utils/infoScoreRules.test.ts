import { describe, expect, it } from 'vitest'
import {
  buildInfoScoreRuntime,
  getDefaultInfoScoreRules,
  mergeInfoScoreRules,
  parseInfoScoreDoc,
  infoScoreMaxRaw,
} from './infoScoreRules'
import { computeMockMlWinProbability } from './mlWinMock'
import type { Lead } from '../types'
import { Timestamp } from 'firebase/firestore'

function stubLead(over: Partial<Lead> = {}): Lead {
  const t = Timestamp.fromMillis(1_700_000_000_000)
  return {
    id: 'lead-test',
    customerId: '',
    fullName: '',
    phone: '',
    parentPhone: '',
    source: '',
    educationLevel: '',
    assignedTo: null,
    status: 'NEW',
    description: '',
    highSchool: '',
    gradeClass: '',
    province: '',
    address: '',
    calculatedScore: 0,
    priorityTag: 'COLD',
    uploadedAt: t,
    updatedAt: t,
    pipelineStatus: 'NEW',
    uniqueHash: 'h',
    createdAt: t,
    ...over,
  }
}

describe('infoScoreRules', () => {
  it('parseInfoScoreDoc accepts partial doc without fields array', () => {
    const p = parseInfoScoreDoc({
      schemaVersion: 1,
      basePoints: 40,
      capMin: 10,
      capMax: 90,
    } as Record<string, unknown>)
    expect(p).not.toBeNull()
    expect(p!.basePoints).toBe(40)
    expect(p!.fields.length).toBe(getDefaultInfoScoreRules().fields.length)
  })

  it('mergeInfoScoreRules disables field affects max raw', () => {
    const d = getDefaultInfoScoreRules()
    const next = mergeInfoScoreRules({
      ...d,
      fields: d.fields.map((f) => (f.id === 'phone' ? { ...f, enabled: false } : f)),
    })
    const full = infoScoreMaxRaw(getDefaultInfoScoreRules())
    const cut = infoScoreMaxRaw(next)
    expect(cut).toBeLessThan(full)
  })

  it('computeMockMlWinProbability respects disabled phone rule', () => {
    const d = getDefaultInfoScoreRules()
    const next = mergeInfoScoreRules({
      ...d,
      fields: d.fields.map((f) => (f.id === 'phone' ? { ...f, enabled: false } : f)),
    })
    const rt = buildInfoScoreRuntime(next, true)
    const m = computeMockMlWinProbability(stubLead({ phone: '+84901234567', fullName: 'A' }), rt)
    const phoneRow = m.mvpBreakdown?.items.find((i) => i.id === 'phone')
    expect(phoneRow).toBeUndefined()
  })
})