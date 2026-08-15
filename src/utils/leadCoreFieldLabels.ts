/** Nhãn tiếng Việt cho field Firestore khi ghi dòng thời gian (không hiện mã kỹ thuật). */
const LEAD_CORE_FIELD_LABELS: Record<string, string> = {
  fullName: 'Họ tên',
  systemCode: 'Mã hệ thống',
  customerId: 'Mã khách hàng',
  dateOfBirth: 'Ngày sinh',
  gender: 'Giới tính',
  placeOfBirth: 'Nơi sinh',
  nationalId: 'CCCD / Hộ chiếu',
  nationalIdNotAvailable: 'Chưa có CCCD',
  nationalIdHash: 'Mã CCCD (hệ thống)',
  uniqueHash: 'Mã chống trùng (hệ thống)',
  studentEmail: 'Email sinh viên',
  ethnicity: 'Dân tộc',
  phone: 'Điện thoại sinh viên',
  parentPhone: 'Điện thoại người liên hệ',
  permanentAddress: 'Địa chỉ thường trú',
  currentResidence: 'Nơi ở hiện tại',
  address: 'Địa chỉ',
  source1: 'Nguồn 1',
  source2: 'Nguồn 2',
  source: 'Nguồn tiếp nhận (ghi chú)',
  fatherName: 'Họ tên bố',
  fatherPhone: 'SĐT bố',
  motherName: 'Họ tên mẹ',
  motherPhone: 'SĐT mẹ',
  guardian: 'Người giám hộ',
  scholarship1Id: 'Học bổng 1',
  scholarship2Id: 'Học bổng 2',
  province: 'Tỉnh / TP',
  hanoiArea: 'Quận / huyện',
  school: 'Trường THPT',
  schoolType: 'Loại hình trường',
  gradeClass: 'Lớp',
  academicPerformance: 'Học lực',
  graduationScore: 'Điểm tốt nghiệp',
  educationLevel: 'Hình thức / hệ',
  studyIntention: 'Hình thức học',
  majorInterest: 'Ngành quan tâm',
  applicantCategory: 'Đối tượng',
  financialStatus: 'Tình hình tài chính',
  aspirations: 'Nguyện vọng',
  hobbies: 'Sở thích',
  fieldTripNotes: 'Ghi chú trải nghiệm',
  profileNote1: 'Ghi chú hồ sơ 1',
  profileNote2: 'Ghi chú hồ sơ 2',
  otherAttentionNotes: 'Lưu ý khác',
  campus: 'Cơ sở',
  schoolYear: 'Niên khóa',
}

const HIDDEN_CORE_AUDIT_KEYS = new Set(['uniqueHash', 'nationalIdHash'])

export function leadCoreFieldLabelVi(key: string): string {
  return LEAD_CORE_FIELD_LABELS[key] ?? key
}

/** Mô tả audit: «Cập nhật thông tin hồ sơ (3 mục): Nguồn 2, Họ tên bố, …» */
export function describeLeadCorePatchAudit(corePatch: Record<string, unknown>): string {
  const keys = Object.keys(corePatch).filter((k) => !HIDDEN_CORE_AUDIT_KEYS.has(k))
  if (!keys.length) {
    return 'Cập nhật thông tin hồ sơ'
  }
  const labels = keys.map(leadCoreFieldLabelVi)
  const shown = labels.slice(0, 12)
  const more = labels.length > 12 ? '…' : ''
  return `Cập nhật thông tin hồ sơ (${labels.length} mục): ${shown.join(', ')}${more}`
}
