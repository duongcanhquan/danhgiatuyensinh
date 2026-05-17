import type { ScholarshipCategoryId } from '../types'

export const DEFAULT_LEAD_SOURCE_LABELS = [
  'Email Marketing',
  'School Tour HN',
  'School Tour Tỉnh',
  'MOU',
  'CBNV',
  'Sinh viên trường',
  'Hotline',
  'Facebook Ads',
  'Tiktok',
  'Zalo',
  'Giới thiệu',
  'Seedings',
  'Cộng tác viên',
  'Google Ads',
  'Hội Thảo',
  'Đại lý',
  'TVV Tự Kiếm',
  'Khác',
] as const

export type DefaultScholarshipSeed = {
  label: string
  category: ScholarshipCategoryId
  amountVnd: number
}

export const DEFAULT_SCHOLARSHIP_SEEDS: DefaultScholarshipSeed[] = [
  { category: 'phcd', label: 'Học bổng LION', amountVnd: 15_000_000 },
  { category: 'phcd', label: 'Học bổng Early Bird 1', amountVnd: 10_000_000 },
  { category: 'phcd', label: 'Lion Gold Scholarship', amountVnd: 110_000_000 },
  { category: 'phcd', label: 'Events', amountVnd: 1_000_000 },
  { category: 'phcd', label: 'Học bổng Early Bird 2', amountVnd: 6_000_000 },
  { category: 'phcd', label: 'Học bổng Early Bird 3', amountVnd: 3_000_000 },
  { category: 'phcd', label: 'Học bổng Continuing (Tiếp nối)', amountVnd: 2_000_000 },
  { category: 'cdcq', label: 'Học bổng chuyển trường', amountVnd: 10_000_000 },
  { category: 'cdcq', label: 'Early Bird 1', amountVnd: 5_000_000 },
  { category: 'cdcq', label: 'Events', amountVnd: 6_000_000 },
  { category: 'cdcq', label: 'LION 1', amountVnd: 10_000_000 },
  { category: 'cdcq', label: 'Lion Gold Scholarship (HB đặc biệt)', amountVnd: 70_000_000 },
  { category: 'cdcq', label: 'LION 2', amountVnd: 10_000_000 },
  { category: 'cdcq', label: 'Early Bird 2', amountVnd: 3_000_000 },
  { category: 'cdcq', label: 'Early Bird 3', amountVnd: 6_000_000 },
  { category: 'cdcq', label: 'Học bổng Continuing (Tiếp nối)', amountVnd: 2_000_000 },
]

export function formatVnd(amount: number): string {
  return `${amount.toLocaleString('vi-VN')}đ`
}

export function formatScholarshipOptionLabel(label: string, amountVnd: number): string {
  return `${label} (${formatVnd(amountVnd)})`
}
