import type { RuleCategory, ScoringRuleBlock, ScoringRuleConditionRow } from '../types'

function newId(): string {
  return crypto.randomUUID()
}

function row(p: Omit<ScoringRuleConditionRow, 'id'>): ScoringRuleConditionRow {
  return { id: newId(), ...p }
}

function makeBlock(p: Omit<ScoringRuleBlock, 'id'>): ScoringRuleBlock {
  return { id: newId(), ...p }
}

export type RuleLibraryTemplate = {
  key: string
  category: RuleCategory
  title: string
  hint: string
  build: () => ScoringRuleBlock
}

export const RULE_TEMPLATE_DRAG_MIME = 'application/x-vietmy-rule-template'

const TEMPLATES: RuleLibraryTemplate[] = [
  {
    key: 'demo-region',
    category: 'demographics',
    title: 'Vùng / miền',
    hint: 'IN_LIST — ưu tiên theo danh sách tỉnh/thành',
    build: () =>
      makeBlock({
        category: 'demographics',
        label: 'Vùng / miền',
        targetField: 'region',
        maxWeight: 15,
        rows: [
          row({
            condition: 'IN_LIST',
            value: ['Hà Nội', 'TP. Hồ Chí Minh', 'Đà Nẵng'],
            allocationKind: 'absolute',
            allocationValue: 15,
          }),
        ],
      }),
  },
  {
    key: 'demo-province',
    category: 'demographics',
    title: 'Tỉnh / thành (province)',
    hint: 'EQUALS — khớp chính xác tên tỉnh',
    build: () =>
      makeBlock({
        category: 'demographics',
        label: 'Tỉnh / thành',
        targetField: 'province',
        maxWeight: 12,
        rows: [
          row({
            condition: 'EQUALS',
            value: 'Hà Nội',
            allocationKind: 'absolute',
            allocationValue: 12,
          }),
        ],
      }),
  },
  {
    key: 'demo-gender',
    category: 'demographics',
    title: 'Giới tính',
    hint: 'EQUALS — Nam / Nữ / Khác',
    build: () =>
      makeBlock({
        category: 'demographics',
        label: 'Giới tính',
        targetField: 'gender',
        maxWeight: 8,
        rows: [
          row({ condition: 'EQUALS', value: 'Nữ', allocationKind: 'absolute', allocationValue: 8 }),
          row({ condition: 'EQUALS', value: 'Nam', allocationKind: 'absolute', allocationValue: 5 }),
        ],
      }),
  },
  {
    key: 'acad-performance',
    category: 'academic',
    title: 'Học lực',
    hint: 'Nhiều nhánh trong một khối — max weight ví dụ 40',
    build: () =>
      makeBlock({
        category: 'academic',
        label: 'Học lực',
        targetField: 'academicLevel',
        maxWeight: 40,
        rows: [
          row({ condition: 'EQUALS', value: 'Giỏi', allocationKind: 'absolute', allocationValue: 40 }),
          row({ condition: 'EQUALS', value: 'Khá', allocationKind: 'absolute', allocationValue: 20 }),
          row({ condition: 'EQUALS', value: 'Trung bình', allocationKind: 'absolute', allocationValue: 10 }),
        ],
      }),
  },
  {
    key: 'acad-school-type',
    category: 'academic',
    title: 'Loại trường THPT',
    hint: 'EQUALS — PUBLIC / PRIVATE / …',
    build: () =>
      makeBlock({
        category: 'academic',
        label: 'Loại trường',
        targetField: 'schoolType',
        maxWeight: 15,
        rows: [
          row({
            condition: 'EQUALS',
            value: 'INTERNATIONAL',
            allocationKind: 'absolute',
            allocationValue: 15,
          }),
          row({
            condition: 'EQUALS',
            value: 'PRIVATE',
            allocationKind: 'percent_of_max',
            allocationValue: 70,
          }),
        ],
      }),
  },
  {
    key: 'src-lead-source',
    category: 'source_engagement',
    title: 'Nguồn tiếp nhận (chiến dịch)',
    hint: 'CONTAINS — Online Form, Offline Event, …',
    build: () =>
      makeBlock({
        category: 'source_engagement',
        label: 'Nguồn tiếp nhận',
        targetField: 'leadSource',
        maxWeight: 18,
        rows: [
          row({
            condition: 'CONTAINS',
            value: 'online',
            allocationKind: 'absolute',
            allocationValue: 18,
          }),
          row({
            condition: 'CONTAINS',
            value: 'offline',
            allocationKind: 'absolute',
            allocationValue: 12,
          }),
        ],
      }),
  },
  {
    key: 'src-technical-source',
    category: 'source_engagement',
    title: 'Kênh kỹ thuật (source)',
    hint: 'WEB_FORM, MANUAL, …',
    build: () =>
      makeBlock({
        category: 'source_engagement',
        label: 'Kênh nhập (source)',
        targetField: 'source',
        maxWeight: 10,
        rows: [
          row({
            condition: 'EQUALS',
            value: 'WEB_FORM',
            allocationKind: 'absolute',
            allocationValue: 10,
          }),
        ],
      }),
  },
  {
    key: 'src-parent-phone',
    category: 'source_engagement',
    title: 'Có SĐT phụ huynh',
    hint: 'IS_NOT_EMPTY — tăng điểm tương tác',
    build: () =>
      makeBlock({
        category: 'source_engagement',
        label: 'SĐT phụ huynh',
        targetField: 'parentPhone',
        maxWeight: 12,
        rows: [
          row({
            condition: 'IS_NOT_EMPTY',
            value: '',
            allocationKind: 'absolute',
            allocationValue: 12,
          }),
        ],
      }),
  },
  {
    key: 'psy-aspirations',
    category: 'psychographics',
    title: 'Nguyện vọng (aspirations)',
    hint: 'CONTAINS — từ khóa ngành / trường mơ ước',
    build: () =>
      makeBlock({
        category: 'psychographics',
        label: 'Nguyện vọng',
        targetField: 'aspirations',
        maxWeight: 20,
        rows: [
          row({
            condition: 'CONTAINS',
            value: 'y dược',
            allocationKind: 'absolute',
            allocationValue: 20,
          }),
          row({
            condition: 'CONTAINS',
            value: 'công nghệ',
            allocationKind: 'absolute',
            allocationValue: 15,
          }),
        ],
      }),
  },
  {
    key: 'psy-hobbies',
    category: 'psychographics',
    title: 'Sở thích (hobbies)',
    hint: 'CONTAINS — CLB, thể thao, nghệ thuật',
    build: () =>
      makeBlock({
        category: 'psychographics',
        label: 'Sở thích',
        targetField: 'hobbies',
        maxWeight: 12,
        rows: [
          row({
            condition: 'CONTAINS',
            value: 'âm nhạc',
            allocationKind: 'absolute',
            allocationValue: 12,
          }),
        ],
      }),
  },
  {
    key: 'psy-field-notes',
    category: 'psychographics',
    title: 'Ghi chú đi trường',
    hint: 'CONTAINS — insight từ field trip',
    build: () =>
      makeBlock({
        category: 'psychographics',
        label: 'Ghi chú đi trường',
        targetField: 'fieldTripNotes',
        maxWeight: 16,
        rows: [
          row({
            condition: 'CONTAINS',
            value: 'nhiệt tình',
            allocationKind: 'percent_of_max',
            allocationValue: 100,
          }),
        ],
      }),
  },
  {
    key: 'ai-sentiment',
    category: 'ai_insights',
    title: 'AI sentiment score',
    hint: 'So khớp chuỗi hoá từ số (0.8, 80, …)',
    build: () =>
      makeBlock({
        category: 'ai_insights',
        label: 'AI sentiment',
        targetField: 'aiSentimentScore',
        maxWeight: 14,
        rows: [
          row({
            condition: 'CONTAINS',
            value: '0.8',
            allocationKind: 'absolute',
            allocationValue: 14,
          }),
          row({
            condition: 'IS_NOT_EMPTY',
            value: '',
            allocationKind: 'absolute',
            allocationValue: 6,
          }),
        ],
      }),
  },
]

export function getRuleLibraryTemplates(): readonly RuleLibraryTemplate[] {
  return TEMPLATES
}

export function createBlockFromTemplateKey(key: string): ScoringRuleBlock | null {
  const t = TEMPLATES.find((x) => x.key === key)
  return t ? t.build() : null
}
