import { describe, expect, it } from 'vitest'
import type { MasterDataEntry, ScholarshipRecord } from '../types'
import {
  filterScholarshipsForLeadEducation,
  guessTrainingProgramTermCount,
  resolveTrainingProgramTermCount,
  scholarshipMatchesLeadTrainingProgram,
} from './scholarshipTrainingLink'

const programs: MasterDataEntry[] = [
  { id: 'cd', label: 'Cao đẳng chính quy', termCount: 6 },
  { id: 'tc', label: 'Trung cấp', termCount: 4 },
  { id: 'sc', label: 'Sơ cấp' },
]

describe('scholarshipTrainingLink', () => {
  it('guesses term counts from labels', () => {
    expect(guessTrainingProgramTermCount('Trung cấp nghề')).toBe(4)
    expect(guessTrainingProgramTermCount('Sơ cấp')).toBe(2)
    expect(guessTrainingProgramTermCount('Cao đẳng chính quy')).toBe(6)
  })

  it('prefers explicit termCount on program', () => {
    expect(resolveTrainingProgramTermCount(programs[0])).toBe(6)
    expect(resolveTrainingProgramTermCount(programs[2])).toBe(2)
  })

  it('filters scholarships by linked training program', () => {
    const rows = [
      { id: 'a', trainingProgramId: 'cd', label: 'HB CD', category: 'cdcq', amountVnd: 1, sortOrder: 1, isActive: true },
      { id: 'b', trainingProgramId: 'tc', label: 'HB TC', category: 'cdcq', amountVnd: 1, sortOrder: 1, isActive: true },
      { id: 'c', label: 'HB chung', category: 'phcd', amountVnd: 1, sortOrder: 1, isActive: true },
    ] as ScholarshipRecord[]
    expect(filterScholarshipsForLeadEducation(rows, 'Cao đẳng chính quy', programs).map((s) => s.id)).toEqual([
      'a',
      'c',
    ])
    expect(scholarshipMatchesLeadTrainingProgram(rows[1]!, 'Cao đẳng chính quy', programs)).toBe(false)
  })
})
