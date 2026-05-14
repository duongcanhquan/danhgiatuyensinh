/**
 * Tín hiệu «Hành vi» / «Rủi ro» cho chấm điểm — lưu trên `leads.scoringSignals` (object, chỉ các khóa = true).
 * Engine đọc qua các trường phẳng `sig_*` do {@link scoringSignalsToEvaluationFlat} sinh ra.
 */
import type { LeadScoringSignalKey, LeadScoringSignals } from '../types'

export const SCORING_SIGNAL_META: Record<
  LeadScoringSignalKey,
  { evalField: string; group: 'behavior' | 'risk'; label: string; defaultPoints: number }
> = {
  askedTuition: {
    evalField: 'sig_askedTuition',
    group: 'behavior',
    label: 'Hỏi học phí',
    defaultPoints: 25,
  },
  askedCareerAfterGrad: {
    evalField: 'sig_askedCareerAfterGrad',
    group: 'behavior',
    label: 'Hỏi việc làm sau ra trường',
    defaultPoints: 25,
  },
  addedZalo: {
    evalField: 'sig_addedZalo',
    group: 'behavior',
    label: 'Add Zalo',
    defaultPoints: 25,
  },
  sentTranscript: {
    evalField: 'sig_sentTranscript',
    group: 'behavior',
    label: 'Gửi học bạ',
    defaultPoints: 30,
  },
  consultedParents: {
    evalField: 'sig_consultedParents',
    group: 'behavior',
    label: 'Tư vấn được PH',
    defaultPoints: 35,
  },
  filledRegistrationForm: {
    evalField: 'sig_filledRegistrationForm',
    group: 'behavior',
    label: 'Điền form đăng ký',
    defaultPoints: 35,
  },
  silentOver7Days: {
    evalField: 'sig_silentOver7Days',
    group: 'risk',
    label: 'Không phản hồi tin nhắn / gọi > 7 ngày',
    defaultPoints: -15,
  },
  wantsUniversityAtAllCosts: {
    evalField: 'sig_wantsUniversityAtAllCosts',
    group: 'risk',
    label: 'Muốn học ĐH bằng mọi giá',
    defaultPoints: -35,
  },
  parentsWantUniversityOnly: {
    evalField: 'sig_parentsWantUniversityOnly',
    group: 'risk',
    label: 'PH muốn học đại học',
    defaultPoints: -25,
  },
  enrolledElsewhere: {
    evalField: 'sig_enrolledElsewhere',
    group: 'risk',
    label: 'Đã nhập học CĐ/ĐH khác',
    defaultPoints: -50,
  },
}

export const ALL_SCORING_SIGNAL_KEYS = Object.keys(SCORING_SIGNAL_META) as LeadScoringSignalKey[]

export function scoringSignalsToEvaluationFlat(s: LeadScoringSignals | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of ALL_SCORING_SIGNAL_KEYS) {
    const { evalField } = SCORING_SIGNAL_META[key]
    out[evalField] = s?.[key] === true ? '1' : ''
  }
  return out
}

export function parseScoringSignalsFromFirestore(raw: unknown): LeadScoringSignals | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const out: LeadScoringSignals = {}
  for (const key of ALL_SCORING_SIGNAL_KEYS) {
    if (o[key] === true) out[key] = true
  }
  return Object.keys(out).length ? out : undefined
}

export function inferSignalRuleCategory(targetField: string): 'behavior' | 'risk' | null {
  const f = targetField.trim()
  for (const key of ALL_SCORING_SIGNAL_KEYS) {
    if (SCORING_SIGNAL_META[key].evalField === f) return SCORING_SIGNAL_META[key].group
  }
  return null
}
