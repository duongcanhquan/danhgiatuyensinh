import { Timestamp } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import {
  CALL_DISPOSITIONS,
  bucketForDisposition,
  buildCallWorkLeadPatch,
  buildConnectedClearSoftLeadPatch,
  buildNoAnswerSoftCallWorkPatch,
  dispositionPriorityOverridesAfterScoring,
  getCallDisposition,
  isSoftOverwritableDisposition,
  leadMatchesCallWorkBucket,
  leadMatchesDisposition,
  resolveCallWorkBucket,
  type CallDispositionId,
} from './callWorkQueue'

describe('callWorkQueue catalog', () => {
  it('exposes all required disposition ids with Vietnamese labels', () => {
    const ids = CALL_DISPOSITIONS.map((d) => d.id)
    expect(ids).toEqual([
      'knm',
      'callback_later',
      'undecided_school',
      'wrong_number',
      'not_interested',
      'working',
      'uni_top_high',
      'uni_top_mid',
      'college_hot',
      'enrolled_elsewhere',
    ])
    expect(getCallDisposition('knm')?.label).toBe('KNM')
    expect(getCallDisposition('enrolled_elsewhere')?.label).toMatch(/nhập học/i)
    expect(getCallDisposition('enrolled_elsewhere')?.label).toMatch(/trường khác|fail/i)
  })

  it('maps dispositions to callback vs called buckets', () => {
    expect(bucketForDisposition('knm')).toBe('callback')
    expect(bucketForDisposition('callback_later')).toBe('callback')
    expect(bucketForDisposition('undecided_school')).toBe('callback')
    expect(bucketForDisposition('wrong_number')).toBe('called')
    expect(bucketForDisposition('college_hot')).toBe('called')
    expect(bucketForDisposition('enrolled_elsewhere')).toBe('called')
  })
})

describe('resolveCallWorkBucket', () => {
  it('defaults missing fields to uncalled', () => {
    expect(resolveCallWorkBucket({})).toBe('uncalled')
  })

  it('prefers explicit callWorkBucket', () => {
    expect(resolveCallWorkBucket({ callWorkBucket: 'called', lastCallDispositionId: 'knm' })).toBe(
      'called',
    )
  })

  it('infers from disposition when bucket missing', () => {
    expect(resolveCallWorkBucket({ lastCallDispositionId: 'knm' })).toBe('callback')
    expect(resolveCallWorkBucket({ lastCallDispositionId: 'not_interested' })).toBe('called')
  })

  it('infers from lastCallOutcome when no disposition', () => {
    const at = Timestamp.fromDate(new Date('2026-08-06T10:00:00'))
    expect(resolveCallWorkBucket({ lastCallAt: at, lastCallOutcome: 'NO_ANSWER' })).toBe('callback')
    expect(resolveCallWorkBucket({ lastCallAt: at, lastCallOutcome: 'FOLLOW_UP' })).toBe('callback')
    expect(resolveCallWorkBucket({ lastCallAt: at, lastCallOutcome: 'CONNECTED' })).toBe('called')
  })

  it('treats lastCallAiAt as evidence of prior call when lastCallAt missing', () => {
    const at = Timestamp.fromDate(new Date('2026-08-06T10:00:00'))
    expect(resolveCallWorkBucket({ lastCallAiAt: at, lastCallOutcome: 'CONNECTED' })).toBe('called')
  })
})

