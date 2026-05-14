import type { Lead } from '../types'
import { scoringPhoneNationalDigits } from './scoringEngine'

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
}

export type MlWinDisplay = {
  mlWinProbability: number
  mlExplanation: string
  source: MlWinDisplaySource
  mvpBreakdown?: MvpBreakdown
}

const MVP_BASE = 38
const MVP_CAP_MIN = 5
const MVP_CAP_MAX = 96

function studentPhoneTenDigits(lead: Lead): boolean {
  return scoringPhoneNationalDigits(lead.phone ?? '').length === 10
}

/**
 * **Điểm thông tin** (MVP trong app): tỷ lệ mức có thông tin / hồ sơ trên một người —
 * **không phải** xác suất thắng ML. Điểm nền + từng trường điền; **kẹp MVP_CAP_MIN…MVP_CAP_MAX** rồi hiển thị như %.
 */
export function computeMockMlWinProbability(lead: Lead): Pick<MlWinDisplay, 'mlWinProbability' | 'mlExplanation' | 'mvpBreakdown'> {
  const items: MvpBreakdownItem[] = [
    {
      id: 'base',
      label: 'Điểm nền (cố định)',
      pointsIfMatch: MVP_BASE,
      matched: true,
      hint: 'Luôn áp dụng — mức khởi điểm trước khi cộng các trường thông tin trên hồ sơ.',
    },
    {
      id: 'fullName',
      label: 'Họ tên sinh viên',
      pointsIfMatch: 6,
      matched: Boolean(lead.fullName?.trim()),
    },
    {
      id: 'phone',
      label: 'SĐT sinh viên (chuẩn VN, đúng 10 số)',
      pointsIfMatch: 10,
      matched: studentPhoneTenDigits(lead),
      hint: 'Giống chấm điểm: chỉ số, +84→0…, đủ 10 số mới cộng.',
    },
    {
      id: 'customerId',
      label: 'Mã khách hàng',
      pointsIfMatch: 5,
      matched: Boolean(lead.customerId?.trim()),
    },
    {
      id: 'parentPhone',
      label: 'SĐT người liên hệ (có nhập)',
      pointsIfMatch: 4,
      matched: Boolean(lead.parentPhone?.trim()),
      hint: 'Chỉ cần có nội dung — không bắt 10 số như SĐT SV.',
    },
    {
      id: 'province',
      label: 'Tỉnh / thành phố',
      pointsIfMatch: 6,
      matched: Boolean(lead.province?.trim()),
    },
    {
      id: 'educationLevel',
      label: 'Hệ đào tạo / ngành quan tâm',
      pointsIfMatch: 8,
      matched: Boolean(lead.educationLevel?.trim()),
    },
    {
      id: 'highSchool',
      label: 'Trường học',
      pointsIfMatch: 7,
      matched: Boolean(lead.highSchool?.trim()),
    },
    {
      id: 'address',
      label: 'Địa chỉ',
      pointsIfMatch: 4,
      matched: Boolean(lead.address?.trim()),
    },
  ]

  let raw = 0
  for (const it of items) {
    if (it.matched) raw += it.pointsIfMatch
  }
  const clamped = Math.max(MVP_CAP_MIN, Math.min(MVP_CAP_MAX, Math.round(raw)))

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
      basePoints: MVP_BASE,
      capMin: MVP_CAP_MIN,
      capMax: MVP_CAP_MAX,
      items,
      rawScore: raw,
      clampedPercent: clamped,
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

  return [
    'NGUỒN: Điểm thông tin do app tính (MVP) — tỷ lệ mức có thông tin / hồ sơ trên một người; không phải xác suất thắng ML.',
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

export function resolveMlWinDisplay(lead: Lead): MlWinDisplay {
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
  const m = computeMockMlWinProbability(lead)
  return {
    mlWinProbability: m.mlWinProbability,
    mlExplanation: m.mlExplanation,
    source: 'mvp_mock',
    mvpBreakdown: m.mvpBreakdown,
  }
}
