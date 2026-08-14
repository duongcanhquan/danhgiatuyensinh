import type { MasterDataEntry } from '../types'

/** Catalog id trong `masterData` + `_registry` — dùng chung CRM và cổng đăng ký. */
export const APPLICANT_CATEGORIES_CATALOG_ID = 'applicant_categories' as const

/**
 * Seed mặc định (giá trị `label` = giá trị lưu trên lead).
 * `labelEn` hiện trên cổng khi chọn EN.
 */
export const DEFAULT_APPLICANT_CATEGORY_ENTRIES: readonly MasterDataEntry[] = [
  {
    id: 'hs-lop-9',
    label: 'Học sinh lớp 9',
    labelEn: 'Grade 9 Student (Transcript-based)',
    synonyms: ['Học sinh lớp 9 (Xét học bạ)'],
    isActive: true,
  },
  {
    id: 'hs-lop-12',
    label: 'Học sinh lớp 12',
    labelEn: 'Grade 12 Student (Transcript/Exam)',
    synonyms: ['Học sinh lớp 12 (Xét học bạ/Điểm thi)'],
    isActive: true,
  },
  {
    id: 'tn-thpt',
    label: 'Đã tốt nghiệp PTTH',
    labelEn: 'High School Graduate',
    synonyms: ['Đã tốt nghiệp THPT'],
    isActive: true,
  },
  {
    id: 'tn-tc-cd-dh',
    label: 'Đã tốt nghiệp TC, CĐ, ĐH khác',
    labelEn: 'College/University Graduate',
    isActive: true,
  },
]

export type ApplicantCategoryOption = {
  value: string
  labelVn: string
  labelEn: string
}

/** Map entry master → option hiển thị (VN ưu tiên synonym đầu nếu có). */
export function applicantCategoryOptionFromEntry(entry: MasterDataEntry): ApplicantCategoryOption {
  const value = entry.label.trim()
  const synonym0 = Array.isArray(entry.synonyms) ? String(entry.synonyms[0] ?? '').trim() : ''
  const labelVn = synonym0 || value
  const labelEn = String(entry.labelEn ?? '').trim() || labelVn
  return { value, labelVn, labelEn }
}

export function applicantCategoryOptionsFromEntries(
  entries: readonly MasterDataEntry[] | undefined | null,
): ApplicantCategoryOption[] {
  const list = (entries ?? []).filter((e) => e.isActive !== false && e.label.trim())
  if (list.length === 0) {
    return DEFAULT_APPLICANT_CATEGORY_ENTRIES.map(applicantCategoryOptionFromEntry)
  }
  return list.map(applicantCategoryOptionFromEntry)
}

export function applicantCategoryLabels(entries: readonly MasterDataEntry[] | undefined | null): string[] {
  return applicantCategoryOptionsFromEntries(entries).map((o) => o.value)
}
