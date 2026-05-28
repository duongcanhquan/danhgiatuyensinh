/**
 * Codebase tách riêng — không dùng defineSecret OMICall.
 * Deploy: firebase deploy --only functions:callhistory:fetchOmicallCallsForClient
 */
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { setGlobalOptions } from 'firebase-functions/v2'
import { onCall, HttpsError } from 'firebase-functions/v2/https'

const app = initializeApp()
setGlobalOptions({ region: 'asia-southeast1', maxInstances: 10 })

const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || 'warmlist'
const db = getFirestore(app, FIRESTORE_DATABASE_ID)

const COLLECTIONS = {
  users: 'users',
  leads: 'leads',
  interactions: 'interactions',
  omicallCalls: 'omicallCalls',
} as const

type CallOutcome = 'CONNECTED' | 'NO_ANSWER' | 'OTHER'

type StaffUserLite = {
  id: string
  role: string
  isActive: boolean
  managedCounselorIds: string[]
}

type OmicallClientScope =
  | { mode: 'global' }
  | { mode: 'team'; teamLeadUid?: string }
  | { mode: 'counselor'; counselorUid?: string }

type OmicallCallWire = {
  id: string
  transactionId: string
  direction: string
  phoneNumber: string
  displayNumber?: string
  hotline?: string
  sipUser?: string
  leadId?: string
  counselorUid?: string
  teamLeadUid?: string
  answerSeconds: number
  billSeconds: number
  durationSeconds: number
  recordSeconds: number
  recordingFileUrl?: string
  outcome: CallOutcome
  state?: string
  isFinal?: boolean
  callNote?: string
  createdAtMs?: number
  startedAtMs?: number
  endedAtMs?: number
}

function str(v: unknown): string {
  return String(v ?? '').trim()
}

