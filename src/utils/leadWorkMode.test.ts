import { describe, expect, it } from 'vitest'
import {
  CARE_CLOSE_DISPOSITION_IDS,
  LEAD_WORK_MODES,
  findLeadSourceByLabel,
  leadMatchesWorkModeFilter,
  leadWorkModeLabel,
  parseLeadWorkMode,
  parseLeadWorkModeFromUrl,
  resolveWorkModeForLeadIntake,
  resolveWorkModeFromSourcePlaybook,
  shouldSuggestCareClose,
  workModeAfterDisposition,
  type LeadWorkMode,
} from './leadWorkMode'

describe('LEAD_WORK_MODES', () => {
  it('lists the three work modes in stable order', () => {
    expect(LEAD_WORK_MODES).toEqual(['score_queue', 'volume_filter', 'care_close'])
  })
})

describe('leadWorkModeLabel', () => {
  it('returns Vietnamese UI labels only', () => {
    expect(leadWorkModeLabel('score_queue')).toBe('Sàng data')
    expect(leadWorkModeLabel('volume_filter')).toBe('Lọc gọi nhanh')
    expect(leadWorkModeLabel('care_close')).toBe('Chăm & chốt')
  })
})

describe('parseLeadWorkMode', () => {
  it('accepts known modes', () => {
    for (const mode of LEAD_WORK_MODES) {
      expect(parseLeadWorkMode(mode)).toBe(mode)
    }
  })

  it('rejects unknown or empty values', () => {
    expect(parseLeadWorkMode(undefined)).toBeUndefined()
    expect(parseLeadWorkMode(null)).toBeUndefined()
    expect(parseLeadWorkMode('')).toBeUndefined()
    expect(parseLeadWorkMode('all')).toBeUndefined()
    expect(parseLeadWorkMode('SCORE_QUEUE')).toBeUndefined()
    expect(parseLeadWorkMode(1)).toBeUndefined()
  })
})

describe('parseLeadWorkModeFromUrl', () => {
  it('maps null/empty/unknown to all', () => {
    expect(parseLeadWorkModeFromUrl(null)).toBe('all')
    expect(parseLeadWorkModeFromUrl('')).toBe('all')
    expect(parseLeadWorkModeFromUrl('bogus')).toBe('all')
  })

  it('parses valid mode params', () => {
    expect(parseLeadWorkModeFromUrl('score_queue')).toBe('score_queue')
    expect(parseLeadWorkModeFromUrl('volume_filter')).toBe('volume_filter')
    expect(parseLeadWorkModeFromUrl('care_close')).toBe('care_close')
  })
})

describe('leadMatchesWorkModeFilter', () => {
  it('matches all regardless of workMode', () => {
    expect(leadMatchesWorkModeFilter({}, 'all')).toBe(true)
    expect(leadMatchesWorkModeFilter({ workMode: 'score_queue' }, 'all')).toBe(true)
  })

  it('does not match a specific mode when workMode is missing', () => {
    expect(leadMatchesWorkModeFilter({}, 'volume_filter')).toBe(false)
    expect(leadMatchesWorkModeFilter({ workMode: undefined }, 'care_close')).toBe(false)
  })

  it('matches only the same mode', () => {
    const lead: { workMode?: LeadWorkMode } = { workMode: 'volume_filter' }
    expect(leadMatchesWorkModeFilter(lead, 'volume_filter')).toBe(true)
    expect(leadMatchesWorkModeFilter(lead, 'score_queue')).toBe(false)
  })
})

describe('resolveWorkModeFromSourcePlaybook', () => {
  it('returns defaultWorkMode when set', () => {
    expect(resolveWorkModeFromSourcePlaybook({ defaultWorkMode: 'care_close' })).toBe('care_close')
    expect(resolveWorkModeFromSourcePlaybook({ defaultWorkMode: 'score_queue' })).toBe('score_queue')
  })

  it('returns undefined for null/undefined source or empty playbook', () => {
    expect(resolveWorkModeFromSourcePlaybook(null)).toBeUndefined()
    expect(resolveWorkModeFromSourcePlaybook(undefined)).toBeUndefined()
    expect(resolveWorkModeFromSourcePlaybook({})).toBeUndefined()
    expect(resolveWorkModeFromSourcePlaybook({ defaultWorkMode: null })).toBeUndefined()
  })
})

