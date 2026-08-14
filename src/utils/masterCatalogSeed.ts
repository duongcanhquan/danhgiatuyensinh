import type { MasterDataEntry } from '../types'
import {
  APPLICANT_CATEGORIES_CATALOG_ID,
  DEFAULT_APPLICANT_CATEGORY_ENTRIES,
} from './applicantCategoryCatalog'

/** Seed entries khi tạo doc masterData lần đầu — dùng chung bootstrap + ensure. */
export function seedEntriesForMasterCatalog(catalogId: string): MasterDataEntry[] {
  if (catalogId === APPLICANT_CATEGORIES_CATALOG_ID) {
    return DEFAULT_APPLICANT_CATEGORY_ENTRIES.map((e) => ({ ...e }))
  }
  // campuses / school_years / … — doc trống, admin hoặc import bổ sung sau
  return []
}

export function shouldSeedEmptyMasterCatalog(catalogId: string, existingCount: number): boolean {
  if (existingCount > 0) return false
  // Chỉ đối tượng dự tuyển bắt buộc có mẫu sẵn (cổng đăng ký không được trống).
  return catalogId === APPLICANT_CATEGORIES_CATALOG_ID
}
