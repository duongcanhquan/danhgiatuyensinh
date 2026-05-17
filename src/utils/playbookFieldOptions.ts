import type { PlaybookConditionField, PlaybookOperator } from '../types'

export const PLAYBOOK_FIELD_OPTIONS: { value: PlaybookConditionField; label: string }[] = [
  { value: 'province', label: 'Tỉnh / thành' },
  { value: 'region', label: 'Vùng (region)' },
  { value: 'majorInterest', label: 'Ngành quan tâm' },
  { value: 'major', label: 'Ngành (major)' },
  { value: 'educationLevel', label: 'Hệ đào tạo / ngành (educationLevel)' },
  { value: 'priorityTag', label: 'Nhãn HOT / WARM / COLD' },
  { value: 'pipelineStatus', label: 'Giai đoạn funnel' },
  { value: 'status', label: 'Tình trạng TVV (CRM)' },
  { value: 'schoolType', label: 'Loại trường' },
  { value: 'financialStatus', label: 'Tài chính' },
  { value: 'academicLevel', label: 'Học lực' },
  { value: 'studyIntention', label: 'Ý định học' },
  { value: 'source', label: 'Nguồn lead' },
  { value: 'description', label: 'Mô tả hồ sơ' },
]

export const PLAYBOOK_OPERATOR_OPTIONS: { value: PlaybookOperator; label: string; hint?: string }[] = [
  { value: 'EQUALS', label: 'Bằng', hint: 'Giá trị trường trùng khớp' },
  { value: 'CONTAINS', label: 'Chứa', hint: 'Trường chứa chuỗi' },
  { value: 'IN', label: 'Thuộc danh sách', hint: 'Nhiều giá trị, cách nhau bằng dấu phẩy' },
  { value: 'NOT_IN', label: 'Không thuộc danh sách', hint: 'Nhiều giá trị, cách nhau bằng dấu phẩy' },
]

export const PLAYBOOK_FIELD_LABEL: Record<string, string> = Object.fromEntries(
  PLAYBOOK_FIELD_OPTIONS.map((o) => [o.value, o.label]),
)

export const PLAYBOOK_OPERATOR_LABEL: Record<string, string> = Object.fromEntries(
  PLAYBOOK_OPERATOR_OPTIONS.map((o) => [o.value, o.label]),
)
