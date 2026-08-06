import type { Lead } from '../types'

export type AnalyticsScopeFilters = {
  teamLeadUid: string
  counselorUid: string
}

/** Map trưởng nhóm → danh sách TVV trong nhóm (managedCounselorIds). */
export function counselorIdsForTeamLead(
  teamLeadUid: string,
  teamLeads: Array<{ id: string; managedCounselorIds?: string[] | null }>,
): Set<string> | null {
  const id = teamLeadUid.trim()
  if (!id) return null
  const lead = teamLeads.find((u) => u.id === id)
  if (!lead) return new Set()
  return new Set((lead.managedCounselorIds ?? []).map(String))
}

export function leadAssigneeUid(lead: Pick<Lead, 'assignedTo' | 'assignedCounselorId'>): string {
  return String(lead.assignedTo ?? lead.assignedCounselorId ?? '').trim()
}

/** Lọc hồ sơ theo nhóm / TVV cho báo cáo phân tích. */
export function filterLeadsForAnalyticsScope<T extends Pick<Lead, 'assignedTo' | 'assignedCounselorId'>>(
  leads: T[],
  filters: AnalyticsScopeFilters,
  teamLeads: Array<{ id: string; managedCounselorIds?: string[] | null }>,
): T[] {
  const counselor = filters.counselorUid.trim()
  const teamSet = counselorIdsForTeamLead(filters.teamLeadUid, teamLeads)

  return leads.filter((l) => {
    const uid = leadAssigneeUid(l)
    if (counselor && uid !== counselor) return false
    if (teamSet) {
      if (!uid || !teamSet.has(uid)) return false
    }
    return true
  })
}

export type AnalyticsPipelineRow = { status: string; label: string; count: number }
export type AnalyticsTagRow = { tag: string; count: number }

export function buildAnalyticsSummaryCsv(params: {
  scopeLabel: string
  totalLeads: number
  pipeline: AnalyticsPipelineRow[]
  tags: AnalyticsTagRow[]
}): string {
  const lines: string[] = [
    'Phạm vi,Chỉ số,Giá trị',
    csvRow([params.scopeLabel, 'Tổng hồ sơ (phạm vi lọc)', String(params.totalLeads)]),
  ]
  for (const p of params.pipeline) {
    lines.push(csvRow([params.scopeLabel, `Pipeline · ${p.label}`, String(p.count)]))
  }
  for (const t of params.tags) {
    lines.push(csvRow([params.scopeLabel, `Nhãn · ${t.tag}`, String(t.count)]))
  }
  return lines.join('\n')
}

function csvRow(cells: string[]): string {
  return cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')
}
