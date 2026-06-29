export function billSecondsFromCall(call: { billSeconds?: number; answerSeconds?: number }): number {
  return Math.max(0, Number(call.billSeconds ?? call.answerSeconds ?? 0) || 0)
}

export function isLeadChamCall(
  connected: boolean,
  billSec: number,
  opts: { leadChamMinSeconds?: number; leadChamMaxExclusive?: number },
): boolean {
  if (!connected) return false
  const minCham = opts.leadChamMinSeconds ?? 1
  const maxEx = opts.leadChamMaxExclusive ?? 30
  return billSec >= minCham && billSec < maxEx
}
