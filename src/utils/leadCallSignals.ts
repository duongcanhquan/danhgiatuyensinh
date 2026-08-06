import { Timestamp } from 'firebase/firestore'
import type { Interaction, Lead } from '../types'

export type CallQueueFilter = 'all' | 'never_called' | 'called_today' | 'needs_callback'

export type LeadCallSignalFields = {
  lastCallAt?: Timestamp | null
  /** Fallback khi hồ sơ cũ chỉ có đánh giá AI sau gọi, chưa có lastCallAt. */
  lastCallAiAt?: Timestamp | null
  lastCalledByLabel?: string | null
  lastCallOutcome?: Interaction['callOutcome'] | null
  nextFollowUpDate?: Timestamp | null
}

const OUTCOME_VI: Record<NonNullable<Interaction['callOutcome']>, string> = {
  NO_ANSWER: 'Không bắt máy',
  CONNECTED: 'Đã bắt máy',
  FOLLOW_UP: 'Cần gọi lại',
  DISQUALIFIED: 'Loại',
  APPOINTMENT_SET: 'Hẹn',
  OTHER: 'Khác',
}

function isTs(v: unknown): v is Timestamp {
  return Boolean(v && typeof v === 'object' && typeof (v as Timestamp).toMillis === 'function')
}

/** Ưu tiên lastCallAt; hồ sơ cũ dùng lastCallAiAt. */
export function effectiveLastCallAt(
  lead: Pick<LeadCallSignalFields, 'lastCallAt' | 'lastCallAiAt'>,
): Timestamp | null {
  if (isTs(lead.lastCallAt)) return lead.lastCallAt
  if (isTs(lead.lastCallAiAt)) return lead.lastCallAiAt
  return null
}

/** Midnight local of the calendar day containing `now`. */
export function startOfLocalDayMs(now: Date = new Date()): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
}

export function endOfLocalDayMs(now: Date = new Date()): number {
  return startOfLocalDayMs(now) + 24 * 60 * 60 * 1000
}

export function buildLastCallLeadPatch(input: {
  calledByLabel: string
  outcome?: Interaction['callOutcome'] | null
  at?: Timestamp
}): {
  lastCallAt: Timestamp
  lastCalledByLabel: string
  lastCallOutcome?: Interaction['callOutcome']
} {
  const label = input.calledByLabel.trim().slice(0, 120) || '—'
  const patch: {
    lastCallAt: Timestamp
    lastCalledByLabel: string
    lastCallOutcome?: Interaction['callOutcome']
  } = {
    lastCallAt: input.at ?? Timestamp.now(),
    lastCalledByLabel: label,
  }
  if (input.outcome) patch.lastCallOutcome = input.outcome
  return patch
}

export function callQueueFilterMatches(
  lead: LeadCallSignalFields,
  filter: CallQueueFilter,
  now: Date = new Date(),
): boolean {
  if (filter === 'all') return true
  const at = effectiveLastCallAt(lead)
  const atMs = at ? at.toMillis() : null

  if (filter === 'never_called') return atMs == null

  if (filter === 'called_today') {
    if (atMs == null) return false
    return atMs >= startOfLocalDayMs(now) && atMs < endOfLocalDayMs(now)
  }

  if (filter === 'needs_callback') {
    if (lead.lastCallOutcome === 'FOLLOW_UP') return true
    const follow = lead.nextFollowUpDate
    if (!isTs(follow)) return false
    // Due today or overdue (follow-up timestamp before end of today)
    return follow.toMillis() < endOfLocalDayMs(now)
  }

  return true
}

/** Dòng ngắn trên danh sách hồ sơ — ưu tiên tín hiệu gọi, không phải AI summary. */
export function formatLeadLastCallLine(
  lead: Pick<LeadCallSignalFields, 'lastCallAt' | 'lastCallAiAt' | 'lastCalledByLabel' | 'lastCallOutcome'>,
): string {
  const at = effectiveLastCallAt(lead)
  if (!at) return 'Chưa gọi'
  const when = new Date(at.toMillis()).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  const who = lead.lastCalledByLabel?.trim()
  const outcome = lead.lastCallOutcome ? OUTCOME_VI[lead.lastCallOutcome] ?? lead.lastCallOutcome : null
  const parts = [`Gọi ${when}`]
  if (who) parts.push(who)
  else if (!lead.lastCallAt && lead.lastCallAiAt) parts.push('đã đánh giá gọi')
  if (outcome) parts.push(outcome)
  return parts.join(' · ')
}

/** Type guard helper for Lead list filtering. */
export function leadMatchesCallQueueFilter(
  lead: Pick<Lead, 'lastCallAt' | 'lastCallAiAt' | 'lastCalledByLabel' | 'lastCallOutcome' | 'nextFollowUpDate'>,
  filter: CallQueueFilter,
  now?: Date,
): boolean {
  return callQueueFilterMatches(lead, filter, now)
}
