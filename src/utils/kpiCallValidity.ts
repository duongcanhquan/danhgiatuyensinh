import type { OmicallCallRecord } from '../types'

/** HL trên client — khớp mặc định server (≥30s + có hồ sơ + TVV + bắt máy). */
export function evaluateClientValidCall(params: {
  billSeconds: number
  leadId?: string
  counselorUid?: string
  minBillSeconds?: number
  outcome?: string
}): { isValidCall: boolean; invalidReason?: string } {
  const min = params.minBillSeconds ?? 30
  if (!params.counselorUid?.trim()) return { isValidCall: false, invalidReason: 'missing_counselor' }
  if (!params.leadId?.trim()) return { isValidCall: false, invalidReason: 'missing_lead' }
  if (params.outcome && params.outcome !== 'CONNECTED') {
    return { isValidCall: false, invalidReason: 'not_connected' }
  }
  if (params.billSeconds < min) return { isValidCall: false, invalidReason: 'short_call' }
  return { isValidCall: true }
}

/** Dùng cờ true nếu có; false/thiếu thì suy luận (sửa stamp client cũ 45s). */
export function resolveCallIsValid(
  c: Pick<OmicallCallRecord, 'isValidCall' | 'billSeconds' | 'leadId' | 'counselorUid' | 'outcome'>,
  minBillSeconds = 30,
): boolean {
  if (c.isValidCall === true) return true
  return evaluateClientValidCall({
    billSeconds: c.billSeconds || 0,
    leadId: c.leadId ?? undefined,
    counselorUid: c.counselorUid ?? undefined,
    minBillSeconds,
    outcome: c.outcome ?? undefined,
  }).isValidCall
}
