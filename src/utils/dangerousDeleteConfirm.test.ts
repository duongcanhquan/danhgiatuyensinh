import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  confirmDangerousLeadBatchDelete,
  confirmDangerousSelectedLeadsDelete,
  confirmDangerousStaffAccountDelete,
  dangerousDeleteBatchPhrase,
  normalizeDangerousDeletePhrase,
} from './dangerousDeleteConfirm'

describe('dangerousDeleteConfirm', () => {
  const confirmMock = vi.fn()
  const promptMock = vi.fn()

  beforeEach(() => {
    confirmMock.mockReset()
    promptMock.mockReset()
    vi.stubGlobal('confirm', confirmMock)
    vi.stubGlobal('prompt', promptMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('normalizes typed phrase (accents / spaces)', () => {
    expect(normalizeDangerousDeletePhrase('  xóa  vĩnh  viễn ')).toBe('XOA VINH VIEN')
    expect(normalizeDangerousDeletePhrase(dangerousDeleteBatchPhrase())).toBe('XOA VINH VIEN')
  })

  it('batch delete requires confirm then typed phrase', () => {
    confirmMock.mockReturnValue(true)
    promptMock.mockReturnValue('XOA VINH VIEN')
    expect(confirmDangerousLeadBatchDelete({ scopeLabel: 'chương trình «Test»' })).toBe(true)
    expect(confirmMock).toHaveBeenCalled()
    expect(promptMock).toHaveBeenCalled()
  })

  it('batch delete aborts if phrase wrong', () => {
    confirmMock.mockReturnValue(true)
    promptMock.mockReturnValue('xoa')
    expect(confirmDangerousLeadBatchDelete({ scopeLabel: 'lọc' })).toBe(false)
  })

  it('selected delete skips phrase when under 10', () => {
    confirmMock.mockReturnValue(true)
    expect(confirmDangerousSelectedLeadsDelete(3)).toBe(true)
    expect(promptMock).not.toHaveBeenCalled()
  })

  it('selected delete requires phrase when >= 10', () => {
    confirmMock.mockReturnValue(true)
    promptMock.mockReturnValue('XOA VINH VIEN')
    expect(confirmDangerousSelectedLeadsDelete(10)).toBe(true)
    expect(promptMock).toHaveBeenCalled()
  })

  it('staff account delete requires typed phrase', () => {
    confirmMock.mockReturnValue(true)
    promptMock.mockReturnValue('XOA VINH VIEN')
    expect(confirmDangerousStaffAccountDelete('a@b.com')).toBe(true)
  })
})
