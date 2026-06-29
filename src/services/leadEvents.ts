import { addDoc, collection, Timestamp, type Firestore } from 'firebase/firestore'
import type { LeadCounselorStatus, LeadEventType, LeadPipelineStatus, PriorityTag } from '../types'
import { FS_COLLECTIONS } from '../types'

export async function recordLeadEvent(
  db: Firestore,
  opts: {
    leadId: string
    counselorUid: string
    teamLeadUid?: string | null
    type: LeadEventType
    from?: string
    to?: string
  },
): Promise<void> {
  const from = opts.from?.trim()
  const to = opts.to?.trim()
  if (!to || from === to) return

  await addDoc(collection(db, FS_COLLECTIONS.leadEvents), {
    leadId: opts.leadId,
    counselorUid: opts.counselorUid,
    teamLeadUid: opts.teamLeadUid ?? null,
    type: opts.type,
    from: from ?? '',
    to,
    at: Timestamp.now(),
  })
}

export function diffPriorityTag(before?: PriorityTag, after?: PriorityTag): { from?: string; to?: string } | null {
  if (!after || before === after) return null
  return { from: before ?? '', to: after }
}

export function diffCounselorStatus(
  before?: LeadCounselorStatus,
  after?: LeadCounselorStatus,
): { from?: string; to?: string } | null {
  if (!after || before === after) return null
  return { from: before ?? '', to: after }
}

export function diffPipelineStatus(
  before?: LeadPipelineStatus,
  after?: LeadPipelineStatus,
): { from?: string; to?: string } | null {
  if (!after || before === after) return null
  return { from: before ?? '', to: after }
}
