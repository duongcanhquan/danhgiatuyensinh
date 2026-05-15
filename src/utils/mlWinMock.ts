import type { Lead } from '../types'
import type { InfoScoreRuntime } from './infoScoreRules'
import {
  buildInfoScoreRuntime,
  getDefaultInfoScoreRules,
  infoScoreMaxRaw,
} from './infoScoreRules'

export type MlWinDisplaySource = 'firestore' | 'mvp_mock'

export type MvpBreakdownItem = {
  id: string
  label: string
  /** Điểm cộng nếu `matched` */
  pointsIfMatch: number
  matched: boolean
  hint?: string
}

/** Chi tiết công thức MVP (chỉ khi `source === 'mvp_mock'`). */
export type MvpBreakdown = {
  basePoints: number
  capMin: number
  capMax: number
  items: MvpBreakdownItem[]
  /** Tổng trước khi kẹp */
  rawScore: number
  /** Giá trị sau kẹp (trùng `mlWinProbability`) */
  clampedPercent: number
  /** Nguồn quy tắc % đầy hồ sơ */
  ruleSource?: 'builtin' | 'remote'
}

export type MlWinDisplay = {
  mlWinProbability: number
  mlExplanation: string
  source: MlWinDisplaySource
  mvpBreakdown?: MvpBreakdown
}

/** @deprecated Dùng `getDefaultInfoScoreRules()` — giữ để tương thích import cũ. */
export const MVP_INFO_SCORE_GLOBAL = {
  basePoints: 38,
  capMin: 5,
  capMax: 96,
} as const

export type MvpInfoScoreFieldRulePublic = {
  id: string
  label: string
  pointsIfMatch: number
  hint?: string
  enabled?: boolean
}

function builtinRuntime(): InfoScoreRuntime {
  return buildInfoScoreRuntime(getDefaultInfoScoreRules(), false)
}

/** Bảng trường (không matcher) — tiện cho tài liệu / test. */
export function getMvpInfoScoreFieldRulesPublic(): ReadonlyArray<MvpInfoScoreFieldRulePublic> {
  return getDefaultInfoScoreRules().fields.map(({ id, label, pointsIfMatch, hint, enabled }) => ({
    id,
    label,
    pointsIfMatch,
    hint,
    enabled,
  }))
}

export function getMvpInfoScoreMaxRaw(): number {
  return infoScoreMaxRaw(getDefaultInfoScoreRules())
}

/**
 * **Điểm thông tin**: điểm nền + các trường bật; kẹp capMin–capMax.
 * `runtime` lấy từ context — khi không truyền, dùng bản mặc định mã.
 */
export function computeMockMlWinProbability(
  lead: Lead,
  runtime?: InfoScoreRuntime | null,
): Pick<MlWinDisplay, 'mlWinProbability' | 'mlExplanation' | 'mvpBreakdown'> {
  const r = runtime ?? builtinRuntime()
  const { basePoints, capMin, capMax } = r

  const items: MvpBreakdownItem[] = [
    {
      id: 'base',
      label: 'Điểm nền (cố định)',
      pointsIfMatch: basePoints,
      matched: true,
      hint: 'Luôn áp dụng — mức khởi điểm trước khi cộng các trường thông tin trên hồ sơ.',
    },
    ...r.fields
      .filter((f) => f.enabled)
      .map((f) => ({
        id: f.id,
        label: f.label,
        pointsIfMatch: f.pointsIfMatch,
        matched: f.match(lead),
        hint: f.hint,
      })),
  ]

  let raw = 0
  for (const it of items) {
    if (it.matched) raw += it.pointsIfMatch
  }
  const clamped = Math.max(capMin, Math.min(capMax, Math.round(raw)))

  const reasons = items
    .filter((i) => i.id !== 'base' && i.matched)
    .map((i) => i.label.replace(/\s*\(.*\)\s*$/, '').toLowerCase())

  const mlExplanation =
    reasons.length > 0
      ? `Điểm thông tin (tỷ lệ hồ sơ đã có trên một người): cộng khi có ${reasons.slice(0, 5).join(', ')}${reasons.length > 5 ? '…' : ''}.`
      : 'Điểm thông tin: nhiều trường còn trống — bổ sung hồ sơ để % phản ánh đủ thông tin hơn.'

  return {
    mlWinProbability: clamped,
    mlExplanation,
    mvpBreakdown: {
      basePoints,
      capMin,
      capMax,
      items,
      rawScore: raw,
      clampedPercent: clamped,
      ruleSource: r.ruleSource,
    },
  }
}

/** Văn bản dài cho `title` / aria — đặt chuột để đọc công thức & dữ kiện. */
export function buildMlWinHoverText(ml: MlWinDisplay): string {
  if (ml.source === 'firestore') {
    return [
      'NGUỒN: Điểm thông tin đã lưu trên hồ sơ (Firestore: mlWinProbability + mlExplanation).',
      `% hiển thị: ${ml.mlWinProbability}% (kẹp 0–100) — phản ánh tỷ lệ thông tin đã ghi nhận trên một người, không phải “ước lượng” ML.`,
      '',
      'Giải thích đi kèm dữ liệu:',
      ml.mlExplanation,
    ].join('\n')
  }

  const b = ml.mvpBreakdown
  if (!b) return ml.mlExplanation

  const table = b.items
    .map((i) => {
      const mark = i.matched ? '✓' : '·'
      const pts = i.matched ? `+${i.pointsIfMatch}` : '+0'
      const h = i.hint ? `  (${i.hint})` : ''
      return `${mark} ${i.label}: ${pts}${h}`
    })
    .join('\n')

  const sourceLine =
    b.ruleSource === 'remote'
      ? 'NGUỒN: Điểm thông tin theo cấu hình trường (Firestore: scoringAux/infoScoreConfig).'
      : 'NGUỒN: Điểm thông tin mặc định trong app (chưa có cấu hình trường — có thể lưu trong Cài đặt → Chấm điểm → tab Điểm thông tin).'

  return [
    sourceLine,
    '',
    'Cách tính:',
    `  1) Cộng điểm các dòng có [✓] trong bảng dưới (điểm nền luôn tính).`,
    `  2) Điểm thô = ${b.rawScore}`,
    `  3) Chuyển thành % hiển thị = kẹp giữa ${b.capMin} và ${b.capMax}  →  ${b.clampedPercent}%`,
    '',
    'Bảng điểm (thông tin có trên hồ sơ):',
    table,
    '',
    'Tóm tắt:',
    ml.mlExplanation,
  ].join('\n')
}

export function resolveMlWinDisplay(lead: Lead, runtime?: InfoScoreRuntime | null): MlWinDisplay {
  if (
    typeof lead.mlWinProbability === 'number' &&
    !Number.isNaN(lead.mlWinProbability) &&
    lead.mlExplanation?.trim()
  ) {
    return {
      mlWinProbability: Math.max(0, Math.min(100, Math.round(lead.mlWinProbability))),
      mlExplanation: lead.mlExplanation.trim(),
      source: 'firestore',
    }
  }
  const m = computeMockMlWinProbability(lead, runtime ?? null)
  return {
    mlWinProbability: m.mlWinProbability,
    mlExplanation: m.mlExplanation,
    source: 'mvp_mock',
    mvpBreakdown: m.mvpBreakdown,
  }
}

export { mergeInfoScoreRules, parseInfoScoreDoc, getDefaultInfoScoreRules } from './infoScoreRules'