describe('findLeadSourceByLabel', () => {
  const sources = [
    { label: 'Facebook Ads', defaultWorkMode: 'volume_filter' as const },
    { label: '  Zalo OA  ', defaultWorkMode: 'score_queue' as const },
  ]

  it('matches by trimmed case-insensitive label', () => {
    expect(findLeadSourceByLabel(sources, 'facebook ads')?.defaultWorkMode).toBe('volume_filter')
    expect(findLeadSourceByLabel(sources, 'Zalo OA')?.label).toBe('  Zalo OA  ')
  })

  it('returns undefined when label missing or unmatched', () => {
    expect(findLeadSourceByLabel(sources, '')).toBeUndefined()
    expect(findLeadSourceByLabel(sources, 'TikTok')).toBeUndefined()
    expect(findLeadSourceByLabel([], 'Facebook Ads')).toBeUndefined()
  })
})

describe('resolveWorkModeForLeadIntake', () => {
  const sources = [
    { label: 'OFF — Hội thảo', defaultWorkMode: 'care_close' as const },
    { label: 'MKT — Form', defaultWorkMode: 'score_queue' as const },
    { label: 'Không cấu hình' },
  ]

  it('prefers explicit workMode over source playbook', () => {
    expect(
      resolveWorkModeForLeadIntake({
        workMode: 'volume_filter',
        source1: 'OFF — Hội thảo',
        sources,
      }),
    ).toBe('volume_filter')
  })

  it('resolves from matching source playbook when workMode omitted', () => {
    expect(
      resolveWorkModeForLeadIntake({ source1: 'mkt — form', sources }),
    ).toBe('score_queue')
  })

  it('omits workMode when neither explicit nor playbook is set', () => {
    expect(resolveWorkModeForLeadIntake({ source1: 'Không cấu hình', sources })).toBeUndefined()
    expect(resolveWorkModeForLeadIntake({ source1: 'Lạ', sources })).toBeUndefined()
    expect(resolveWorkModeForLeadIntake({})).toBeUndefined()
    expect(resolveWorkModeForLeadIntake({ workMode: 'bogus', source1: 'OFF — Hội thảo', sources })).toBe(
      'care_close',
    )
  })
})

describe('CARE_CLOSE_DISPOSITION_IDS / shouldSuggestCareClose', () => {
  it('includes interested dispositions that should push care_close', () => {
    for (const id of [
      'high_interest',
      'college_hot',
      'positive',
      'uni_top_high',
      'uni_top_mid',
    ]) {
      expect(CARE_CLOSE_DISPOSITION_IDS).toContain(id)
      expect(shouldSuggestCareClose(id)).toBe(true)
    }
  })

  it('excludes dispositions that must not push care_close', () => {
    for (const id of [
      'not_interested',
      'knm',
      'callback_later',
      'enrolled_elsewhere',
      'wrong_number',
      'negative',
    ]) {
      expect(CARE_CLOSE_DISPOSITION_IDS).not.toContain(id)
      expect(shouldSuggestCareClose(id)).toBe(false)
    }
  })
})

describe('workModeAfterDisposition', () => {
  it('suggests care_close from volume_filter on high_interest', () => {
    expect(workModeAfterDisposition('high_interest', 'volume_filter')).toBe('care_close')
  })

  it('returns undefined when already care_close or disposition does not suggest', () => {
    expect(workModeAfterDisposition('high_interest', 'care_close')).toBeUndefined()
    expect(workModeAfterDisposition('not_interested', 'volume_filter')).toBeUndefined()
    expect(workModeAfterDisposition('knm')).toBeUndefined()
  })

  it('suggests care_close when current mode is missing', () => {
    expect(workModeAfterDisposition('college_hot')).toBe('care_close')
    expect(workModeAfterDisposition('positive', undefined)).toBe('care_close')
  })
})
