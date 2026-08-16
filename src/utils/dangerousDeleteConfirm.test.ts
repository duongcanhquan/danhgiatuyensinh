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

  it('batch delete requires confirm then typed phrase', async () => {
    confirmMock.mockReturnValue(true)
    promptMock.mockReturnValue('XOA VINH VIEN')
    await expect(confirmDangerousLeadBatchDelete({ scopeLabel: 'chương trình «Test»' })).resolves.toBe(
      true,
    )
    expect(confirmMock).toHaveBeenCalled()
    expect(promptMock).toHaveBeenCalled()
  })

  it('batch delete aborts if phrase wrong', async () => {
    confirmMock.mockReturnValue(true)
    promptMock.mockReturnValue('xoa')
    await expect(confirmDangerousLeadBatchDelete({ scopeLabel: 'lọc' })).resolves.toBe(false)
  })

  it('selected delete skips phrase when under 10', async () => {
    confirmMock.mockReturnValue(true)
    await expect(confirmDangerousSelectedLeadsDelete(3)).resolves.toBe(true)
    expect(promptMock).not.toHaveBeenCalled()
  })

  it('selected delete requires phrase when >= 10', async () => {
    confirmMock.mockReturnValue(true)
    promptMock.mockReturnValue('XOA VINH VIEN')
    await expect(confirmDangerousSelectedLeadsDelete(10)).resolves.toBe(true)
    expect(promptMock).toHaveBeenCalled()
  })

  it('staff account delete requires typed phrase', async () => {
    confirmMock.mockReturnValue(true)
    promptMock.mockReturnValue('XOA VINH VIEN')
    await expect(confirmDangerousStaffAccountDelete('a@b.com')).resolves.toBe(true)
  })
})