describe('buildCallWorkLeadPatch', () => {
  it('sets bucket, disposition, attempt count, and last-call patch', () => {
    const patch = buildCallWorkLeadPatch({
      dispositionId: 'callback_later',
      calledByLabel: ' TVV An ',
      previousAttemptCount: 2,
      at: Timestamp.fromMillis(1_700_000_000_000),
    })
    expect(patch.callWorkBucket).toBe('callback')
    expect(patch.lastCallDispositionId).toBe('callback_later')
    expect(patch.lastCallDispositionLabel).toBe('Gọi lại sau')
    expect(patch.callAttemptCount).toBe(3)
    expect(patch.lastCalledByLabel).toBe('TVV An')
    expect(patch.lastCallOutcome).toBe('FOLLOW_UP')
    expect(patch.lastCallAt?.toMillis()).toBe(1_700_000_000_000)
  })

  it('maps knm to NO_ANSWER outcome by default', () => {
    const patch = buildCallWorkLeadPatch({
      dispositionId: 'knm',
      calledByLabel: 'sip',
    })
    expect(patch.callWorkBucket).toBe('callback')
    expect(patch.lastCallOutcome).toBe('NO_ANSWER')
  })

  it('college_hot hints HOT boost', () => {
    const patch = buildCallWorkLeadPatch({
      dispositionId: 'college_hot',
      calledByLabel: 'sip',
    })
    expect(patch.callWorkBucket).toBe('called')
    expect(patch.callEvalPriorityBoost).toBe('HOT')
    expect(patch.priorityTag).toBe('HOT')
  })

  it('enrolled_elsewhere sets fail signal and LOSS — not CRM ENROLLED', () => {
    const patch = buildCallWorkLeadPatch({
      dispositionId: 'enrolled_elsewhere',
      calledByLabel: 'sip',
      existingScoringSignals: { askedTuition: true },
    })
    expect(patch.callWorkBucket).toBe('called')
    expect(patch.priorityTag).toBe('LOSS')
    expect(patch.scoringSignals).toEqual({ askedTuition: true, enrolledElsewhere: true })
    expect(patch.status).toBeUndefined()
    expect(patch.pipelineStatus).toBeUndefined()
  })
})

describe('buildNoAnswerSoftCallWorkPatch', () => {
  it('soft-assigns knm / callback without bumping attempt count', () => {
    const patch = buildNoAnswerSoftCallWorkPatch({
      calledByLabel: 'OMI',
    })
    expect(patch.lastCallDispositionId).toBe('knm')
    expect(patch.callWorkBucket).toBe('callback')
    expect(patch.lastCallOutcome).toBe('NO_ANSWER')
    expect(patch.callAttemptCount).toBeUndefined()
  })

  it('panel save after soft still bumps from previous count once', () => {
    const soft = buildNoAnswerSoftCallWorkPatch({ calledByLabel: 'OMI' })
    expect(soft.callAttemptCount).toBeUndefined()
    const panel = buildCallWorkLeadPatch({
      dispositionId: 'callback_later',
      calledByLabel: 'TVV',
      previousAttemptCount: 0,
      bumpAttempt: true,
    })
    expect(panel.callAttemptCount).toBe(1)
  })
})

describe('buildConnectedClearSoftLeadPatch', () => {
  it('clears soft knm and moves to called', () => {
    const patch = buildConnectedClearSoftLeadPatch({ calledByLabel: 'sip' })
    expect(patch.callWorkBucket).toBe('called')
    expect(patch.lastCallDispositionId).toBeNull()
    expect(patch.lastCallOutcome).toBe('CONNECTED')
  })
})

describe('dispositionPriorityOverridesAfterScoring', () => {
  it('forces LOSS and clears boost for enrolled_elsewhere', () => {
    expect(dispositionPriorityOverridesAfterScoring('enrolled_elsewhere', 'HOT')).toEqual({
      priorityTag: 'LOSS',
      clearCallEvalPriorityBoost: true,
    })
  })

  it('keeps at least HOT for college_hot', () => {
    expect(dispositionPriorityOverridesAfterScoring('college_hot', 'WARM')).toEqual({
      priorityTag: 'HOT',
      callEvalPriorityBoost: 'HOT',
    })
    expect(dispositionPriorityOverridesAfterScoring('college_hot', 'HOT')).toEqual({
      priorityTag: 'HOT',
      callEvalPriorityBoost: 'HOT',
    })
  })
})

describe('isSoftOverwritableDisposition', () => {
  it('only allows overwrite when empty or knm', () => {
    expect(isSoftOverwritableDisposition(null)).toBe(true)
    expect(isSoftOverwritableDisposition('knm')).toBe(true)
    expect(isSoftOverwritableDisposition('college_hot')).toBe(false)
  })
})

describe('lead match helpers', () => {
  it('matches bucket and disposition filters', () => {
    const lead = {
      callWorkBucket: 'callback' as const,
      lastCallDispositionId: 'knm' as CallDispositionId,
    }
    expect(leadMatchesCallWorkBucket(lead, 'all')).toBe(true)
    expect(leadMatchesCallWorkBucket(lead, 'callback')).toBe(true)
    expect(leadMatchesCallWorkBucket(lead, 'uncalled')).toBe(false)
    expect(leadMatchesDisposition(lead, 'all')).toBe(true)
    expect(leadMatchesDisposition(lead, 'knm')).toBe(true)
    expect(leadMatchesDisposition(lead, 'working')).toBe(false)
  })
})
