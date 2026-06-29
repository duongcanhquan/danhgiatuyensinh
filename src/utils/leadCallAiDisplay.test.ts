import { describe, expect, it } from 'vitest'
import { formatLeadLastCallAiLine } from './leadCallAiDisplay'

describe('formatLeadLastCallAiLine', () => {
  it('ghép mức sẵn sàng và tóm tắt', () => {
    expect(
      formatLeadLastCallAiLine({
        lastCallAiReadiness: 'Cao',
        lastCallAiSummary: 'Phụ huynh hỏi học phí',
      }),
    ).toBe('Cao · Phụ huynh hỏi học phí')
  })

  it('trả null khi không có tóm tắt', () => {
    expect(formatLeadLastCallAiLine({})).toBeNull()
  })
})
