import { addDoc, collection, getDocs, limit, query, Timestamp, where, type Firestore } from 'firebase/firestore'
import type { Interaction, OmicallCallTarget, UserRole, VietMyUserProfile } from '../types'
import { FS_COLLECTIONS } from '../types'
import { commitAuditLog } from './auditLog'
import type { OmicallCallData } from './omicallSdk'
import { OMICALL_TARGET_LABELS, parseOmicallUserData } from '../utils/omicallConfig'

function durationSecondsFromCall(call: OmicallCallData): number | undefined {
  const talk = call.callingDuration?.value ?? 0
  return talk > 0 ? talk : undefined
}

function durationText(seconds: number | undefined): string {
  if (!seconds || seconds <= 0) return '0 giây'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m <= 0) return `${s} giây`
  return `${m} phút ${s.toString().padStart(2, '0')} giây`
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
  profile: Pick<VietMyUserProfile, 'id' | 'role' | 'displayName' | 'omicallSipUser'>,
): Promise<{ leadId: string } | null> {
  const meta = parseOmicallUserData(call.userData)
  if (!meta?.leadId) return null

  const sub = collection(db, FS_COLLECTIONS.leads, meta.leadId, FS_COLLECTIONS.interactions)
  if (call.uid) {
    const dup = await getDocs(query(sub, where('providerCallId', '==', call.uid), limit(1)))
    if (!dup.empty) return { leadId: meta.leadId }
  }

  const targetLabel = OMICALL_TARGET_LABELS[meta.target as OmicallCallTarget] ?? meta.target
  const dir = call.direction === 'inbound' ? 'gọi vào' : 'gọi ra'
  const outcome = callOutcomeFromCall(call)
  const durationSeconds = durationSecondsFromCall(call)
  const ringingSeconds = call.ringingDuration?.value ?? 0
  const hotline = call.sipNumber?.number
  const noteParts = [
    `OMICall — ${dir} ${targetLabel}`,
    `SĐT: ${call.displayNumber || meta.phone}`,
    outcome === 'CONNECTED' ? 'Đã bắt máy' : 'Chưa bắt máy / không trả lời',
    `Thời lượng nói chuyện: ${durationText(durationSeconds)}`,
  ]
  if (ringingSeconds > 0) noteParts.push(`Đổ chuông: ${durationText(ringingSeconds)}`)
  if (hotline) noteParts.push(`Đầu số gọi ra: ${hotline}`)
  if (call.rejectCode) noteParts.push(`Mã kết thúc: ${call.rejectCode}`)
  if (call.uuid) noteParts.push(`UUID tổng đài: ${call.uuid}`)
  if (call.uid) noteParts.push(`Mã cuộc gọi: ${call.uid}`)

  await addDoc(sub, {
    leadId: meta.leadId,
    channel: 'CALL',
    authorUid: profile.id,
    authorRole: profile.role as UserRole,
    counselorNote: noteParts.join(' · '),
    callOutcome: outcome,
    durationSeconds,
    provider: 'OMICALL',
    providerCallId: call.uid,
    providerUuid: call.uuid,
    billSeconds: durationSeconds,
    answerSeconds: durationSeconds,
    hotline: hotline ?? null,
    sipUser: profile.omicallSipUser ?? null,
    syncedFrom: 'sdk',
    timestamp: Timestamp.now(),
  })

  await commitAuditLog(db, {
    leadId: meta.leadId,
    actionType: 'SYSTEM_UPDATE',
    description: `Cuộc gọi OMICall (${targetLabel}): ${noteParts[2]} — ${durationText(durationSeconds)} — ${call.displayNumber || meta.phone}`,
    performedBy: profile.id,
    performedByName: profile.displayName || profile.id,
  })

  return { leadId: meta.leadId }
}
