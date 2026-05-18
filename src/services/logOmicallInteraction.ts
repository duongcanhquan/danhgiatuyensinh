import { addDoc, collection, Timestamp, type Firestore } from 'firebase/firestore'
import type { Interaction, OmicallCallTarget, UserRole, VietMyUserProfile } from '../types'
import { FS_COLLECTIONS } from '../types'
import { commitAuditLog } from './auditLog'
import type { OmicallCallData } from './omicallSdk'
import { OMICALL_TARGET_LABELS, parseOmicallUserData } from '../utils/omicallConfig'

function durationSecondsFromCall(call: OmicallCallData): number | undefined {
  const talk = call.callingDuration?.value ?? 0
  const ring = call.ringingDuration?.value ?? 0
  const total = talk + ring
  return total > 0 ? total : undefined
}

function callOutcomeFromCall(call: OmicallCallData): Interaction['callOutcome'] {
  if (call.state === 'accepted' || (call.callingDuration?.value ?? 0) > 0) return 'CONNECTED'
  if (call.isHangup) return 'OTHER'
  if (call.rejectCode) return 'NO_ANSWER'
  return 'NO_ANSWER'
}

export async function logOmicallInteraction(
  db: Firestore,
  call: OmicallCallData,
  profile: Pick<VietMyUserProfile, 'id' | 'role' | 'displayName'>,
): Promise<{ leadId: string } | null> {
  const meta = parseOmicallUserData(call.userData)
  if (!meta?.leadId) return null

  const targetLabel = OMICALL_TARGET_LABELS[meta.target as OmicallCallTarget] ?? meta.target
  const dir = call.direction === 'inbound' ? 'gọi vào' : 'gọi ra'
  const outcome = callOutcomeFromCall(call)
  const durationSeconds = durationSecondsFromCall(call)
  const noteParts = [
    `OMICall — ${dir} ${targetLabel}`,
    `SĐT: ${call.displayNumber || meta.phone}`,
    outcome === 'CONNECTED' ? 'Đã bắt máy' : 'Chưa bắt máy / không trả lời',
  ]
  if (call.uid) noteParts.push(`Mã cuộc gọi: ${call.uid}`)

  const sub = collection(db, FS_COLLECTIONS.leads, meta.leadId, FS_COLLECTIONS.interactions)
  await addDoc(sub, {
    leadId: meta.leadId,
    channel: 'CALL',
    authorUid: profile.id,
    authorRole: profile.role as UserRole,
    counselorNote: noteParts.join(' · '),
    callOutcome: outcome,
    durationSeconds,
    timestamp: Timestamp.now(),
  })

  await commitAuditLog(db, {
    leadId: meta.leadId,
    actionType: 'SYSTEM_UPDATE',
    description: `Cuộc gọi OMICall (${targetLabel}): ${noteParts[2]} — ${call.displayNumber || meta.phone}`,
    performedBy: profile.id,
    performedByName: profile.displayName || profile.id,
  })

  return { leadId: meta.leadId }
}
