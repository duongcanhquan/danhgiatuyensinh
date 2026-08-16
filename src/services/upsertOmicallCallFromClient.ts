import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  Timestamp,
  where,
  type Firestore,
} from 'firebase/firestore'
import { FS_COLLECTIONS, type OmicallCallTarget } from '../types'
import { evaluateClientValidCall } from '../utils/kpiCallValidity'

export type UpsertOmicallCallClientInput = {
  transactionId: string
  callUuid?: string
  leadId: string
  phone: string
  counselorUid: string
  /** Trưởng nhóm — nếu thiếu sẽ tra roster `managedCounselorIds`. */
  teamLeadUid?: string
  orgId?: string
  target?: OmicallCallTarget
  direction?: 'outbound' | 'inbound'
  billSeconds?: number
  hotline?: string
  sipUser?: string
}

async function resolveTeamLeadUidForUpsert(
  db: Firestore,
  counselorUid: string,
  explicit?: string,
  existing?: string | null,
): Promise<string | null> {
  const fromInput = explicit?.trim()
  if (fromInput) return fromInput
  const fromDoc = existing?.trim()
  if (fromDoc) return fromDoc
  const uid = counselorUid.trim()
  if (!uid) return null
  try {
    const q = query(
      collection(db, FS_COLLECTIONS.users),
      where('managedCounselorIds', 'array-contains', uid),
      limit(4),
    )
    const snap = await getDocs(q)
    if (snap.empty) return null
    let preferred: string | null = null
    snap.forEach((d) => {
      const role = String(d.data()?.role ?? '')
      if (
        role === 'team_lead' ||
        role === 'admin' ||
        role === 'head_of_profession' ||
        role === 'head_of_department'
      ) {
        preferred = d.id
      }
    })
    return preferred
  } catch {
    return null
  }
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
  const counselorUid = input.counselorUid.trim()
  const outcome = bill > 0 ? 'CONNECTED' : 'NO_ANSWER'
  const validity = evaluateClientValidCall({
    billSeconds: bill,
    leadId,
    counselorUid,
    outcome,
  })
  const now = Timestamp.now()
  const ref = doc(db, FS_COLLECTIONS.omicallCalls, transactionId)
  const existing = await getDoc(ref)
  const prev = existing.exists() ? (existing.data() as Record<string, unknown>) : undefined
  const prevCreated = prev?.createdAt
  const teamLeadUid = await resolveTeamLeadUidForUpsert(
    db,
    counselorUid,
    input.teamLeadUid,
    prev?.teamLeadUid ? String(prev.teamLeadUid) : null,
  )

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
      counselorUid,
      ...(teamLeadUid ? { teamLeadUid } : {}),
      orgId: input.orgId?.trim() || null,
      hotline: input.hotline?.trim() || null,
      sipUser: input.sipUser?.trim() || null,
      answerSeconds: bill,
      billSeconds: bill,
      durationSeconds: bill,
      recordSeconds: 0,
      outcome,
      isFinal: true,
      isValidCall: validity.isValidCall,
      invalidReason: validity.isValidCall ? null : validity.invalidReason ?? 'invalid_call',
      syncSource: 'sdk',
      provider: 'OMICALL',
      endedAt: now,
      syncedAt: now,
      updatedAt: now,
      createdAt: prevCreated ?? now,
      userDataLeadId: leadId,
      userDataCounselorUid: counselorUid,
      userDataTarget: input.target ?? 'student',
    },
    { merge: true },
  )
}
