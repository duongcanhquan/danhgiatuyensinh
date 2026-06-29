/**
 * Callable đọc lịch sử gọi OMICall — nằm codebase `default` (cùng IAM với omicallClick2Call).
 */
import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp, type Firestore, type Query } from 'firebase-admin/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'

const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || 'warmlist'

function getDb(): Firestore {
  const app = getApps()[0] ?? initializeApp()
  return getFirestore(app, FIRESTORE_DATABASE_ID)
}

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

async function loadStaffUser(db: Firestore, uid: string): Promise<StaffUserLite | null> {
  const databases = [FIRESTORE_DATABASE_ID, '(default)'].filter(
    (id, i, arr) => arr.indexOf(id) === i,
  )
  for (const databaseId of databases) {
    try {
      const app = getApps()[0]
      const dbInst =
        databaseId === FIRESTORE_DATABASE_ID
          ? db
          : databaseId === '(default)'
            ? getFirestore(app)
            : getFirestore(app, databaseId)
      const snap = await dbInst.collection(COLLECTIONS.users).doc(uid).get()
      if (!snap.exists) continue
      const d = snap.data() ?? {}
      return {
        id: uid,
        role: str(d.role) || 'counselor',
        isActive: d.isActive !== false,
        managedCounselorIds: Array.isArray(d.managedCounselorIds)
          ? d.managedCounselorIds.map((x) => String(x))
          : [],
      }
    } catch (e) {
      console.warn('[fetchOmicallCallsForClient] loadStaffUser', databaseId, e)
    }
  }
  return null
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

function isIndexError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /index|FAILED_PRECONDITION/i.test(msg)
}

async function queryOmicallByDateField(
  db: Firestore,
  field: 'endedAt' | 'startedAt',
  fromTs: Timestamp,
  toTs: Timestamp,
  limit: number,
  counselorUid?: string,
): Promise<OmicallCallWire[]> {
  let q: Query = db.collection(COLLECTIONS.omicallCalls)
  if (counselorUid) q = q.where('counselorUid', '==', counselorUid)
  const snap = await q
    .where(field, '>=', fromTs)
    .where(field, '<=', toTs)
    .limit(limit)
    .get()
  return snap.docs.map((d) => toCallWireFromOmicallDoc(d.id, d.data() as Record<string, unknown>))
}

async function fetchInteractionsForLead(
  db: Firestore,
  leadId: string,
  fromTs: Timestamp,
  toTs: Timestamp,
  perLeadCap: number,
): Promise<OmicallCallWire[]> {
  const snap = await db
    .collection(COLLECTIONS.leads)
    .doc(leadId)
    .collection(COLLECTIONS.interactions)
    .where('provider', '==', 'OMICALL')
    .where('timestamp', '>=', fromTs)
    .where('timestamp', '<=', toTs)
    .limit(perLeadCap)
    .get()
  const rows: OmicallCallWire[] = []
  for (const d of snap.docs) {
    const wire = toCallWireFromInteractionDoc(d.id, d.data() as Record<string, unknown>)
    if (!wire) continue
    rows.push({ ...wire, leadId })
  }
  return rows
}

async function fetchInteractionsViaLeads(
  db: Firestore,
  fromTs: Timestamp,
  toTs: Timestamp,
  cap: number,
  counselorUids: string[],
): Promise<OmicallCallWire[]> {
  const merged = new Map<string, OmicallCallWire>()
  const targets = [...new Set(counselorUids.filter(Boolean))].slice(0, 15)
  if (targets.length === 0) return []

  for (const counselorUid of targets) {
    if (merged.size >= cap) break
    try {
      let leadsSnap = await db
        .collection(COLLECTIONS.leads)
        .where('assignedCounselorId', '==', counselorUid)
        .limit(80)
        .get()
      if (leadsSnap.empty) {
        leadsSnap = await db
          .collection(COLLECTIONS.leads)
          .where('assignedTo', '==', counselorUid)
          .limit(80)
          .get()
      }
      for (const leadDoc of leadsSnap.docs) {
        if (merged.size >= cap) break
        try {
          const batch = await fetchInteractionsForLead(db, leadDoc.id, fromTs, toTs, 30)
          for (const row of batch) merged.set(row.id, row)
        } catch (e) {
          console.warn('[fetchOmicallCallsForClient] lead interactions', leadDoc.id, e)
        }
      }
    } catch (e) {
      console.warn('[fetchOmicallCallsForClient] leads query', counselorUid, e)
    }
  }
  return [...merged.values()]
}

