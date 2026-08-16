import { describe, expect, it } from 'vitest'
import {
  findMasterEntryByLabel,
  majorBelongsToTrainingProgram,
  majorLinkedProgramIds,
  majorsForTrainingProgram,
  patchMajorTrainingPrograms,
} from './masterDataCatalogOps'
import type { MasterDataEntry } from '../types'

describe('findMasterEntryByLabel', () => {
  const entries: MasterDataEntry[] = [
    { id: '1', label: 'Cơ sở Hà Nội', isActive: true },
    { id: '2', label: '2025–2028', isActive: true },
  ]

  it('khớp bỏ dấu', () => {
    expect(findMasterEntryByLabel(entries, 'co so ha noi')?.id).toBe('1')
    expect(findMasterEntryByLabel(entries, 'Cơ sở Hà Nội')?.id).toBe('1')
  })
})

describe('majors multi training programs', () => {
  const majors: MasterDataEntry[] = [
    { id: 'dd', label: 'Điều dưỡng', departmentIds: ['cdcq', 'tc'], departmentId: 'cdcq', isActive: true },
    { id: 'sc', label: 'Sơ cấp Y', departmentId: 'sc', isActive: true },
    { id: 'all', label: 'Ngoài ngành', isActive: true },
  ]

  it('gộp departmentIds + departmentId', () => {
    expect(majorLinkedProgramIds(majors[0])).toEqual(['cdcq', 'tc'])
    expect(majorLinkedProgramIds(majors[1])).toEqual(['sc'])
    expect(majorLinkedProgramIds(majors[2])).toEqual([])
  })

  it('một ngành thuộc nhiều hệ', () => {
    expect(majorBelongsToTrainingProgram(majors[0]!, 'cdcq')).toBe(true)
    expect(majorBelongsToTrainingProgram(majors[0]!, 'tc')).toBe(true)
    expect(majorBelongsToTrainingProgram(majors[0]!, 'sc')).toBe(false)
    expect(majorsForTrainingProgram(majors, 'cdcq').map((m) => m.id)).toEqual(['dd', 'all'])
    expect(majorsForTrainingProgram(majors, 'tc').map((m) => m.id)).toEqual(['dd', 'all'])
    expect(majorsForTrainingProgram(majors, 'sc').map((m) => m.id)).toEqual(['sc', 'all'])
  })

  it('patchMajorTrainingPrograms', () => {
    expect(patchMajorTrainingPrograms(['tc', 'cdcq'])).toEqual({
      departmentIds: ['tc', 'cdcq'],
      departmentId: 'tc',
    })
    expect(patchMajorTrainingPrograms([])).toEqual({
      departmentId: undefined,
      departmentIds: undefined,
    })
  })
})
