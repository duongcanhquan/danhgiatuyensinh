import type { LeadScoringSignalKey, RuleCategory, ScoringRuleBlock, ScoringRuleConditionRow } from '../types'
import { ALL_SCORING_SIGNAL_KEYS, SCORING_SIGNAL_META } from './leadScoringSignals'

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

const BASE_TEMPLATES: RuleLibraryTemplate[] = [
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
    key: 'phone-vn-10',
    category: 'demographics',
    title: 'SĐT sinh viên — đúng 10 số (VN)',
    hint: 'Cộng khi đủ 10 số sau chuẩn hoá; trừ khi trống / thiếu / thừa số',
    build: () =>
      makeBlock({
        category: 'demographics',
        label: 'SĐT sinh viên (độ dài VN)',
        targetField: 'phone',
        maxWeight: 15,
        rows: [
          row({
            condition: 'PHONE_VN_10_DIGITS',
            value: '',
            allocationKind: 'absolute',
            allocationValue: 15,
          }),
          row({
            condition: 'PHONE_VN_NOT_10_DIGITS',
            value: '',
            allocationKind: 'absolute',
            allocationValue: -12,
          }),
        ],
      }),
  },
  {
    key: 'src-parent-phone',
    category: 'source_engagement',
    title: 'SĐT phụ huynh — đúng 10 số (VN)',
    hint: 'Cộng khi đủ 10 số; trừ khi trống / sai độ dài (không còn chỉ «có nhập»)',
    build: () =>
      makeBlock({
        category: 'source_engagement',
        label: 'SĐT phụ huynh (độ dài VN)',
        targetField: 'parentPhone',
        maxWeight: 12,
        rows: [
          row({
            condition: 'PHONE_VN_10_DIGITS',
            value: '',
            allocationKind: 'absolute',
            allocationValue: 12,
          }),
          row({
            condition: 'PHONE_VN_NOT_10_DIGITS',
            value: '',
            allocationKind: 'absolute',
            allocationValue: -10,
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

function signalRuleTemplate(key: LeadScoringSignalKey): RuleLibraryTemplate {
  const m = SCORING_SIGNAL_META[key]
  const pts = m.defaultPoints
  const ptsLabel = pts >= 0 ? `+${pts}` : String(pts)
  return {
    key: `sig-${key}`,
    category: m.group as RuleCategory,
    title: `${m.label} (${ptsLabel})`,
    hint: 'Cờ trên hồ sơ (màn chi tiết → Hành vi & Rủi ro). TVV bật khi đúng tình huống.',
    build: () =>
      makeBlock({
        category: m.group as RuleCategory,
        label: m.label,
        targetField: m.evalField,
        maxWeight: Math.max(Math.abs(pts), 1),
        rows: [
          row({
            condition: 'IS_NOT_EMPTY',
            value: '',
            allocationKind: 'absolute',
            allocationValue: pts,
          }),
        ],
      }),
  }
}

const SIGNAL_RULE_TEMPLATES: RuleLibraryTemplate[] = ALL_SCORING_SIGNAL_KEYS.map(signalRuleTemplate)

const ALL_RULE_TEMPLATES: RuleLibraryTemplate[] = [...BASE_TEMPLATES, ...SIGNAL_RULE_TEMPLATES]

export function getRuleLibraryTemplates(): readonly RuleLibraryTemplate[] {
  return ALL_RULE_TEMPLATES
}

export function createBlockFromTemplateKey(key: string): ScoringRuleBlock | null {
  const t = ALL_RULE_TEMPLATES.find((x) => x.key === key)
  return t ? t.build() : null
}
