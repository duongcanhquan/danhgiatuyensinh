import { describe, expect, it } from 'vitest'
import { resolveLeadDisplayPriorityTag } from './leadPriorityTag'

describe('resolveLeadDisplayPriorityTag', () => {
  it('takes max of stored tag, scored tag, and callEval boost', () => {
    expect(
      resolveLeadDisplayPriorityTag({ priorityTag: 'HOT', callEvalPriorityBoost: undefined }, 'COLD'),
    ).toBe('HOT')
    expect(
      resolveLeadDisplayPriorityTag({ priorityTag: 'COLD', callEvalPriorityBoost: undefined }, 'WARM'),
    ).toBe('WARM')
    expect(
      resolveLeadDisplayPriorityTag({ priorityTag: 'COLD', callEvalPriorityBoost: 'HOT' }, 'WARM'),
    ).toBe('HOT')
  })
})
