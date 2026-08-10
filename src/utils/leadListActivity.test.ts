import { Timestamp } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import {
  formatLeadCounselorNotePreview,
  formatLeadLatestInteractionLine,
  leadListActivityPatch,
} from './leadListActivity'

describe('leadListActivity', () => {
  it('builds denormalize patch with note', () => {
    const p = leadListActivityPatch({
      kind: 'call',
      summary: 'Gọi lại sau',
      counselorNote: '  Em hẹn tuần sau  ',
    })
    expect(p.lastInteractionKind).toBe('call')
    expect(p.lastInteractionSummary).toBe('Gọi lại sau')
    expect(p.lastCounselorNote).toBe('Em hẹn tuần sau')
    expect(typeof p.lastInteractionAt.toMillis).toBe('function')
  })

  it('previews counselor note', () => {
    expect(formatLeadCounselorNotePreview({}).text).toBe('—')
    expect(formatLeadCounselorNotePreview({ lastCounselorNote: 'OK' }).text).toBe('OK')
  })

  it('formats latest interaction from denormalized fields', () => {
    const at = Timestamp.fromMillis(1_700_000_000_000)
    const line = formatLeadLatestInteractionLine({
      lastInteractionAt: at,
      lastInteractionKind: 'call',
      lastInteractionSummary: 'Gọi lại sau',
    })
    expect(line).toMatch(/Gọi điện/)
    expect(line).toMatch(/Gọi lại sau/)
  })

  it('falls back to cập nhật hồ sơ', () => {
    const at = Timestamp.fromMillis(1_700_000_000_000)
    expect(formatLeadLatestInteractionLine({ lastTouchedAt: at })).toMatch(/Cập nhật hồ sơ/)
  })
})
