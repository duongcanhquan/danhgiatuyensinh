import type { ProfileScoringCondition } from '../types'

/** Nhãn UI cho điều kiện chấm điểm — ưu tiên tiếng Việt, giữ mã kỹ thuật khi cần. */
export const SCORING_CONDITION_UI_OPTIONS: { value: ProfileScoringCondition; label: string }[] = [
  { value: 'EQUALS', label: 'Bằng (chuẩn hoá: không dấu, gom khoảng trắng)' },
  { value: 'CONTAINS', label: 'Chứa — bất kỳ từ nào (phẩy, không dấu)' },
  { value: 'CONTAINS_ABBR_NORM', label: 'Chứa / viết tắt (không dấu, gộp khoảng)' },
  { value: 'CONTAINS_ALL_NORM', label: 'Chứa tất cả từ (AND, phẩy, không dấu)' },
  { value: 'NOT_CONTAINS_NORM', label: 'Không chứa từ nào (phẩy, không dấu)' },
  { value: 'HAS_DIGIT', label: 'Có chữ số trong chuỗi' },
  { value: 'IS_NOT_EMPTY', label: 'Không rỗng (sau chuẩn hoá)' },
  { value: 'IN_LIST', label: 'IN_LIST (danh sách / danh mục master)' },
  { value: 'PHONE_VN_10_DIGITS', label: 'SĐT VN: đúng 10 số' },
  { value: 'PHONE_VN_NOT_10_DIGITS', label: 'SĐT VN: ≠10 số hoặc trống' },
]
