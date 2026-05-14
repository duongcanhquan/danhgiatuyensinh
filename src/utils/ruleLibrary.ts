import type {
  LeadScoringSignalKey,
  RuleCategory,
  ScoringRuleBlock,
  ScoringRuleConditionRow,
  ScoringRuleTemplateDoc,
} from '../types'
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
    hint: 'IN_LIST — thành phố lớn + tỉnh miền núi phía Bắc (khớp bỏ dấu; có thể thêm synonyms trên masterData)',
    build: () =>
      makeBlock({
        category: 'demographics',
        label: 'Vùng / miền',
        targetField: 'region',
        maxWeight: 25,
        rows: [
          row({
            condition: 'IN_LIST',
            value: ['Hà Nội', 'TP. Hồ Chí Minh', 'Đà Nẵng', 'Cần Thơ'],
            allocationKind: 'absolute',
            allocationValue: 15,
          }),
          row({
            condition: 'IN_LIST',
            value: [
              'Hà Giang',
              'Cao Bằng',
              'Lào Cai',
              'Lạng Sơn',
              'Bắc Kạn',
              'Tuyên Quang',
              'Thái Nguyên',
              'Phú Thọ',
              'Yên Bái',
              'Sơn La',
              'Điện Biên',
              'Lai Châu',
              'Hòa Bình',
            ],
            allocationKind: 'absolute',
            allocationValue: 12,
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
    title: 'Học lực (thang rank)',
    hint: 'EQUALS từng mức — Xuất sắc → Yếu; engine đã bỏ dấu khi so',
    build: () =>
      makeBlock({
        category: 'academic',
        label: 'Học lực',
        targetField: 'academicLevel',
        maxWeight: 50,
        rows: [
          row({ condition: 'EQUALS', value: 'Xuất sắc', allocationKind: 'absolute', allocationValue: 50 }),
          row({ condition: 'EQUALS', value: 'Giỏi', allocationKind: 'absolute', allocationValue: 40 }),
          row({ condition: 'EQUALS', value: 'Khá', allocationKind: 'absolute', allocationValue: 25 }),
          row({ condition: 'EQUALS', value: 'Trung bình', allocationKind: 'absolute', allocationValue: 12 }),
          row({ condition: 'EQUALS', value: 'Yếu', allocationKind: 'absolute', allocationValue: -8 }),
        ],
      }),
  },
  {
    key: 'acad-major-align',
    category: 'academic',
    title: 'Ngành quan tâm vs đào tạo (tự suy)',
    hint: 'Trường `majorTrainingAlignment` — aligned / outside_or_unknown / empty (cần master ngành + buckets khi chấm)',
    build: () =>
      makeBlock({
        category: 'academic',
        label: 'Khớp ngành đào tạo',
        targetField: 'majorTrainingAlignment',
        maxWeight: 20,
        rows: [
          row({
            condition: 'EQUALS',
            value: 'aligned',
            allocationKind: 'absolute',
            allocationValue: 12,
          }),
          row({
            condition: 'EQUALS',
            value: 'outside_or_unknown',
            allocationKind: 'absolute',
            allocationValue: -12,
          }),
        ],
      }),
  },
  {
    key: 'acad-school-type',
    category: 'academic',
    title: 'Loại hình trường (mã chuẩn hoá)',
    hint: 'Dùng `schoolTypeKey`: PUBLIC / PRIVATE / INTERNATIONAL / LIEN_KET / UNKNOWN — cộng trừ khác nhau',
    build: () =>
      makeBlock({
        category: 'academic',
        label: 'Loại trường (schoolTypeKey)',
        targetField: 'schoolTypeKey',
        maxWeight: 22,
        rows: [
          row({
            condition: 'EQUALS',
            value: 'LIEN_KET',
            allocationKind: 'absolute',
            allocationValue: 20,
          }),
          row({
            condition: 'EQUALS',
            value: 'INTERNATIONAL',
            allocationKind: 'absolute',
            allocationValue: 16,
          }),
          row({
            condition: 'EQUALS',
            value: 'PRIVATE',
            allocationKind: 'percent_of_max',
            allocationValue: 65,
          }),
          row({
            condition: 'EQUALS',
            value: 'PUBLIC',
            allocationKind: 'absolute',
            allocationValue: 8,
          }),
          row({
            condition: 'EQUALS',
            value: 'UNKNOWN',
            allocationKind: 'absolute',
            allocationValue: -6,
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

/** Tiền tố key mẫu lưu Firestore — ghép với doc id. */
export const CUSTOM_RULE_TEMPLATE_PREFIX = 'custom:' as const

export function buildScoringBlockFromTemplateDoc(doc: ScoringRuleTemplateDoc): ScoringRuleBlock {
  return {
    id: newId(),
    category: doc.category,
    label: doc.label,
    targetField: doc.targetField,
    maxWeight: doc.maxWeight,
    rows: doc.rows.map((r) => ({
      id: newId(),
      condition: r.condition,
      value: r.value,
      allocationKind: r.allocationKind,
      allocationValue: r.allocationValue,
    })),
  }
}

export function customRuleTemplateFromDoc(doc: ScoringRuleTemplateDoc): RuleLibraryTemplate {
  return {
    key: `${CUSTOM_RULE_TEMPLATE_PREFIX}${doc.id}`,
    category: doc.category,
    title: doc.title,
    hint: doc.hint.trim() || 'Mẫu tùy chỉnh (thư viện Firestore)',
    build: () => buildScoringBlockFromTemplateDoc(doc),
  }
}

export function getRuleLibraryTemplates(): readonly RuleLibraryTemplate[] {
  return ALL_RULE_TEMPLATES
}

export function createBlockFromTemplateKey(
  key: string,
  extras?: readonly RuleLibraryTemplate[],
): ScoringRuleBlock | null {
  const fromExtra = extras?.find((x) => x.key === key)
  if (fromExtra) return fromExtra.build()
  const t = ALL_RULE_TEMPLATES.find((x) => x.key === key)
  return t ? t.build() : null
}