function num(v: unknown): number {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

function isAdminLikeRole(role: string): boolean {
  return role === 'admin' || role === 'super_admin'
}

async function loadStaffUser(uid: string): Promise<StaffUserLite | null> {
  const snap = await db.collection(COLLECTIONS.users).doc(uid).get()
  if (!snap.exists) return null
  const d = snap.data() ?? {}
  return {
    id: uid,
    role: str(d.role) || 'counselor',
    isActive: d.isActive !== false,
    managedCounselorIds: Array.isArray(d.managedCounselorIds)
      ? d.managedCounselorIds.map((x) => String(x))
      : [],
  }
}

function tsMs(ts?: Timestamp): number | undefined {
  if (!ts) return undefined
  try {
    return ts.toMillis()
  } catch {
    return undefined
  }
}

function toCallWireFromOmicallDoc(id: string, data: Record<string, unknown>): OmicallCallWire {
  return {
    id,
    transactionId: str(data.transactionId) || id,
    direction: str(data.direction) || 'outbound',
    phoneNumber: str(data.phoneNumber),
    displayNumber: str(data.displayNumber) || undefined,
    hotline: str(data.hotline) || undefined,
    sipUser: str(data.sipUser) || undefined,
    leadId: str(data.leadId) || undefined,
    counselorUid: str(data.counselorUid) || undefined,
    teamLeadUid: str(data.teamLeadUid) || undefined,
    answerSeconds: num(data.answerSeconds),
    billSeconds: num(data.billSeconds),
    durationSeconds: num(data.durationSeconds),
    recordSeconds: num(data.recordSeconds),
    recordingFileUrl: str(data.recordingFileUrl) || undefined,
    outcome:
      str(data.outcome) === 'CONNECTED'
        ? 'CONNECTED'
        : str(data.outcome) === 'NO_ANSWER'
          ? 'NO_ANSWER'
          : 'OTHER',
    state: str(data.state) || undefined,
    isFinal: data.isFinal === true,
    callNote: str(data.callNote) || undefined,
    createdAtMs: tsMs(data.createdAt as Timestamp | undefined),
    startedAtMs: tsMs(data.startedAt as Timestamp | undefined),
    endedAtMs: tsMs(data.endedAt as Timestamp | undefined),
  }
}

function inferDirectionFromInteractionNote(note: string): string {
  const n = note.toLowerCase()
  if (n.includes('gọi vào')) return 'inbound'
  return 'outbound'
}

function toCallWireFromInteractionDoc(id: string, data: Record<string, unknown>): OmicallCallWire | null {
  if (str(data.provider).toUpperCase() !== 'OMICALL') return null
  const ts = data.timestamp as Timestamp | undefined
  if (!ts) return null
  const note = str(data.counselorNote)
  const answerSeconds = num(data.answerSeconds) || num(data.durationSeconds)
  const billSeconds = num(data.billSeconds) || num(data.durationSeconds)
  const callOutcome = str(data.callOutcome).toUpperCase()
  const outcome: CallOutcome =
    callOutcome === 'CONNECTED' ? 'CONNECTED' : callOutcome === 'NO_ANSWER' ? 'NO_ANSWER' : 'OTHER'
  return {
    id: `int-${id}`,
    transactionId: str(data.providerCallId) || id,
    direction: inferDirectionFromInteractionNote(note),
    phoneNumber: str(data.phone),
    displayNumber: str(data.displayNumber) || undefined,
    hotline: str(data.hotline) || undefined,
    sipUser: str(data.sipUser) || undefined,
    leadId: str(data.leadId) || undefined,
    counselorUid: str(data.authorUid) || undefined,
    teamLeadUid: undefined,
    answerSeconds,
    billSeconds,
    durationSeconds: Math.max(answerSeconds, billSeconds),
    recordSeconds: num(data.recordSeconds),
    recordingFileUrl: str(data.recordingUrl) || undefined,
    outcome,
    state: 'ended',
    isFinal: true,
    callNote: note || undefined,
    createdAtMs: tsMs(ts),
    startedAtMs: tsMs(ts),
    endedAtMs: tsMs(ts),
  }
}

function scopeAllowsWireCall(
  call: OmicallCallWire,
  caller: StaffUserLite,
  teamSet: Set<string>,
  requestedScope: OmicallClientScope,
): boolean {
  if (isAdminLikeRole(caller.role)) {
    if (requestedScope.mode === 'counselor') return call.counselorUid === requestedScope.counselorUid
    if (requestedScope.mode === 'team' && requestedScope.teamLeadUid) {
      return call.teamLeadUid === requestedScope.teamLeadUid
    }
    return true
  }
  if (caller.role === 'team_lead') {
    if (requestedScope.mode === 'global') return false
    if (requestedScope.mode === 'team' && requestedScope.teamLeadUid && requestedScope.teamLeadUid !== caller.id) {
      return false
    }
    const uid = call.counselorUid || ''
    if (requestedScope.mode === 'counselor') return uid === requestedScope.counselorUid && teamSet.has(uid)
    return teamSet.has(uid) || call.teamLeadUid === caller.id
  }
  return call.counselorUid === caller.id
}

/** Đọc cuộc gọi qua Admin SDK — không cần Secret Manager / OMICall API key. */
export const fetchOmicallCallsForClient = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Cần đăng nhập.')
  const caller = await loadStaffUser(request.auth.uid)
  if (!caller || !caller.isActive) throw new HttpsError('permission-denied', 'Không có quyền truy cập.')

  const fromMs = Math.max(0, Math.round(num(request.data?.fromMs)))
  const toMs = Math.max(fromMs, Math.round(num(request.data?.toMs)))
  const maxRows = Math.min(Math.max(Math.round(num(request.data?.maxRows) || 500), 50), 4000)
  const rawScope = (request.data?.scope ?? {}) as Record<string, unknown>
  const requestedScope: OmicallClientScope =
    str(rawScope.mode) === 'counselor'
      ? { mode: 'counselor', counselorUid: str(rawScope.counselorUid) || undefined }
      : str(rawScope.mode) === 'team'
        ? { mode: 'team', teamLeadUid: str(rawScope.teamLeadUid) || undefined }
        : { mode: 'global' }

  const teamSet = new Set<string>(caller.managedCounselorIds)
  if (caller.role === 'team_lead') teamSet.add(caller.id)

  const fromTs = Timestamp.fromMillis(fromMs)
  const toTs = Timestamp.fromMillis(toMs)
  const fetchCap = Math.min(Math.max(maxRows * 3, 1200), 6000)

  const callSnap = await db
    .collection(COLLECTIONS.omicallCalls)
    .where('endedAt', '>=', fromTs)
    .where('endedAt', '<=', toTs)
    .limit(fetchCap)
    .get()

  let rows: OmicallCallWire[] = callSnap.docs.map((d) =>
    toCallWireFromOmicallDoc(d.id, d.data() as Record<string, unknown>),
  )
  let source: 'omicallCalls' | 'interactions_fallback' = 'omicallCalls'

  if (rows.length === 0) {
    const interactionSnap = await db
      .collectionGroup(COLLECTIONS.interactions)
      .where('timestamp', '>=', fromTs)
      .where('timestamp', '<=', toTs)
      .limit(Math.min(Math.max(maxRows * 4, 1500), 8000))
      .get()
    rows = interactionSnap.docs
      .map((d) => toCallWireFromInteractionDoc(d.id, d.data() as Record<string, unknown>))
      .filter((v): v is OmicallCallWire => Boolean(v))
    source = 'interactions_fallback'
  }

  const scoped = rows
    .filter((c) => scopeAllowsWireCall(c, caller, teamSet, requestedScope))
    .sort(
      (a, b) =>
        (b.endedAtMs || b.startedAtMs || b.createdAtMs || 0) -
        (a.endedAtMs || a.startedAtMs || a.createdAtMs || 0),
    )
    .slice(0, maxRows)

  return { ok: true, source, calls: scoped }
})
