import { describe, expect, it } from 'vitest'
import { buildAnalyticsSummaryCsv, filterLeadsForAnalyticsScope } from './analyticsLeadScope'

describe('filterLeadsForAnalyticsScope', () => {
  const leads = [
    { id: '1', assignedTo: 'tvv-a', assignedCounselorId: 'tvv-a' },
    { id: '2', assignedTo: 'tvv-b', assignedCounselorId: null },
    { id: '3', assignedTo: null, assignedCounselorId: 'tvv-c' },
  ]
  const teams = [{ id: 'tl-1', managedCounselorIds: ['tvv-a', 'tvv-b'] }]

  it('filters by counselor', () => {
    const out = filterLeadsForAnalyticsScope(leads, { teamLeadUid: '', counselorUid: 'tvv-a' }, teams)
    expect(out.map((l) => l.id)).toEqual(['1'])
  })

  it('filters by team lead managed list', () => {
    const out = filterLeadsForAnalyticsScope(leads, { teamLeadUid: 'tl-1', counselorUid: '' }, teams)
    expect(out.map((l) => l.id).sort()).toEqual(['1', '2'])
  })
})

describe('buildAnalyticsSummaryCsv', () => {
  it('includes BOM-ready rows with scope', () => {
    const csv = buildAnalyticsSummaryCsv({
      scopeLabel: 'Nhóm A',
      totalLeads: 2,
      pipeline: [{ status: 'NEW', label: 'Mới', count: 1 }],
      tags: [{ tag: 'HOT', count: 1 }],
    })
    expect(csv).toContain('Nhóm A')
    expect(csv).toContain('Pipeline · Mới')
    expect(csv).toContain('Nhãn · HOT')
  })
})
