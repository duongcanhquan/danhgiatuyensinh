import type { ScholarshipApplySlot, ScholarshipAudienceTag, ScholarshipCategoryId } from '../types'

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
  validFrom?: string
  validTo?: string
  applicationMethod?: string
  targetAudience?: string
  quantityLimit?: number
  audienceTags?: ScholarshipAudienceTag[]
  applySlots?: ScholarshipApplySlot[]
  sortOrder?: number
}

/** Bảng học bổng VietMy — đồng bộ từ file kế hoạch tuyển sinh. */
export const DEFAULT_SCHOLARSHIP_SEEDS: DefaultScholarshipSeed[] = [
  {
    category: 'phcd',
    label: 'Học bổng LION',
    amountVnd: 15_000_000,
    applicationMethod: 'Cộng dồn 5 kỳ: 3-3-3-3-3 triệu',
    targetAudience:
      'Sinh viên học tại cơ sở Cầu Giấy hoặc Tây Hồ ngành Trung Quốc, hoặc sinh viên sử dụng xe đưa đón của trường.',
    quantityLimit: 60,
    sortOrder: 10,
  },
  {
    category: 'phcd',
    label: 'Học bổng Early Bird 1',
    amountVnd: 10_000_000,
    validFrom: '2025-11-01',
    validTo: '2026-05-31',
    applicationMethod: 'Cộng dồn 5 kỳ: 2-2-2-2-2 triệu',
    targetAudience: 'Điểm TB từ 5.0 trở lên.',
    quantityLimit: 250,
    audienceTags: ['early_bird', 'new_enrollment'],
    sortOrder: 20,
  },
  {
    category: 'phcd',
    label: 'Lion Gold Scholarship',
    amountVnd: 110_000_000,
    validFrom: '2025-11-01',
    validTo: '2026-05-31',
    applicationMethod: 'Miễn 100% học phí toàn khóa',
    targetAudience:
      'Sinh viên trường MOU hoàn cảnh khó khăn (có xác nhận địa phương) hoặc có giấy khen thành tích.',
    quantityLimit: 2,
    audienceTags: ['high_achiever'],
    sortOrder: 30,
  },
  {
    category: 'phcd',
    label: 'Events',
    amountVnd: 1_000_000,
    applicationMethod: 'Trừ vào học phí học kỳ 1',
    targetAudience: 'Sinh viên đăng ký tại hội thảo / sự kiện; có thể cộng dồn với học bổng khác.',
    quantityLimit: 40,
    audienceTags: ['event_participant'],
    sortOrder: 40,
  },
  {
    category: 'phcd',
    label: 'Học bổng Early Bird 2',
    amountVnd: 6_000_000,
    validFrom: '2026-06-01',
    validTo: '2026-06-30',
    applicationMethod: 'Cộng dồn 3 kỳ: 2-2-2 triệu',
    targetAudience: 'Điểm TB từ 5.0 trở lên.',
    quantityLimit: 70,
    audienceTags: ['early_bird'],
    sortOrder: 50,
  },
  {
    category: 'phcd',
    label: 'Học bổng Early Bird 3',
    amountVnd: 3_000_000,
    validFrom: '2026-07-01',
    validTo: '2026-07-31',
    applicationMethod: 'Cộng dồn 3 kỳ: 1-1-1 triệu',
    targetAudience: 'Điểm TB từ 5.0 trở lên.',
    quantityLimit: 70,
    audienceTags: ['early_bird'],
    sortOrder: 60,
  },
  {
    category: 'phcd',
    label: 'Học bổng Continuing (Tiếp nối)',
    amountVnd: 2_000_000,
    validFrom: '2025-11-01',
    validTo: '2026-09-30',
    applicationMethod: 'Trừ vào học phí học kỳ 1',
    targetAudience: 'Sinh viên 9+4 hoặc chuyển tiếp.',
    quantityLimit: 40,
    audienceTags: ['continuing', 'transfer'],
    sortOrder: 70,
  },
  {
    category: 'cdcq',
    label: 'Học bổng chuyển trường',
    amountVnd: 10_000_000,
    applicationMethod: 'Miễn 100% học phí HK1 nếu sinh viên đóng đủ học phí HK2',
    targetAudience: 'Sinh viên chuyển trường.',
    quantityLimit: 50,
    audienceTags: ['transfer'],
    sortOrder: 110,
  },
  {
    category: 'cdcq',
    label: 'Early Bird 1',
    amountVnd: 5_000_000,
    validFrom: '2025-11-01',
    validTo: '2026-05-31',
    applicationMethod: 'Cộng dồn 3 kỳ: 2-2-1 triệu',
    targetAudience: 'Điểm TB từ 6.0 trở lên.',
    quantityLimit: 300,
    audienceTags: ['early_bird'],
    sortOrder: 120,
  },
  {
    category: 'cdcq',
    label: 'Events',
    amountVnd: 6_000_000,
    validFrom: '2025-11-01',
    validTo: '2026-05-31',
    applicationMethod: 'Cộng dồn 3 kỳ: 2-2-2 triệu',
    targetAudience: 'Đăng ký trong vòng 48 giờ sau hội thảo / sự kiện.',
    quantityLimit: 250,
    audienceTags: ['event_participant'],
    sortOrder: 130,
  },
  {
    category: 'cdcq',
    label: 'LION 1',
    amountVnd: 10_000_000,
    validFrom: '2025-11-01',
    validTo: '2026-05-31',
    applicationMethod: 'Cộng dồn 4 kỳ: 3-3-2-2 triệu',
    targetAudience: 'Sinh viên trường MOU khóa 2k8, điểm TB từ 7.0 trở lên.',
    quantityLimit: 50,
    audienceTags: ['high_achiever', 'referral'],
    sortOrder: 140,
  },
  {
    category: 'cdcq',
    label: 'Lion Gold Scholarship (HB đặc biệt)',
    amountVnd: 70_000_000,
    validFrom: '2025-11-01',
    validTo: '2026-05-31',
    applicationMethod: 'Miễn 100% học phí toàn khóa',
    targetAudience:
      'Sinh viên trường MOU học lực xuất sắc (TB 8.0+), hoàn cảnh khó khăn hoặc khuyết tật.',
    quantityLimit: 3,
    audienceTags: ['high_achiever'],
    sortOrder: 150,
  },
  {
    category: 'cdcq',
    label: 'LION 2',
    amountVnd: 10_000_000,
    validFrom: '2026-06-01',
    validTo: '2026-08-31',
    applicationMethod: 'Cộng dồn 4 kỳ: 3-3-2-2 triệu',
    targetAudience: 'Sinh viên trường MOU khóa 2k8, điểm TB từ 7.0 trở lên.',
    quantityLimit: 100,
    audienceTags: ['high_achiever', 'referral'],
    sortOrder: 160,
  },
  {
    category: 'cdcq',
    label: 'Early Bird 2',
    amountVnd: 3_000_000,
    validFrom: '2026-06-01',
    validTo: '2026-08-31',
    applicationMethod: 'Cộng dồn 2 kỳ: 2-1 triệu',
    targetAudience: 'Điểm TB từ 5.0 trở lên.',
    quantityLimit: 300,
    audienceTags: ['early_bird'],
    sortOrder: 170,
  },
  {
    category: 'cdcq',
    label: 'Early Bird 3',
    amountVnd: 6_000_000,
    validFrom: '2026-06-01',
    validTo: '2026-08-31',
    applicationMethod: 'Cộng dồn 3 kỳ: 2-2-2 triệu',
    targetAudience:
      'Ngành Khách sạn, Ngôn ngữ (TB 6.0+); hoặc hoàn cảnh khó khăn (TB 7.0+); hoặc sinh viên từ các tỉnh vùng sâu vùng xa (Tuyên Quang, Hà Giang, … — TB 7.0+).',
    quantityLimit: 350,
    audienceTags: ['early_bird', 'high_achiever'],
    sortOrder: 180,
  },
  {
    category: 'cdcq',
    label: 'Học bổng Continuing (Tiếp nối)',
    amountVnd: 2_000_000,
    validFrom: '2026-09-01',
    validTo: '2026-10-31',
    applicationMethod: 'Trừ vào học phí học kỳ 1',
    targetAudience: 'Sinh viên chuyển trường / tiếp nối.',
    quantityLimit: 200,
    audienceTags: ['continuing', 'transfer'],
    sortOrder: 190,
  },
]

export function formatVnd(amount: number): string {
  return `${amount.toLocaleString('vi-VN')}đ`
}

export function formatScholarshipOptionLabel(label: string, amountVnd: number): string {
  return `${label} (${formatVnd(amountVnd)})`
}

/** Hiển thị ngày ISO → dd/MM/yyyy */
export function formatScholarshipDate(iso?: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function scholarshipStableDocId(category: ScholarshipCategoryId, label: string): string {
  const slug = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 48)
  return `${category}_${slug || 'item'}`
}