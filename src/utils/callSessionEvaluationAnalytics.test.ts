import { describe, expect, it } from 'vitest'
import { aggregateCallEvaluations, type CallEvaluationRow } from './callSessionEvaluationAnalytics'

describe('callSessionEvaluationAnalytics', () => {
  it('gộp theo chiều và tín hiệu', () => {
    const rows: CallEvaluationRow[] = [
      {
        interactionId: 'a',
        leadId: 'l1',
        evaluatedAtMs: Date.now(),
        authorUid: 'u1',
        picks: [
          {
            dimensionId: 'enrollment_signal',
            dimensionLabel: 'Tín hiệu',
            optionId: 'hot',
            optionLabel: 'Rất quan tâm',
          },
        ],
      },
      {
        interactionId: 'b',
        leadId: 'l2',
        evaluatedAtMs: Date.now(),
        authorUid: 'u1',
        picks: [
          {
            dimensionId: 'enrollment_signal',
            dimensionLabel: 'Tín hiệu',
            optionId: 'hot',
            optionLabel: 'Rất quan tâm',
          },
        ],
      },
    ]
    const agg = aggregateCallEvaluations(rows)
    expect(agg.totalEvaluations).toBe(2)
    expect(agg.uniqueLeads).toBe(2)
    expect(agg.signalCounts[0]?.count).toBe(2)
  })
})
