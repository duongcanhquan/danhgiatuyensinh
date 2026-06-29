import { describe, expect, it } from 'vitest'
import { buildKpiEvaluationRuntime, evaluateKpiRowWarnings, getDefaultKpiEvaluationRules } from './kpiEvaluationRules'
import { emptyKpiSummary } from './kpiMap'
import { mergeCallKpiFromOmicall } from './kpiFromOmicallCalls'

describe('evaluateKpiRowWarnings', () => {
  const runtime = buildKpiEvaluationRuntime(getDefaultKpiEvaluationRules())

  it('kỳ dài: chuẩn hoá theo ngày hoạt động, tránh báo spam oan', () => {
    const row = {
      ...emptyKpiSummary('u1'),
      totalCalls: 200,
      validCalls: 60,
      connectedCalls: 100,
      activeDays: 10,
    }
    expect(evaluateKpiRowWarnings(row, runtime, { mode: 'daily' })?.id).toBe('spam')
    expect(evaluateKpiRowWarnings(row, runtime, { mode: 'period' })).toBeNull()
  })

  it('bắt máy thấp: cần đủ số cuộc gọi tối thiểu', () => {
    const row = { ...emptyKpiSummary('u1'), totalCalls: 3, connectedCalls: 0, activeDays: 1 }
    expect(evaluateKpiRowWarnings(row, runtime, { mode: 'daily' })).toBeNull()
  })
})

describe('mergeCallKpiFromOmicall', () => {
  it('lấy max giữa kpiDaily và log gọi live khi sync chậm', () => {
    const kpi = [{ ...emptyKpiSummary('u1'), totalCalls: 3, validCalls: 2, uniqueLeadsCalled: 1 }]
    const live = [{ ...emptyKpiSummary('u1'), totalCalls: 5, validCalls: 4, uniqueLeadsCalled: 3 }]
    const merged = mergeCallKpiFromOmicall(kpi, live)
    expect(merged[0]?.totalCalls).toBe(5)
    expect(merged[0]?.validCalls).toBe(4)
    expect(merged[0]?.uniqueLeadsCalled).toBe(3)
  })

  it('bù teamLeadUid / activeDays khi số gọi official đã cao hơn', () => {
    const kpi = [{ ...emptyKpiSummary('u1'), totalCalls: 10, validCalls: 8, activeDays: 1 }]
    const live = [
      { ...emptyKpiSummary('u1'), totalCalls: 5, validCalls: 4, teamLeadUid: 'tl1', activeDays: 3 },
    ]
    const merged = mergeCallKpiFromOmicall(kpi, live)
    expect(merged[0]?.totalCalls).toBe(10)
    expect(merged[0]?.teamLeadUid).toBe('tl1')
    expect(merged[0]?.activeDays).toBe(3)
  })
})
