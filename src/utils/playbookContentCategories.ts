import type { ConsultingPlaybook } from '../types'

/** Tính chất nội dung mẫu tư vấn — danh mục quản trị, dễ thêm/bớt. */
export const PLAYBOOK_CONTENT_CATEGORIES = [
  { id: 'tuition', label: 'Học phí & chi phí' },
  { id: 'school_quality', label: 'Chất lượng trường' },
  { id: 'degree', label: 'Bằng cấp & chứng chỉ' },
  { id: 'major_career', label: 'Ngành & nghề nghiệp' },
  { id: 'scholarship', label: 'Học bổng & hỗ trợ' },
  { id: 'campus_life', label: 'Campus & đời sống' },
  { id: 'admission', label: 'Tuyển sinh & hồ sơ' },
  { id: 'objection', label: 'Phản đối & so sánh' },
  { id: 'general', label: 'Chung / quy trình' },
  { id: 'other', label: 'Khác' },
] as const

export type PlaybookContentCategoryId = (typeof PLAYBOOK_CONTENT_CATEGORIES)[number]['id']

const CATEGORY_IDS = new Set<string>(PLAYBOOK_CONTENT_CATEGORIES.map((c) => c.id))

export function isPlaybookContentCategoryId(v: string): v is PlaybookContentCategoryId {
  return CATEGORY_IDS.has(v)
}

export function parsePlaybookContentCategory(raw: unknown): PlaybookContentCategoryId | undefined {
  const s = String(raw ?? '').trim()
  return isPlaybookContentCategoryId(s) ? s : undefined
}

export function playbookContentCategoryLabel(id: PlaybookContentCategoryId): string {
  return PLAYBOOK_CONTENT_CATEGORIES.find((c) => c.id === id)?.label ?? id
}

export function playbookSearchBlob(p: ConsultingPlaybook): string {
  const usp = (p.keySellingPoints ?? []).join(' ')
  const obj = (p.objectionHandling ?? []).join(' ')
  const kws = (p.matchKeywords ?? []).join(' ')
  return [p.title, p.strategy, usp, obj, kws].join(' ').toLowerCase()
}

/** Suy luận từ tiêu đề/nội dung khi chưa gán contentCategory. */
export function inferPlaybookContentCategory(p: ConsultingPlaybook): PlaybookContentCategoryId {
  const blob = playbookSearchBlob(p)
  if (/học phí|học phi|chi phí|trả góp|lệ phí|đóng tiền/.test(blob)) return 'tuition'
  if (/chất lượng|uy tín|kiểm định|xếp hạng|ranking|accredit/.test(blob)) return 'school_quality'
  if (/bằng cấp|bằng tốt nghiệp|chứng chỉ|degree|diploma|tốt nghiệp/.test(blob)) return 'degree'
  if (/ngành học|nghề nghiệp|việc làm|lương|career|major/.test(blob)) return 'major_career'
  if (/học bổng|miễn giảm|hỗ trợ tài chính|scholarship/.test(blob)) return 'scholarship'
  if (/ký túc|campus|đời sống|sinh viên|cơ sở/.test(blob)) return 'campus_life'
  if (/tuyển sinh|hồ sơ|đăng ký|xét tuyển|nhập học/.test(blob)) return 'admission'
  if (/phản đối|từ chối|so sánh|đối thủ|objection/.test(blob)) return 'objection'
  return 'general'
}

export function resolvePlaybookContentCategory(p: ConsultingPlaybook): PlaybookContentCategoryId {
  if (p.contentCategory && isPlaybookContentCategoryId(p.contentCategory)) {
    return p.contentCategory
  }
  return inferPlaybookContentCategory(p)
}
