import { doc, getDoc, setDoc, Timestamp, type Firestore } from 'firebase/firestore'
import { FS_COLLECTIONS, type OmicallCallTarget } from '../types'

export type UpsertOmicallCallClientInput = {
  transactionId: string
  callUuid?: string
  leadId: string
  phone: string
  counselorUid: string
  orgId?: string
  target?: OmicallCallTarget
  direction?: 'outbound' | 'inbound'
  billSeconds?: number
  hotline?: string
  sipUser?: string
}

export function isPlaceholderOmicallCallUid(uid: string): boolean {
  const id = uid.trim()
  return id.startsWith('pending-') || id.startsWith('c2c-')
}

/**
 * Ghi thẳng `omicallCalls` từ trình duyệt khi webhook/CF chậm hoặc lỗi —
 * đảm bảo Lịch sử cuộc gọi / KPI có bản ghi ngay sau khi gọi.
 */
export async function upsertOmicallCallFromClient(
  db: Firestore,
  input: UpsertOmicallCallClientInput,
): Promise<void> {
  const transactionId = input.transactionId.trim()
  const leadId = input.leadId.trim()
  if (!transactionId || !leadId) return
  if (isPlaceholderOmicallCallUid(transactionId)) {
    throw new Error('Chưa có mã cuộc gọi thật từ tổng đài — chờ SDK trả uid.')
  }

  const bill = Math.max(0, Math.floor(input.billSeconds ?? 0))
  const outcome = bill > 0 ? 'CONNECTED' : 'NO_ANSWER'
  const now = Timestamp.now()
  const ref = doc(db, FS_COLLECTIONS.omicallCalls, transactionId)
  const existing = await getDoc(ref)
  const prevCreated = existing.exists() ? existing.data()?.createdAt : undefined

  await setDoc(
    ref,
    {
      transactionId,
      callUuid: (input.callUuid ?? transactionId).trim() || transactionId,
      state: 'ended',
      direction: input.direction === 'inbound' ? 'inbound' : 'outbound',
      phoneNumber: input.phone.trim(),
      displayNumber: input.phone.trim(),
      leadId,
      counselorUid: input.counselorUid,
      orgId: input.orgId?.trim() || null,
      hotline: input.hotline?.trim() || null,
      sipUser: input.sipUser?.trim() || null,
      answerSeconds: bill,
      billSeconds: bill,
      durationSeconds: bill,
      recordSeconds: 0,
      outcome,
      isFinal: true,
      isValidCall: bill >= 45 && Boolean(leadId),
      invalidReason: bill >= 45 ? null : 'under_45s_or_client',
      syncSource: 'sdk',
      provider: 'OMICALL',
      endedAt: now,
      syncedAt: now,
      updatedAt: now,
      createdAt: prevCreated ?? now,
      userDataLeadId: leadId,
      userDataCounselorUid: input.counselorUid,
      userDataTarget: input.target ?? 'student',
    },
    { merge: true },
  )
}
