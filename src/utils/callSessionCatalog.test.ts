import { describe, expect, it } from 'vitest'
import { composeCallSessionCounselorNote } from './callSessionCatalog'

describe('composeCallSessionCounselorNote', () => {
  it('ghép thẻ và ghi chú tự do', () => {
    const note = composeCallSessionCounselorNote(
      [
        { category: 'attitude', label: 'Hào hứng, hợp tác' },
        { category: 'topic', label: 'Học phí / học bổng' },
      ],
      'Mẹ hẹn gọi lại tối',
    )
    expect(note).toContain('[Ghi chú cuộc gọi — TVV]')
    expect(note).toContain('Hào hứng, hợp tác')
    expect(note).toContain('Mẹ hẹn gọi lại tối')
  })
})
