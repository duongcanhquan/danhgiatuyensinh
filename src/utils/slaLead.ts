import type { Timestamp } from 'firebase/firestore'
import type { Lead, PriorityTag } from '../types'

const MS_24H = 24 * 60 * 60 * 1000

export function effectiveTouchMs(l: Lead): number {
  return (l.lastTouchedAt ?? l.updatedAt).toMillis()
}

/** NEW column + no meaningful touch for 24h+ (SLA breach indicator). */
export function isStaleNewSla(l: Lead): boolean {
  if (l.status !== 'NEW') return false
  return Date.now() - effectiveTouchMs(l) > MS_24H
}

export function isHotStaleNewSla(l: Lead, priorityTag: PriorityTag): boolean {
  return priorityTag === 'HOT' && isStaleNewSla(l)
}

/** Calendar “today” local match for follow-up highlight. */
export function isFollowUpTodayLocal(next: Timestamp | null | undefined): boolean {
  if (!next) return false
  try {
    const d = next.toDate()
    const n = new Date()
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
  } catch {
    return false
  }
}
