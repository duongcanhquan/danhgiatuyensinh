import { describe, expect, it } from 'vitest'
import { findMasterEntryByLabel } from './masterDataCatalogOps'
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
