import type { Lead } from '../types'

/** Một dòng ngắn cho cột / dưới tên trên danh sách hồ sơ. */
export function formatLeadLastCallAiLine(lead: Pick<Lead, 'lastCallAiSummary' | 'lastCallAiReadiness'>): string | null {
  const summary = lead.lastCallAiSummary?.trim()
  if (!summary) return null
  const readiness = lead.lastCallAiReadiness?.trim()
  if (readiness) return `${readiness} · ${summary}`
  return summary
}
