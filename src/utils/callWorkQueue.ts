import { Timestamp } from 'firebase/firestore'
import type { Interaction, Lead, LeadScoringSignals, PriorityTag } from '../types'
import { buildLastCallLeadPatch, effectiveLastCallAt } from './leadCallSignals'

export type CallWorkBucket = 'uncalled' | 'callback' | 'called'

export type CallDispositionId =
  | 'knm'
  | 'callback_later'
  | 'undecided_school'
  | 'wrong_number'
  | 'not_interested'
  | 'working'
  | 'uni_top_high'
  | 'uni_top_mid'
  | 'college_hot'
  | 'enrolled_elsewhere'

export type CallDispositionDef = {
  id: CallDispositionId
  label: string
  bucket: Exclude<CallWorkBucket, 'uncalled'>
}

/** Catalog kết quả sau gọi — TVV chọn 1 note; quản lý lọc theo id. */
export const CALL_DISPOSITIONS: readonly CallDispositionDef[] = [
  { id: 'knm', label: 'KNM', bucket: 'callback' },
  { id: 'callback_later', label: 'Gọi lại sau', bucket: 'callback' },
  { id: 'undecided_school', label: 'Chưa chọn trường', bucket: 'callback' },
  { id: 'wrong_number', label: 'Thuê bao / sai số', bucket: 'called' },
  { id: 'not_interested', label: 'Không quan tâm', bucket: 'called' },
  { id: 'working', label: 'Em đang đi làm', bucket: 'called' },
  { id: 'uni_top_high', label: 'Đại học top cao', bucket: 'called' },
  { id: 'uni_top_mid', label: 'Đại học top trung bình', bucket: 'called' },
  { id: 'college_hot', label: 'Chọn cao đẳng, HOT', bucket: 'called' },
  {
    id: 'enrolled_elsewhere',
    label: 'Đã nhập học (trường khác — fail)',
    bucket: 'called',
  },
] as const

const BY_ID = new Map(CALL_DISPOSITIONS.map((d) => [d.id, d]))

export function getCallDisposition(id: string | null | undefined): CallDispositionDef | undefined {
  if (!id) return undefined
  return BY_ID.get(id as CallDispositionId)
}

export function isCallDispositionId(id: string): id is CallDispositionId {
  return BY_ID.has(id as CallDispositionId)
}

export function bucketForDisposition(id: CallDispositionId): Exclude<CallWorkBucket, 'uncalled'> {
  return BY_ID.get(id)!.bucket
}

export type CallWorkLeadFields = {
  callWorkBucket?: CallWorkBucket | null
  lastCallAt?: Timestamp | null
  lastCallAiAt?: Timestamp | null
  lastCallOutcome?: Interaction['callOutcome'] | null
  lastCallDispositionId?: string | null
}

/** Bucket hiệu lực: field lưu sẵn → disposition → suy từ lần gọi gần nhất → chưa gọi. */
export function resolveCallWorkBucket(lead: CallWorkLeadFields): CallWorkBucket {
  if (lead.callWorkBucket === 'uncalled' || lead.callWorkBucket === 'callback' || lead.callWorkBucket === 'called') {
    return lead.callWorkBucket
  }
  const fromDisp = getCallDisposition(lead.lastCallDispositionId ?? undefined)
  if (fromDisp) return fromDisp.bucket
  const at = effectiveLastCallAt(lead)
  if (!at) return 'uncalled'
  if (lead.lastCallOutcome === 'NO_ANSWER' || lead.lastCallOutcome === 'FOLLOW_UP') return 'callback'
  return 'called'
}

function defaultOutcomeForDisposition(
  id: CallDispositionId,
): NonNullable<Interaction['callOutcome']> {
  if (id === 'knm') return 'NO_ANSWER'
  if (id === 'callback_later' || id === 'undecided_school') return 'FOLLOW_UP'
  if (id === 'not_interested' || id === 'wrong_number' || id === 'enrolled_elsewhere') return 'DISQUALIFIED'
  return 'CONNECTED'
}

