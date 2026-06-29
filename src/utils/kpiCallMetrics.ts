/** Phân loại thời lượng cuộc gọi CONNECTED theo spec KPI PDF. */
export type CallDurationClass = 'none' | 'lead_cham' | 'answered_valid'

export function billSecondsFromCall(call: { billSeconds?: number; answerSeconds?: number }): number {
  return Math.max(0, Number(call.billSeconds ?? call.answerSeconds ?? 0) || 0)
}

export function classifyConnectedCallDuration(
  billSec: number,
  opts: { leadChamMinSeconds?: number; leadChamMaxExclusive?: number; validMinSeconds?: number },
): CallDurationClass {
  const minCham = opts.leadChamMinSeconds ?? 1
  const maxChamEx = opts.leadChamMaxExclusive ?? 30
  const validMin = opts.validMinSeconds ?? 30
  if (billSec < minCham) return 'none'
  if (billSec < maxChamEx) return 'lead_cham'
  if (billSec >= validMin) return 'answered_valid'
  return 'none'
}

export function isLeadChamCall(
  connected: boolean,
  billSec: number,
  opts?: { leadChamMinSeconds?: number; leadChamMaxExclusive?: number },
): boolean {
  if (!connected) return false
  return classifyConnectedCallDuration(billSec, opts ?? {}) === 'lead_cham'
}
