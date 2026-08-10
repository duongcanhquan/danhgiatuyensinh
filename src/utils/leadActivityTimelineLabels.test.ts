import { describe, expect, it } from 'vitest'
import {
  auditActionLabelVi,
  callActionTitle,
  timelineActorName,
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
      'Gọi ra · Nghe máy · HL',
    )
    expect(callActionTitle({ direction: 'inbound', connected: false })).toBe('Gọi vào · Không nghe')
    expect(callActionTitle({ direction: 'outbound', connected: true })).not.toMatch(/OMICall/i)
  })

  it('joins actor and action as headline', () => {
    expect(timelineHeadline('Nguyễn A', 'Gọi ra · Nghe máy')).toBe('Nguyễn A · Gọi ra · Nghe máy')
  })
})
