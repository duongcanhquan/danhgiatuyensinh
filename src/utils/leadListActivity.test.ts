import { Timestamp } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import {
  composeInteractionSummary,
  formatLeadCounselorNotePreview,
  formatLeadLatestInteractionLine,
  leadListActivityPatch,
} from './leadListActivity'

describe('leadListActivity', () => {
  it('builds denormalize patch with full note in summary', () => {
    const p = leadListActivityPatch({
      kind: 'call',
      summary: 'Gọi lại sau',
      counselorNote: '  Em hẹn tuần sau  ',
    })
    expect(p.lastInteractionKind).toBe('call')
    expect(p.lastInteractionSummary).toBe('Gọi lại sau — Em hẹn tuần sau')
    expect(p.lastCounselorNote).toBe('Em hẹn tuần sau')
    expect(typeof p.lastInteractionAt.toMillis).toBe('function')
  })

  it('uses note body when summary is only a generic label', () => {
    expect(composeInteractionSummary('Ghi chú TVV', 'Phụ huynh đồng ý nhập học')).toBe(
      'Phụ huynh đồng ý nhập học',
    )
    const p = leadListActivityPatch({
      kind: 'note',
      summary: 'Ghi chú TVV',
      counselorNote: 'Phụ huynh đồng ý nhập học',
    })
    expect(p.lastInteractionSummary).toBe('Phụ huynh đồng ý nhập học')
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
      lastCounselorNote: 'Em hẹn 15h thứ 6',
    })
    expect(line).toMatch(/Gọi điện/)
    expect(line).toMatch(/Gọi lại sau/)
    expect(line).toMatch(/Em hẹn 15h thứ 6/)
  })

  it('falls back to note when summary was only a generic label', () => {
    const at = Timestamp.fromMillis(1_700_000_000_000)
    const line = formatLeadLatestInteractionLine({
      lastInteractionAt: at,
      lastInteractionKind: 'note',
      lastInteractionSummary: 'Ghi chú TVV',
      lastCounselorNote: 'Đã gửi giấy mời qua Zalo',
    })
    expect(line).toMatch(/Đã gửi giấy mời qua Zalo/)
    expect(line).not.toMatch(/Ghi chú TVV/)
  })

  it('falls back to cập nhật hồ sơ', () => {
    const at = Timestamp.fromMillis(1_700_000_000_000)
    expect(formatLeadLatestInteractionLine({ lastTouchedAt: at })).toMatch(/Cập nhật hồ sơ/)
  })
})
