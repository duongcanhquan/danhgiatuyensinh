import type { ScoringProfile } from '../types'

/** Profile có ít nhất một dòng quy tắc (khối hoặc rules phẳng legacy). */
export function profileHasActiveRules(profile: Pick<ScoringProfile, 'rules' | 'ruleBlocks'>): boolean {
  const blocks = profile.ruleBlocks ?? []
  if (blocks.some((b) => (b.rows?.length ?? 0) > 0)) return true
  return (profile.rules?.length ?? 0) > 0
}

/** Hồ sơ mẫu để xem trước / thử chấm trong Cài đặt. */
export const PROFILE_SCORING_SAMPLE_LEAD: Record<string, unknown> = {
  customerId: 'KH-DEMO-001',
  fullName: 'Nguyễn Văn A',
  phone: '0912345678',
  parentPhone: '0987654321',
  province: 'Hà Nội',
  region: 'Hà Nội',
  address: 'Số 12, phường demo, Hà Nội',
  source: 'Facebook',
  leadSource: 'Facebook',
  educationLevel: 'Đại học',
  majorInterest: 'Công nghệ thông tin',
  major: 'Công nghệ thông tin',
  academicLevel: 'Khá',
  highSchool: 'THPT Chuyên Hà Nội - Amsterdam',
  gradeClass: '12A1',
  studyIntention: 'Đại học',
  financialStatus: 'Khá',
  description: 'Quan tâm ngành CNTT, hỏi học phí',
  aspirations: 'Muốn học chuyên ngành lập trình',
}
