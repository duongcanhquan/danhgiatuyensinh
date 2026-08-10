import { Timestamp, addDoc, collection, deleteField, doc, updateDoc, type Firestore } from 'firebase/firestore'
import type { Interaction, Lead, PriorityTag, UserRole, VietMyUserProfile } from '../types'
import { FS_COLLECTIONS } from '../types'
import { commitAuditLog } from '../services/auditLog'
import {
  buildCallWorkLeadPatch,
  dispositionPriorityOverridesAfterScoring,
  getCallDisposition,
  getDispositionLeadEffects,
  isCallDispositionId,
  type CallDispositionId,
} from './callWorkQueue'
import { leadTouchPatch } from './leadTouch'
import { leadListActivityPatch } from './leadListActivity'

export type PersistLeadCallDispositionResult = {
  leadPatch: Record<string, unknown>
  dispositionId: CallDispositionId
  dispositionLabel: string
}

/**
 * Cập nhật note sau gọi trên đúng 1 hồ sơ (panel chi tiết / ghi nhanh TVV).
 * Ghi lead + interaction CALL kèm disposition để quản lý lọc và xem lịch sử.
 */
export async function persistLeadCallDisposition(
  db: Firestore,
  profile: Pick<VietMyUserProfile, 'id' | 'role' | 'displayName' | 'email'>,
  lead: Pick<
    Lead,
    | 'id'
    | 'callAttemptCount'
    | 'scoringSignals'
    | 'priorityTag'
    | 'callEvalPriorityBoost'
    | 'status'
    | 'pipelineStatus'
  >,
  input: {
    dispositionId: CallDispositionId
    callOutcome?: NonNullable<Interaction['callOutcome']>
    counselorNote?: string
    bumpAttempt?: boolean
  },
): Promise<PersistLeadCallDispositionResult> {
  if (!isCallDispositionId(input.dispositionId)) {
    throw new Error('Note sau gọi không hợp lệ.')
  }
  const def = getCallDisposition(input.dispositionId)!
  const callerLabel = profile.displayName?.trim() || profile.email?.trim() || profile.id
  const prevAttempts =
    typeof lead.callAttemptCount === 'number' && Number.isFinite(lead.callAttemptCount)
      ? Math.max(0, Math.floor(lead.callAttemptCount))
      : 0

  const workPatch = buildCallWorkLeadPatch({
    dispositionId: def.id,
    calledByLabel: callerLabel,
    outcome: input.callOutcome,
    previousAttemptCount: prevAttempts,
    bumpAttempt: input.bumpAttempt !== false,
    existingScoringSignals: lead.scoringSignals,
  })

  const overrides = dispositionPriorityOverridesAfterScoring(def.id, lead.priorityTag)
  const effects = getDispositionLeadEffects(def.id)

  const note =
    input.counselorNote?.trim() ||
    `Note sau gọi: ${def.label}`

  const leadPatch: Record<string, unknown> = {
    ...leadTouchPatch(),
    ...workPatch,
    ...leadListActivityPatch({
      kind: 'call',
      summary: def.label,
      counselorNote: note,
    }),
  }
  if (overrides.priorityTag) leadPatch.priorityTag = overrides.priorityTag
  if (overrides.clearCallEvalPriorityBoost) {
    leadPatch.callEvalPriorityBoost = deleteField()
    leadPatch.callEvalPriorityBoostAt = deleteField()
  } else if (overrides.callEvalPriorityBoost) {
    leadPatch.callEvalPriorityBoost = overrides.callEvalPriorityBoost
    leadPatch.callEvalPriorityBoostAt = Timestamp.now()
  }
  if (effects.status) leadPatch.status = effects.status
  if (effects.pipelineStatus) leadPatch.pipelineStatus = effects.pipelineStatus

  await updateDoc(doc(db, FS_COLLECTIONS.leads, lead.id), leadPatch)

  await addDoc(collection(db, FS_COLLECTIONS.leads, lead.id, FS_COLLECTIONS.interactions), {
    leadId: lead.id,
    channel: 'CALL' as const,
    authorUid: profile.id,
    authorRole: profile.role as UserRole,
    timestamp: Timestamp.now(),
    counselorNote: note,
    callOutcome: workPatch.lastCallOutcome,
    callDispositionId: def.id,
    callDispositionLabel: def.label,
    snapshotCrmStatus: (leadPatch.status as Lead['status'] | undefined) ?? lead.status,
    snapshotPipelineStatus:
      (leadPatch.pipelineStatus as Lead['pipelineStatus'] | undefined) ?? lead.pipelineStatus,
    snapshotPriorityTag: (leadPatch.priorityTag as PriorityTag | undefined) ?? lead.priorityTag,
  })

  await commitAuditLog(db, {
    leadId: lead.id,
    actionType: 'NOTE_ADDED',
    description: `Note sau gọi: ${def.label}`,
    performedBy: profile.id,
    performedByName: callerLabel,
  })

  return {
    leadPatch,
    dispositionId: def.id,
    dispositionLabel: def.label,
  }
}