export type CallWorkLeadPatch = {
  lastCallAt: Timestamp
  lastCalledByLabel: string
  lastCallOutcome: NonNullable<Interaction['callOutcome']>
  callWorkBucket: Exclude<CallWorkBucket, 'uncalled'>
  lastCallDispositionId: CallDispositionId
  lastCallDispositionLabel: string
  callAttemptCount: number
  callEvalPriorityBoost?: PriorityTag
  priorityTag?: PriorityTag
  scoringSignals?: LeadScoringSignals
  status?: never
  pipelineStatus?: never
}

export function buildCallWorkLeadPatch(input: {
  dispositionId: CallDispositionId
  calledByLabel: string
  outcome?: Interaction['callOutcome'] | null
  previousAttemptCount?: number
  at?: Timestamp
  existingScoringSignals?: LeadScoringSignals | null
}): CallWorkLeadPatch {
  const def = BY_ID.get(input.dispositionId)
  if (!def) throw new Error(`Kết quả gọi không hợp lệ: ${input.dispositionId}`)

  const outcome = input.outcome ?? defaultOutcomeForDisposition(def.id)
  const base = buildLastCallLeadPatch({
    calledByLabel: input.calledByLabel,
    outcome,
    at: input.at,
  })

  const patch: CallWorkLeadPatch = {
    lastCallAt: base.lastCallAt,
    lastCalledByLabel: base.lastCalledByLabel,
    lastCallOutcome: outcome,
    callWorkBucket: def.bucket,
    lastCallDispositionId: def.id,
    lastCallDispositionLabel: def.label,
    callAttemptCount: Math.max(0, Math.floor(input.previousAttemptCount ?? 0)) + 1,
  }

  if (def.id === 'college_hot') {
    patch.callEvalPriorityBoost = 'HOT'
    patch.priorityTag = 'HOT'
  }

  if (def.id === 'enrolled_elsewhere') {
    patch.priorityTag = 'LOSS'
    const prev = input.existingScoringSignals ?? {}
    patch.scoringSignals = { ...prev, enrolledElsewhere: true }
  }

  return patch
}

/** Hangup không lưu panel + KNM: gán soft vào Gọi lại. */
export function buildNoAnswerSoftCallWorkPatch(input: {
  calledByLabel: string
  previousAttemptCount?: number
  at?: Timestamp
}): CallWorkLeadPatch {
  return buildCallWorkLeadPatch({
    dispositionId: 'knm',
    calledByLabel: input.calledByLabel,
    outcome: 'NO_ANSWER',
    previousAttemptCount: input.previousAttemptCount,
    at: input.at,
  })
}

export type CallWorkBucketFilter = 'all' | CallWorkBucket
export type CallDispositionFilter = 'all' | CallDispositionId

export function leadMatchesCallWorkBucket(
  lead: CallWorkLeadFields,
  filter: CallWorkBucketFilter,
): boolean {
  if (filter === 'all') return true
  return resolveCallWorkBucket(lead) === filter
}

export function leadMatchesDisposition(
  lead: Pick<CallWorkLeadFields, 'lastCallDispositionId'>,
  filter: CallDispositionFilter,
): boolean {
  if (filter === 'all') return true
  return lead.lastCallDispositionId === filter
}

/** Sắp xếp Chưa gọi: ổn định theo updatedAt/createdAt tăng dần (trên → dưới). */
export function compareUncalledQueueOrder(
  a: Pick<Lead, 'updatedAt' | 'createdAt' | 'id'>,
  b: Pick<Lead, 'updatedAt' | 'createdAt' | 'id'>,
): number {
  const aMs = a.updatedAt?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0
  const bMs = b.updatedAt?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0
  if (aMs !== bMs) return aMs - bMs
  return a.id.localeCompare(b.id)
}
