import { describe, expect, it } from 'vitest'
import {
  INFO_SCORE_COLUMN_LABEL,
  INFO_SCORE_HINT,
  PROFILE_SCORE_COLUMN_LABEL,
  PROFILE_SCORE_HINT,
  PROFILE_SCORE_HINT_WHEN_CLASSIFICATION,
  infoScoreHelpHint,
  profileScoreHelpHint,
} from './leadScoreDisplayCopy'

describe('leadScoreDisplayCopy', () => {
  it('keeps profile vs completeness labels distinct', () => {
    expect(PROFILE_SCORE_COLUMN_LABEL).toBe('Điểm hồ sơ')
    expect(INFO_SCORE_COLUMN_LABEL).toBe('Độ đầy đủ')
    expect(PROFILE_SCORE_COLUMN_LABEL).not.toBe(INFO_SCORE_COLUMN_LABEL)
  })

  it('profile hint says completeness is excluded unless classification is on', () => {
    expect(profileScoreHelpHint(false)).toBe(PROFILE_SCORE_HINT)
    expect(profileScoreHelpHint(false)).toMatch(/Không gồm độ đầy đủ/)
    expect(profileScoreHelpHint(false)).not.toMatch(/tổng hợp 0–100/)
    expect(profileScoreHelpHint(true)).toBe(PROFILE_SCORE_HINT_WHEN_CLASSIFICATION)
    expect(profileScoreHelpHint(true)).toMatch(/phân loại theo tỷ trọng/)
  })

  it('info hint says HOT/WARM is not decided by completeness', () => {
    expect(infoScoreHelpHint()).toBe(INFO_SCORE_HINT)
    expect(infoScoreHelpHint()).toMatch(/Không quyết định nhãn HOT/)
    expect(infoScoreHelpHint()).toMatch(/Điểm thông tin/)
  })
})
