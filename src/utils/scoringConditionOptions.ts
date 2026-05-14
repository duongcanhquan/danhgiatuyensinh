import type { ProfileScoringCondition } from '../types'

/** Nhãn UI cho điều kiện chấm điểm — ưu tiên tiếng Việt, giữ mã kỹ thuật khi cần. */
export const SCORING_CONDITION_UI_OPTIONS: { value: ProfileScoringCondition; label: string }[] = [
  { value: 'EQUALS', label: 'Bằng (chuẩn hoá: không dấu, gom khoảng trắng)' },
  { value: 'CONTAINS', label: 'Chứa — bất kỳ từ nào (phẩy, không dấu)' },
  { value: 'CONTAINS_ABBR_NORM', label: 'Chứa / viết tắt (không dấu, gộp khoảng)' },
  { value: 'CONTAINS_ALL_NORM', label: 'Phải chứa đủ các từ (cách nhau bởi dấu phẩy, không dấu)' },
  { value: 'NOT_CONTAINS_NORM', label: 'Không chứa từ nào (phẩy, không dấu)' },
  { value: 'HAS_DIGIT', label: 'Có chữ số trong chuỗi' },
  { value: 'IS_NOT_EMPTY', label: 'Không rỗng (sau chuẩn hoá)' },
  {
    value: 'IN_LIST',
    label: 'Thuộc một trong các nhóm đã liệt kê (có thể khớp với Danh mục nếu trùng tên)',
  },
  { value: 'PHONE_VN_10_DIGITS', label: 'SĐT VN: đúng 10 số' },
  { value: 'PHONE_VN_NOT_10_DIGITS', label: 'SĐT Việt Nam: khác 10 số hoặc để trống' },
]
