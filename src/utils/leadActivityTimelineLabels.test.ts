import { describe, expect, it } from 'vitest'
import {
  auditActionLabelVi,
  callActionTitle,
  groupTimelineByDay,
  timelineActorName,
  timelineDayLabel,
  timelineHeadline,
} from './leadActivityTimelineLabels'

describe('leadActivityTimelineLabels', () => {
  it('maps audit action types to plain Vietnamese', () => {
    expect(auditActionLabelVi('REASSIGNMENT')).toBe('Phân công')
    expect(auditActionLabelVi('STATUS_CHANGE')).toBe('Đổi trạng thái')
    expect(auditActionLabelVi('UNKNOWN_X')).toBe('Thao tác')
  })

  it('prefers performedByName then labelUid then Chưa rõ người', () => {
    expect(
      timelineActorName({
        performedByName: '  Nguyễn A  ',
        uid: 'uid1',
        labelUid: () => 'Khác',
      }),
    ).toBe('Nguyễn A')
    expect(
      timelineActorName({
        performedByName: '',
        uid: 'abc12345xyz',
        labelUid: (id) => (id === 'abc12345xyz' ? 'Trần B' : '—'),
      }),
    ).toBe('Trần B')
    expect(timelineActorName({ performedByName: null, uid: null })).toBe('Chưa rõ người')
  })

  it('builds call action without OMICall brand', () => {
    expect(callActionTitle({ direction: 'outbound', connected: true, valid: true })).toBe(
      'Gọi ra · Nghe máy · Hợp lệ',
    )
    expect(callActionTitle({ direction: 'inbound', connected: false })).toBe(
      'Gọi vào · Không nghe máy',
    )
    expect(callActionTitle({ direction: 'outbound', connected: true })).not.toMatch(/OMICall/i)
  })

  it('joins actor and action as headline', () => {
    expect(timelineHeadline('Nguyễn A', 'Gọi ra · Nghe máy')).toBe('Nguyễn A · Gọi ra · Nghe máy')
  })

  it('groups rows by local day with Hôm nay / Hôm qua labels', () => {
    const now = new Date('2026-08-10T15:00:00+07:00').getTime()
    const today = new Date('2026-08-10T09:30:00+07:00').getTime()
    const yesterday = new Date('2026-08-09T20:00:00+07:00').getTime()
    const older = new Date('2026-08-01T12:00:00+07:00').getTime()
    expect(timelineDayLabel(today, now)).toBe('Hôm nay')
    expect(timelineDayLabel(yesterday, now)).toBe('Hôm qua')
    expect(timelineDayLabel(older, now)).toMatch(/01/)
    const groups = groupTimelineByDay(
      [
        { at: today, id: 'a' },
        { at: today + 1000, id: 'b' },
        { at: yesterday, id: 'c' },
      ],
      now,
    )
    expect(groups).toHaveLength(2)
    expect(groups[0]!.dayLabel).toBe('Hôm nay')
    expect(groups[0]!.items).toHaveLength(2)
    expect(groups[1]!.dayLabel).toBe('Hôm qua')
  })
})