async function fetchInteractionsCollectionGroup(
  db: Firestore,
  fromTs: Timestamp,
  toTs: Timestamp,
  cap: number,
  withProvider: boolean,
): Promise<OmicallCallWire[]> {
  let q: Query = db.collectionGroup(COLLECTIONS.interactions)
  if (withProvider) q = q.where('provider', '==', 'OMICALL')
  const snap = await q
    .where('timestamp', '>=', fromTs)
    .where('timestamp', '<=', toTs)
    .limit(cap)
    .get()
  return snap.docs
    .map((d) => {
      const wire = toCallWireFromInteractionDoc(d.id, d.data() as Record<string, unknown>)
      if (!wire) return null
      const leadId = d.ref.parent.parent?.id
      return leadId ? { ...wire, leadId: wire.leadId || leadId } : wire
    })
    .filter((v): v is OmicallCallWire => Boolean(v))
}

async function fetchInteractionsFallback(
  db: Firestore,
  fromTs: Timestamp,
  toTs: Timestamp,
  cap: number,
  counselorUids: string[],
): Promise<OmicallCallWire[]> {
  if (counselorUids.length > 0) {
    try {
      const viaLeads = await fetchInteractionsViaLeads(db, fromTs, toTs, cap, counselorUids)
      if (viaLeads.length > 0) return viaLeads
    } catch (e) {
      console.warn('[fetchOmicallCallsForClient] interactions via leads', e)
    }
  }

  for (const withProvider of [true, false]) {
    try {
      const rows = await fetchInteractionsCollectionGroup(db, fromTs, toTs, cap, withProvider)
      if (rows.length > 0) return rows
    } catch (e) {
      console.warn('[fetchOmicallCallsForClient] collectionGroup', e)
    }
  }

  return []
}

async function fetchOmicallCallsRows(
  db: Firestore,
  fromTs: Timestamp,
  toTs: Timestamp,
  fetchCap: number,
  counselorUids: string[],
): Promise<{ rows: OmicallCallWire[]; source: 'omicallCalls' | 'interactions_fallback' }> {
  const merged = new Map<string, OmicallCallWire>()
  const tryCounselors = counselorUids.length > 0 ? counselorUids.slice(0, 12) : [undefined]

  for (const uid of tryCounselors) {
    for (const field of ['endedAt', 'startedAt'] as const) {
      try {
        const batch = await queryOmicallByDateField(db, field, fromTs, toTs, fetchCap, uid)
        for (const row of batch) merged.set(row.id, row)
        if (merged.size >= fetchCap) break
      } catch (e) {
        if (!isIndexError(e)) console.warn(`[fetchOmicallCallsForClient] omicallCalls.${field}`, e)
      }
    }
    if (merged.size >= fetchCap) break
  }

  if (merged.size > 0) {
    return { rows: [...merged.values()], source: 'omicallCalls' }
  }

  const interactionRows = await fetchInteractionsFallback(db, fromTs, toTs, fetchCap, counselorUids)
  return { rows: interactionRows, source: 'interactions_fallback' }
}

function counselorUidsForScope(
  caller: StaffUserLite,
  teamSet: Set<string>,
  requestedScope: OmicallClientScope,
): string[] {
  if (requestedScope.mode === 'counselor' && requestedScope.counselorUid) {
    return [requestedScope.counselorUid]
  }
  if (requestedScope.mode === 'team') {
    return [...teamSet]
  }
  if (caller.role === 'counselor') return [caller.id]
  return []
}

export const fetchOmicallCallsForClient = onCall(
  { region: 'asia-southeast1', timeoutSeconds: 120, memory: '512MiB' },
  async (request) => {
    try {
      if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Cần đăng nhập.')
      const db = getDb()
      const caller = await loadStaffUser(db, request.auth.uid)
      if (!caller || !caller.isActive) {
        throw new HttpsError('permission-denied', 'Không có quyền truy cập (thiếu hồ sơ users).')
      }

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
      const counselorUids = counselorUidsForScope(caller, teamSet, requestedScope)

      const { rows, source } = await fetchOmicallCallsRows(db, fromTs, toTs, fetchCap, counselorUids)

      const scoped = rows
        .filter((c) => scopeAllowsWireCall(c, caller, teamSet, requestedScope))
        .sort(
          (a, b) =>
            (b.endedAtMs || b.startedAtMs || b.createdAtMs || 0) -
            (a.endedAtMs || a.startedAtMs || a.createdAtMs || 0),
        )
        .slice(0, maxRows)

      const result: {
        ok: boolean
        source: typeof source
        calls: OmicallCallWire[]
        warning?: string
      } = {
        ok: true,
        source,
        calls: scoped,
      }
      if (scoped.length === 0 && rows.length === 0) {
        result.warning = 'Chưa có cuộc gọi OMICall trong kỳ đã chọn.'
      }
      return result
    } catch (e) {
      if (e instanceof HttpsError) throw e
      console.error('[fetchOmicallCallsForClient] unhandled', e)
      const msg = e instanceof Error ? e.message : String(e)
      throw new HttpsError('internal', msg.slice(0, 400) || 'Lỗi đọc lịch sử gọi.')
    }
  },
)
