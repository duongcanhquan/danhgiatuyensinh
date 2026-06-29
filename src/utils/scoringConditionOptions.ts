import type { ProfileScoringCondition } from '../types'

/**
 * Nhãn UI cho điều kiện chấm điểm — mô tả rõ hành vi so khớp để chỉnh profile / mẫu quy tắc.
 * Giá trị ô «Giá trị» (value): tùy điều kiện — một chuỗi, nhiều từ cách phẩy, hoặc danh sách cho IN_LIST.
 */
export const SCORING_CONDITION_UI_OPTIONS: { value: ProfileScoringCondition; label: string }[] = [
  {
    value: 'EQUALS',
    label:
      'EQUALS — Bằng (sau chuẩn hoá: bỏ dấu, gom khoảng trắng). Giá trị: một chuỗi duy nhất cần trùng toàn bộ.',
  },
  {
    value: 'CONTAINS',
    label:
      'CONTAINS — Chứa bất kỳ từ khóa nào. Giá trị: nhiều từ cách nhau bởi dấu phẩy; mỗi từ so không dấu / không phân biệt hoa thường.',
  },
  {
    value: 'CONTAINS_ABBR_NORM',
    label:
      'CONTAINS_ABBR_NORM — Như CONTAINS + khớp viết tắt chữ đầu hoặc chuỗi dính (vd. cntt, tphcm).',
  },
  {
    value: 'CONTAINS_ALL_NORM',
    label:
      'CONTAINS_ALL_NORM — Lead phải chứa đủ mọi đoạn (phẩy); AND sau bỏ dấu. Ví dụ: dai hoc, ha noi.',
  },
  {
    value: 'NOT_CONTAINS_NORM',
    label:
      'NOT_CONTAINS_NORM — Loại trừ: nếu chứa bất kỳ từ nào (phẩy, không dấu) thì không khớp. Trống = luôn khớp.',
  },
  {
    value: 'HAS_DIGIT',
    label: 'HAS_DIGIT — Chuỗi có ít nhất một chữ số (mã, năm…). Không cần nhập giá trị.',
  },
  {
    value: 'IS_NOT_EMPTY',
    label: 'IS_NOT_EMPTY — Sau chuẩn hoá không rỗng. Dùng kiểm tra đã có dữ liệu cột (ngày sinh, ghi chú…).',
  },
  {
    value: 'IN_LIST',
    label:
      'IN_LIST — Giá trị lead thuộc một trong các mục (phẩy). Nếu có Danh mục master trùng targetField hoặc map cố định (tỉnh, học lực…), có thể khớp theo alias danh mục.',
  },
  {
    value: 'PHONE_VN_10_DIGITS',
    label: 'PHONE_VN_10_DIGITS — Số điện thoại VN đúng 10 chữ số (sau chuẩn +84 → 0…). Áp cho targetField phone/parentPhone.',
  },
  {
    value: 'PHONE_VN_NOT_10_DIGITS',
    label:
      'PHONE_VN_NOT_10_DIGITS — SĐT khác 10 số VN hoặc trống. Dùng cảnh báo / điểm âm khi SĐT chưa chuẩn.',
  },
]
