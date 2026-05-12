import type { Lead } from '../types'

/**
 * MVP surrogate for an ML service: deterministic win probability from profile completeness
 * (region, major, school, contact depth). Stable for the same lead fields.
 */
export function computeMockMlWinProbability(lead: Lead): { mlWinProbability: number; mlExplanation: string } {
  let score = 38
  const reasons: string[] = []

  if (lead.fullName?.trim()) {
    score += 6
    reasons.push('họ tên đầy đủ')
  }
  if (normalizePhone(lead.phone)) {
    score += 10
    reasons.push('SĐT hợp lệ')
  }
  if (lead.customerId?.trim()) {
    score += 5
    reasons.push('mã KH')
  }
  if (lead.parentPhone?.trim()) {
    score += 4
    reasons.push('SĐT phụ huynh')
  }
  if (lead.province?.trim()) {
    score += 6
    reasons.push('tỉnh/TP')
  }
  if (lead.educationLevel?.trim()) {
    score += 8
    reasons.push('hệ đào tạo')
  }
  if (lead.highSchool?.trim()) {
    score += 7
    reasons.push('trường học')
  }
  if (lead.address?.trim()) {
    score += 4
    reasons.push('địa chỉ')
  }

  const mlWinProbability = Math.max(5, Math.min(96, Math.round(score)))
  const mlExplanation =
    reasons.length > 0
      ? `Ước tính MVP (độ đầy đủ dữ liệu): cao hơn khi có ${reasons.slice(0, 5).join(', ')}${reasons.length > 5 ? '…' : ''}.`
      : 'Ước tính MVP: dữ liệu còn thiếu — bổ sung hồ sơ để mô hình (tương lai) tin cậy hơn.'

  return { mlWinProbability, mlExplanation }
}

function normalizePhone(p: string | undefined): boolean {
  const d = (p ?? '').replace(/\D/g, '')
  return d.length >= 9
}

export function resolveMlWinDisplay(lead: Lead): { mlWinProbability: number; mlExplanation: string } {
  if (
    typeof lead.mlWinProbability === 'number' &&
    !Number.isNaN(lead.mlWinProbability) &&
    lead.mlExplanation?.trim()
  ) {
    return {
      mlWinProbability: Math.max(0, Math.min(100, Math.round(lead.mlWinProbability))),
      mlExplanation: lead.mlExplanation.trim(),
    }
  }
  return computeMockMlWinProbability(lead)
}
