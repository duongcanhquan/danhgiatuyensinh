import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import {
  FieldValue,
  Timestamp,
  getFirestore,
  type DocumentData,
  type Firestore,
  type QuerySnapshot,
} from 'firebase-admin/firestore'
import { setGlobalOptions } from 'firebase-functions/v2'
import { onRequest, onCall, HttpsError } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { defineSecret } from 'firebase-functions/params'
import { loadKpiEvalConfig } from './kpiEvaluationConfig.js'
import {
  applyValidCallKpi,
  evaluateValidCall,
  processRecentLeadEvents,
  rollupKpiMonthly,
} from './kpiEngine.js'
import {
  fetchOmicallHistoryPage,
  parseOmicallUserDataLeadId,
  parseOmicallUserDataCounselorUid,
  extractAgentFromCall,
  extractCustomerName,
  unwrapOmicallWebhookBody,
  omicallTransactionIdFromRaw,
  omicallCustomerPhoneRaw,
  omicallSipUserFromRaw,
  type OmicallHistoryApiVersion,
} from './omicallHistoryApi.js'
import {
  fetchExtensionDetail,
  fetchHotlineListForExtension,
  fetchInternalPhoneList,
  fetchAllInternalPhones,
} from './omicallCallCenterApi.js'
import { omicallClick2Call as postOmicallClick2Call } from './omicallClick2CallApi.js'
import { registerOmicallCallWebhook } from './omicallWebhookApi.js'
import {
  normalizePhoneLocal,
  normalizePhoneIntl,
  normalizeHotlineNumber,
  phoneLookupVariants,
} from './omicallPhone.js'

const app = initializeApp()
setGlobalOptions({ region: 'asia-southeast1', maxInstances: 10 })

const OMICALL_API_KEY = defineSecret('OMICALL_API_KEY')
const OMICALL_API_BASE_URL = defineSecret('OMICALL_API_BASE_URL')
const OMICALL_WEBHOOK_SECRET = defineSecret('OMICALL_WEBHOOK_SECRET')

/** App dùng Firestore database `warmlist`; Functions phải ghi cùng database để UI đọc thấy KPI. */
const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || 'warmlist'
const db = getFirestore(app, FIRESTORE_DATABASE_ID)

const COLLECTIONS = {
  users: 'users',
  leads: 'leads',
  interactions: 'interactions',
  auditLogs: 'auditLogs',
  scoringAux: 'scoringAux',
  omicallCalls: 'omicallCalls',
  omicallCallAnalyses: 'omicallCallAnalyses',
  kpiDaily: 'kpiDaily',
  kpiActivityEvents: 'kpiActivityEvents',
  kpiFinanceEvents: 'kpiFinanceEvents',
  omicallSyncRuns: 'omicallSyncRuns',
  omicallPendingCalls: 'omicallPendingCalls',
} as const

type CallOutcome = 'CONNECTED' | 'NO_ANSWER' | 'OTHER'
type Direction = 'outbound' | 'inbound' | 'local' | string

type NormalizedOmicallCall = {
  transactionId: string
  callUuid?: string
  state?: string
  direction: Direction
  phoneNumber: string
  displayNumber: string
  hotline?: string
  sipUser?: string
  startedAt?: Timestamp
  answeredAt?: Timestamp
  endedAt?: Timestamp
  createdAt?: Timestamp
  answerSeconds: number
  billSeconds: number
  durationSeconds: number
  recordSeconds: number
  recordingFileUrl?: string
  hangupCause?: string
  endByName?: string
  provider?: string
  outcome: CallOutcome
  disposition?: string
  agentId?: string
  agentName?: string
  customerName?: string
  callNote?: string
  userDataLeadId?: string
  userDataCounselorUid?: string
  isAutoCall?: boolean
  evaluationScore?: number
  raw: Record<string, unknown>
}

type UserProfileLite = {
  uid: string
  role: string
  email?: string
  omicallSipUser?: string
  omicallAgentId?: string
}

type LeadMatch = {
  leadId?: string
  counselorUid?: string
  teamLeadUid?: string
}

const PAYMENT_KEYS = ['deposit', 'supplementL1', 'supplementL2', 'supplementL3', 'supplementL4'] as const
const OMICALL_CONFIG_DOC_ID = 'omicallIntegration'

async function loadOmicallServerConfig() {
  const snap = await db.collection(COLLECTIONS.scoringAux).doc(OMICALL_CONFIG_DOC_ID).get()
  const data = snap.exists ? snap.data() ?? {} : {}
  const apiVersion = str(data.historyApiVersion) === 'v2' ? 'v2' : 'v3'
  return {
    enabled: data.enabled === true,
    apiKey: str(data.apiKey),
    apiBaseUrl: str(data.apiBaseUrl),
    webhookSecret: str(data.webhookSecret),
    click2callEnabled: data.click2callEnabled !== false,
    sipRealm: str(data.sipRealm),
    defaultOutboundNumber: str(data.defaultOutboundNumber),
    dialFormat: data.dialFormat === 'local' ? ('local' as const) : ('intl84' as const),
    historySyncEnabled: data.historySyncEnabled !== false,
    historyLookbackMinutes: Math.max(15, Math.min(4320, Math.round(num(data.historyLookbackMinutes) || 180))),
    historyMaxPages: Math.max(1, Math.min(100, Math.round(num(data.historyMaxPages) || 20))),
    historyApiVersion: apiVersion as OmicallHistoryApiVersion,
  }
}

function envSecret(secret: ReturnType<typeof defineSecret>, fallbackName: string): string {
  return secret.value() || process.env[fallbackName] || ''
}

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function str(v: unknown): string {
  return String(v ?? '').trim()
}

function num(v: unknown): number {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

function normalizePhone(raw: unknown): string {
  return normalizePhoneLocal(raw)
}

function toTs(raw: unknown): Timestamp | undefined {
  const n = num(raw)
  if (!n) return undefined
  const ms = n > 10_000_000_000 ? n : n * 1000
  return Timestamp.fromMillis(ms)
}

function parseDateStringToTs(raw: unknown): Timestamp | undefined {
  const s = str(raw)
  if (!s) return undefined
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00.000Z`)
    return Number.isNaN(d.getTime()) ? undefined : Timestamp.fromDate(d)
  }
  const vn = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (vn) {
    const dd = vn[1].padStart(2, '0')
    const mm = vn[2].padStart(2, '0')
    const yyyy = vn[3]
    const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`)
    return Number.isNaN(d.getTime()) ? undefined : Timestamp.fromDate(d)
  }
  return undefined
}

function dayKeyFromTs(ts?: Timestamp): string {
  const d = (ts ?? Timestamp.now()).toDate()
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
}

function callOutcome(answerSeconds: number, billSeconds: number, hangupCause: string, disposition: string): CallOutcome {
  if (answerSeconds > 0 || billSeconds > 0) return 'CONNECTED'
  const d = disposition.toLowerCase()
  if (d === 'answered' || d === 'answer' || d === 'connected') return 'CONNECTED'
  if (d.includes('no_answer') || d.includes('no answer') || d.includes('busy') || d.includes('failed')) return 'NO_ANSWER'
  if (hangupCause) return 'NO_ANSWER'
  return 'OTHER'
}

function isFinalCallState(
  call: Pick<NormalizedOmicallCall, 'state' | 'endedAt' | 'billSeconds' | 'answerSeconds' | 'recordSeconds'>,
  source: 'webhook' | 'history_sync',
): boolean {
  if (source === 'history_sync') return true
  const state = str(call.state).toLowerCase()
  if (state === 'cdr' || state === 'completed' || state === 'ended') return true
  if (state === 'hangup' && call.endedAt) return true
  if (call.endedAt && (call.billSeconds > 0 || call.answerSeconds > 0 || call.recordSeconds > 0)) return true
  return false
}

function normalizeCall(rawInput: Record<string, unknown>): NormalizedOmicallCall | null {
  const raw = unwrapOmicallWebhookBody(rawInput)
  const transactionId = omicallTransactionIdFromRaw(raw)
  if (!transactionId) return null

  const agent = extractAgentFromCall(raw)
  const phoneRaw = omicallCustomerPhoneRaw(raw)
  const phoneNumber = normalizePhone(phoneRaw)
  const displayNumber = str(raw.displayNumber) || str(raw.phone_number) || phoneRaw || phoneNumber
  const answerSeconds = num(raw.answer_sec)
  const billSeconds = num(raw.bill_sec)
  const durationSeconds = num(raw.duration)
  const recordSeconds = num(raw.record_seconds)
  const hangupCause = str(raw.hangup_cause)
  const disposition = str(raw.disposition)
  const outcome = callOutcome(answerSeconds, billSeconds, hangupCause, disposition)
  const state = str(raw.state) || undefined
  const stateLower = str(state).toLowerCase()
  const eventTime = raw.date_time || raw.last_updated_date || raw.created_time || raw.created_date
  const totalEval = asObject(raw.total_evaluate ?? raw.totalEvaluate)
  return {
    transactionId,
    callUuid: str(raw.call_uuid) || str(raw.callUuid) || transactionId,
    state,
    direction: str(raw.direction) || 'outbound',
    phoneNumber,
    displayNumber,
    hotline: str(raw.hotline) || str(raw.sip_number) || undefined,
    sipUser: omicallSipUserFromRaw(raw),
    startedAt: toTs(raw.time_start_call || raw.created_date || raw.created_time || raw.date_time),
    answeredAt: toTs(raw.time_answer_start || raw.time_start_to_answer || (stateLower === 'answered' ? eventTime : undefined)),
    endedAt: toTs(raw.time_end_call || (stateLower === 'hangup' || stateLower === 'cdr' ? eventTime : undefined)),
    createdAt: toTs(raw.created_date || raw.created_time || raw.date_time),
    answerSeconds,
    billSeconds,
    durationSeconds,
    recordSeconds,
    recordingFileUrl: str(raw.recording_file_url) || str(raw.recording_file) || undefined,
    hangupCause: hangupCause || undefined,
    endByName: str(raw.endby_name) || undefined,
    provider: str(raw.provider) || undefined,
    outcome,
    disposition: disposition || undefined,
    agentId: agent.agentId,
    agentName: agent.agentName,
    customerName: extractCustomerName(raw),
    callNote: str(raw.note) || undefined,
    userDataLeadId: parseOmicallUserDataLeadId(raw),
    userDataCounselorUid: parseOmicallUserDataCounselorUid(raw),
    isAutoCall: raw.is_auto_call === true,
    evaluationScore: num(totalEval.point) || undefined,
    raw: rawInput,
  }
}

function buildTeamLeadMap(users: UserProfileLite[], rawDocs: QuerySnapshot<DocumentData>): Map<string, string> {
  const out = new Map<string, string>()
  for (const doc of rawDocs.docs) {
    const d = doc.data()
    const role = str(d.role)
    if (role !== 'team_lead') continue
    const managed = Array.isArray(d.managedCounselorIds) ? d.managedCounselorIds.map(str).filter(Boolean) : []
    for (const uid of managed) out.set(uid, doc.id)
  }
  for (const u of users) {
    if (u.role === 'team_lead' && !out.has(u.uid)) out.set(u.uid, u.uid)
  }
  return out
}

async function resolveCounselorAndLead(fs: Firestore, call: NormalizedOmicallCall): Promise<LeadMatch> {
  const usersSnap = await fs.collection(COLLECTIONS.users).get()
  const users = usersSnap.docs.map((d) => {
    const data = d.data()
    return {
      uid: d.id,
      role: str(data.role) || 'counselor',
      email: str(data.email).toLowerCase() || undefined,
      omicallSipUser: str(data.omicallSipUser) || undefined,
      omicallAgentId: str(data.omicallAgentId) || undefined,
    }
  })
  const teamLeadMap = buildTeamLeadMap(users, usersSnap)
  const byUserData =
    call.userDataCounselorUid ? users.find((u) => u.uid === call.userDataCounselorUid) : undefined
  const bySip = call.sipUser ? users.find((u) => u.omicallSipUser === call.sipUser) : undefined
  const byAgent = call.agentId ? users.find((u) => u.omicallAgentId === call.agentId) : undefined
  const counselorUid = byUserData?.uid || bySip?.uid || byAgent?.uid

  let leadId: string | undefined = call.userDataLeadId
  if (!leadId) {
    const pendingId = call.callUuid || call.transactionId
    if (pendingId) {
      const pendingSnap = await fs.collection(COLLECTIONS.omicallPendingCalls).doc(pendingId).get()
      if (pendingSnap.exists) {
        const p = pendingSnap.data() ?? {}
        const pendingLeadId = str(p.leadId)
        if (pendingLeadId) leadId = pendingLeadId
      }
    }
  }
  if (leadId) {
    const leadSnap = await fs.collection(COLLECTIONS.leads).doc(leadId).get()
    if (leadSnap.exists) {
      const assignedTo = str(leadSnap.data()?.assignedTo || leadSnap.data()?.assignedCounselorId)
      const uid = counselorUid || assignedTo || undefined
      return {
        leadId,
        counselorUid: uid,
        teamLeadUid: uid ? teamLeadMap.get(uid) : undefined,
      }
    }
    leadId = undefined
  }

  const phoneVariants = phoneLookupVariants(call.phoneNumber)
  if (phoneVariants.length) {
    const fields = ['phone', 'parentPhone', 'fatherPhone', 'motherPhone']
    for (const field of fields) {
      for (const variant of phoneVariants) {
        const snap = await fs.collection(COLLECTIONS.leads).where(field, '==', variant).limit(1).get()
        if (!snap.empty) {
          const doc = snap.docs[0]
          leadId = doc.id
          const assignedTo = str(doc.data().assignedTo || doc.data().assignedCounselorId)
          const uid = counselorUid || assignedTo || undefined
          return {
            leadId,
            counselorUid: uid,
            teamLeadUid: uid ? teamLeadMap.get(uid) : undefined,
          }
        }
      }
    }
  }
  return {
    counselorUid,
    teamLeadUid: counselorUid ? teamLeadMap.get(counselorUid) : undefined,
  }
}

function interactionNote(call: NormalizedOmicallCall): string {
  const duration = call.billSeconds || call.answerSeconds || 0
  const minutes = Math.floor(duration / 60)
  const seconds = duration % 60
  const durationText = minutes > 0 ? `${minutes} phút ${seconds.toString().padStart(2, '0')} giây` : `${seconds} giây`
  return [
    `OMICall — ${call.direction === 'inbound' ? 'gọi vào' : 'gọi ra'}`,
    `SĐT: ${call.displayNumber || call.phoneNumber}`,
    call.outcome === 'CONNECTED' ? 'Đã bắt máy' : 'Chưa bắt máy / không trả lời',
    `Thời lượng nói chuyện: ${durationText}`,
    call.hotline ? `Đầu số: ${call.hotline}` : '',
    call.recordingFileUrl ? 'Có ghi âm' : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

async function upsertCallAndInteraction(call: NormalizedOmicallCall, source: 'webhook' | 'history_sync') {
  const kpiCfg = await loadKpiEvalConfig(db)
  const match = await resolveCounselorAndLead(db, call)
  const callRef = db.collection(COLLECTIONS.omicallCalls).doc(call.transactionId)
  const now = Timestamp.now()
  const existing = await callRef.get()
  const existingData = existing.data() as Record<string, unknown> | undefined
  const mergedCall: NormalizedOmicallCall = {
    ...call,
    answerSeconds: Math.max(call.answerSeconds, num(existingData?.answerSeconds)),
    billSeconds: Math.max(call.billSeconds, num(existingData?.billSeconds)),
    recordSeconds: Math.max(call.recordSeconds, num(existingData?.recordSeconds)),
    durationSeconds: Math.max(call.durationSeconds, num(existingData?.durationSeconds)),
    endedAt: call.endedAt ?? (existingData?.endedAt as Timestamp | undefined),
    answeredAt: call.answeredAt ?? (existingData?.answeredAt as Timestamp | undefined),
    startedAt: call.startedAt ?? (existingData?.startedAt as Timestamp | undefined),
    recordingFileUrl: call.recordingFileUrl || str(existingData?.recordingFileUrl) || undefined,
    outcome:
      call.outcome === 'CONNECTED' || str(existingData?.outcome) === 'CONNECTED'
        ? 'CONNECTED'
        : call.outcome,
  }
  const isFinal = isFinalCallState(mergedCall, source) || existingData?.isFinal === true
  const validity = evaluateValidCall(mergedCall, match, kpiCfg)
  const { raw: _raw, ...callFields } = mergedCall
  const payload = {
    ...callFields,
    leadId: match.leadId ?? str(existingData?.leadId) ?? null,
    counselorUid: match.counselorUid ?? str(existingData?.counselorUid) ?? null,
    teamLeadUid: match.teamLeadUid ?? str(existingData?.teamLeadUid) ?? null,
    disposition: mergedCall.disposition ?? null,
    agentId: mergedCall.agentId ?? null,
    agentName: mergedCall.agentName ?? null,
    customerName: mergedCall.customerName ?? null,
    callNote: mergedCall.callNote ?? null,
    isAutoCall: mergedCall.isAutoCall ?? false,
    evaluationScore: mergedCall.evaluationScore ?? null,
    isValidCall: validity.isValid,
    invalidReason: validity.invalidReason ?? null,
    isFinal,
    syncSource: source,
    syncedAt: now,
    updatedAt: now,
    createdAt: mergedCall.createdAt ?? mergedCall.startedAt ?? (existingData?.createdAt as Timestamp) ?? now,
  }
  await callRef.set(payload, { merge: true })

  if (!isFinal) return

    const effectiveLeadId = match.leadId ?? (str(existingData?.leadId) || undefined)
    if (effectiveLeadId && !existingData?.interactionId) {
      const interactionsCol = db.collection(COLLECTIONS.leads).doc(effectiveLeadId).collection(COLLECTIONS.interactions)
      const dupSnap = await interactionsCol.where('providerCallId', '==', mergedCall.transactionId).limit(1).get()
      if (!dupSnap.empty) {
        await callRef.set({ interactionId: dupSnap.docs[0].id }, { merge: true })
      } else {
      const interactionRef = await interactionsCol.add({
        leadId: effectiveLeadId,
        channel: 'CALL',
        authorUid: match.counselorUid || str(existingData?.counselorUid) || 'omicall',
        authorRole: 'counselor',
        counselorNote: interactionNote(mergedCall),
        callOutcome: mergedCall.outcome === 'CONNECTED' ? 'CONNECTED' : 'NO_ANSWER',
        durationSeconds: mergedCall.billSeconds || mergedCall.answerSeconds || undefined,
        provider: 'OMICALL',
        providerCallId: mergedCall.transactionId,
        providerUuid: mergedCall.callUuid ?? null,
        recordingUrl: mergedCall.recordingFileUrl ?? null,
        recordSeconds: mergedCall.recordSeconds || null,
        billSeconds: mergedCall.billSeconds || null,
        answerSeconds: mergedCall.answerSeconds || null,
        hotline: mergedCall.hotline ?? null,
        sipUser: mergedCall.sipUser ?? null,
        syncedFrom: source,
        timestamp: mergedCall.endedAt ?? mergedCall.startedAt ?? now,
      })
      await callRef.set({ interactionId: interactionRef.id }, { merge: true })
      }
    }

  const shouldApplyKpi =
    !existingData?.kpiAppliedAt || (existingData?.kpiPending === true && match.counselorUid)
  if (shouldApplyKpi) {
    if (match.counselorUid) {
      await updateDailyKpi(mergedCall, match, validity.isValid, kpiCfg)
      await callRef.set(
        { kpiAppliedAt: now, kpiPending: FieldValue.delete(), kpiPendingReason: FieldValue.delete() },
        { merge: true },
      )
    } else if (!existingData?.kpiAppliedAt) {
      await callRef.set(
        { kpiPending: true, kpiPendingReason: 'no_counselor', updatedAt: now },
        { merge: true },
      )
    }
  }
}

function normalizedCallFromStored(id: string, data: Record<string, unknown>): NormalizedOmicallCall {
  const answerSeconds = num(data.answerSeconds)
  const billSeconds = num(data.billSeconds)
  const outcomeRaw = str(data.outcome)
  const outcome: CallOutcome =
    outcomeRaw === 'CONNECTED' || outcomeRaw === 'NO_ANSWER' ? outcomeRaw : callOutcome(answerSeconds, billSeconds, '', '')
  return {
    transactionId: str(data.transactionId) || id,
    callUuid: str(data.callUuid) || undefined,
    state: str(data.state) || 'ended',
    direction: str(data.direction) || 'outbound',
    phoneNumber: str(data.phoneNumber),
    displayNumber: str(data.displayNumber) || str(data.phoneNumber),
    hotline: str(data.hotline) || undefined,
    sipUser: str(data.sipUser) || undefined,
    startedAt: data.startedAt as Timestamp | undefined,
    answeredAt: data.answeredAt as Timestamp | undefined,
    endedAt: data.endedAt as Timestamp | undefined,
    createdAt: data.createdAt as Timestamp | undefined,
    answerSeconds,
    billSeconds,
    durationSeconds: num(data.durationSeconds),
    recordSeconds: num(data.recordSeconds),
    recordingFileUrl: str(data.recordingFileUrl) || undefined,
    hangupCause: str(data.hangupCause) || undefined,
    userDataLeadId: str(data.leadId) || undefined,
    userDataCounselorUid: str(data.counselorUid) || undefined,
    outcome,
    disposition: str(data.disposition) || undefined,
    agentId: str(data.agentId) || undefined,
    agentName: str(data.agentName) || undefined,
    customerName: str(data.customerName) || undefined,
    callNote: str(data.callNote) || undefined,
    raw: {},
  }
}

/** Bù KPI cho cuộc gọi đã lưu omicallCalls nhưng chưa ghi kpiDaily. */
async function reconcileKpiFromStoredCalls(lookbackDays = 21): Promise<{ scanned: number; applied: number }> {
  const since = Timestamp.fromMillis(Date.now() - lookbackDays * 86400000)
  const snap = await db
    .collection(COLLECTIONS.omicallCalls)
    .where('endedAt', '>=', since)
    .orderBy('endedAt', 'desc')
    .limit(800)
    .get()
  const kpiCfg = await loadKpiEvalConfig(db)
  let applied = 0
  for (const docSnap of snap.docs) {
    const data = docSnap.data()
    const pending = data.kpiPending === true
    const appliedAt = data.kpiAppliedAt
    const hadCounselorWhenApplied = Boolean(str(data.counselorUid))
    if (appliedAt && !pending && hadCounselorWhenApplied) continue
    if (data.isFinal === false) continue

    const call = normalizedCallFromStored(docSnap.id, data as Record<string, unknown>)
    const storedMatch: LeadMatch = {
      leadId: str(data.leadId) || undefined,
      counselorUid: str(data.counselorUid) || undefined,
      teamLeadUid: str(data.teamLeadUid) || undefined,
    }
    const match =
      storedMatch.counselorUid && storedMatch.leadId
        ? storedMatch
        : await resolveCounselorAndLead(db, call)
    if (!match.counselorUid) continue

    const validity = evaluateValidCall(call, match, kpiCfg)
    await updateDailyKpi(call, match, validity.isValid, kpiCfg)
    await docSnap.ref.set(
      {
        leadId: match.leadId ?? data.leadId ?? null,
        counselorUid: match.counselorUid,
        teamLeadUid: match.teamLeadUid ?? null,
        kpiAppliedAt: Timestamp.now(),
        kpiPending: FieldValue.delete(),
        kpiPendingReason: FieldValue.delete(),
      },
      { merge: true },
    )
    applied++
  }
  return { scanned: snap.size, applied }
}

/** Bù từ interaction client (provider OMICALL) khi chưa có omicallCalls / KPI. */
async function reconcileKpiFromClientInteractions(lookbackDays = 14): Promise<number> {
  const since = Timestamp.fromMillis(Date.now() - lookbackDays * 86400000)
  let snap
  try {
    snap = await db
      .collectionGroup(COLLECTIONS.interactions)
      .where('provider', '==', 'OMICALL')
      .where('timestamp', '>=', since)
      .orderBy('timestamp', 'desc')
      .limit(400)
      .get()
  } catch {
    return 0
  }

  let applied = 0
  for (const docSnap of snap.docs) {
    const data = docSnap.data()
    const transactionId = str(data.providerCallId)
    if (!transactionId) continue
    const callRef = db.collection(COLLECTIONS.omicallCalls).doc(transactionId)
    const existing = await callRef.get()
    if (existing.exists && existing.data()?.kpiAppliedAt && !existing.data()?.kpiPending) continue

    const leadId = str(data.leadId) || docSnap.ref.parent.parent?.id || ''
    if (!leadId) continue
    const billSeconds = num(data.billSeconds) || num(data.durationSeconds)
    const answerSeconds = num(data.answerSeconds) || billSeconds
    const outcome: CallOutcome = answerSeconds > 0 || billSeconds > 0 ? 'CONNECTED' : 'NO_ANSWER'
    const ts = (data.timestamp as Timestamp | undefined) ?? Timestamp.now()
    const call: NormalizedOmicallCall = {
      transactionId,
      callUuid: str(data.providerUuid) || transactionId,
      state: 'ended',
      direction: 'outbound',
      phoneNumber: '',
      displayNumber: '',
      endedAt: ts,
      createdAt: ts,
      answerSeconds,
      billSeconds,
      durationSeconds: billSeconds,
      recordSeconds: 0,
      outcome,
      userDataLeadId: leadId,
      userDataCounselorUid: str(data.authorUid) || undefined,
      recordingFileUrl: str(data.recordingUrl) || undefined,
      hotline: str(data.hotline) || undefined,
      sipUser: str(data.sipUser) || undefined,
      raw: {},
    }
    await upsertCallAndInteraction(call, 'history_sync')
    applied++
  }
  return applied
}

async function updateDailyKpi(
  call: NormalizedOmicallCall,
  match: LeadMatch,
  isValidCall: boolean,
  kpiCfg: Awaited<ReturnType<typeof loadKpiEvalConfig>>,
) {
  const day = dayKeyFromTs(call.endedAt ?? call.startedAt ?? call.createdAt)
  const increments = {
    totalCalls: FieldValue.increment(1),
    outboundCalls: FieldValue.increment(call.direction === 'outbound' ? 1 : 0),
    inboundCalls: FieldValue.increment(call.direction === 'inbound' ? 1 : 0),
    connectedCalls: FieldValue.increment(call.outcome === 'CONNECTED' ? 1 : 0),
    missedCalls: FieldValue.increment(call.outcome === 'CONNECTED' ? 0 : 1),
    talkSeconds: FieldValue.increment(call.billSeconds || call.answerSeconds || 0),
    ringSeconds: FieldValue.increment(Math.max(call.durationSeconds - call.billSeconds, 0)),
    recordings: FieldValue.increment(call.recordingFileUrl ? 1 : 0),
    updatedAt: Timestamp.now(),
  }
  const batch = db.batch()
  if (match.counselorUid) {
    batch.set(
      db.collection(COLLECTIONS.kpiDaily).doc(day).collection('counselors').doc(match.counselorUid),
      { date: day, counselorUid: match.counselorUid, teamLeadUid: match.teamLeadUid ?? null, ...increments },
      { merge: true },
    )
  }
  if (match.teamLeadUid) {
    batch.set(
      db.collection(COLLECTIONS.kpiDaily).doc(day).collection('teams').doc(match.teamLeadUid),
      { date: day, teamLeadUid: match.teamLeadUid, ...increments },
      { merge: true },
    )
  }
  await batch.commit()
  if (isValidCall) {
    await applyValidCallKpi(db, COLLECTIONS.kpiDaily, { day, call, match, isValid: true, cfg: kpiCfg })
  }
}

async function updateDailyCrmKpiFromAuditLogs() {
  const since = Timestamp.fromMillis(Date.now() - 60 * 60_000)
  const snap = await db.collection(COLLECTIONS.auditLogs).where('timestamp', '>=', since).get()
  const usersSnap = await db.collection(COLLECTIONS.users).get()
  const users = usersSnap.docs.map((d) => {
    const u = d.data()
    return {
      uid: d.id,
      role: str(u.role) || 'counselor',
      omicallSipUser: str(u.omicallSipUser) || undefined,
    }
  })
  const teamLeadMap = buildTeamLeadMap(users, usersSnap)
  for (const docSnap of snap.docs) {
    const processedRef = db.collection(COLLECTIONS.kpiActivityEvents).doc(docSnap.id)
    await db.runTransaction(async (tx) => {
      const processed = await tx.get(processedRef)
      if (processed.exists) return
      const data = docSnap.data()
      const performedBy = str(data.performedBy)
      if (!performedBy) {
        tx.set(processedRef, { skipped: true, reason: 'missing_performedBy', processedAt: Timestamp.now() })
        return
      }
      const ts = (data.timestamp as Timestamp | undefined) ?? Timestamp.now()
      const day = dayKeyFromTs(ts)
      const actionType = str(data.actionType)
      const teamLeadUid = teamLeadMap.get(performedBy)
      const increments = {
        crmActions: FieldValue.increment(1),
        notesAdded: FieldValue.increment(actionType === 'NOTE_ADDED' ? 1 : 0),
        statusChanges: FieldValue.increment(actionType === 'STATUS_CHANGE' ? 1 : 0),
        reassignments: FieldValue.increment(actionType === 'REASSIGNMENT' ? 1 : 0),
        aiRuns: FieldValue.increment(actionType === 'AI_RUN' ? 1 : 0),
        updatedAt: Timestamp.now(),
      }
      tx.set(
        db.collection(COLLECTIONS.kpiDaily).doc(day).collection('counselors').doc(performedBy),
        { date: day, counselorUid: performedBy, teamLeadUid: teamLeadUid ?? null, ...increments },
        { merge: true },
      )
      if (teamLeadUid) {
        tx.set(
          db.collection(COLLECTIONS.kpiDaily).doc(day).collection('teams').doc(teamLeadUid),
          { date: day, teamLeadUid, ...increments },
          { merge: true },
        )
      }
      tx.set(processedRef, { processedAt: Timestamp.now(), auditLogId: docSnap.id, date: day, performedBy })
    })
  }
}

function financeEventId(leadId: string, slot: string, amount: number, collectedAt: string): string {
  return `${leadId}_${slot}_${amount}_${collectedAt || 'no-date'}`.replace(/[^\w.-]/g, '_').slice(0, 500)
}

function financeIncrements(slot: string, amount: number) {
  const isDeposit = slot === 'deposit'
  return {
    depositPaidCount: FieldValue.increment(isDeposit ? 1 : 0),
    tuitionPaidCount: FieldValue.increment(isDeposit ? 0 : 1),
    paidCount: FieldValue.increment(1),
    depositRevenueVnd: FieldValue.increment(isDeposit ? amount : 0),
    tuitionRevenueVnd: FieldValue.increment(isDeposit ? 0 : amount),
    approvedRevenueVnd: FieldValue.increment(amount),
    updatedAt: Timestamp.now(),
  }
}

async function updateDailyFinanceKpiFromLeads(kpiCfg: Awaited<ReturnType<typeof loadKpiEvalConfig>>) {
  const approvalOk = kpiCfg.finance.approvalStatus.toUpperCase()
  const fullNeOk = kpiCfg.finance.fullNeStatus
  const since = Timestamp.fromMillis(Date.now() - 24 * 60 * 60_000)
  const [leadSnap, usersSnap] = await Promise.all([
    db.collection(COLLECTIONS.leads).where('updatedAt', '>=', since).get(),
    db.collection(COLLECTIONS.users).get(),
  ])
  const users = usersSnap.docs.map((d) => {
    const u = d.data()
    return {
      uid: d.id,
      role: str(u.role) || 'counselor',
      omicallSipUser: str(u.omicallSipUser) || undefined,
    }
  })
  const teamLeadMap = buildTeamLeadMap(users, usersSnap)

  for (const leadDoc of leadSnap.docs) {
    const lead = leadDoc.data()
    const finance = asObject(lead.finance)
    const payments = asObject(finance.payments)
    const counselorUid = str(lead.assignedTo || lead.assignedCounselorId) || undefined
    const teamLeadUid = counselorUid ? teamLeadMap.get(counselorUid) : undefined
    if (!counselorUid) continue

    for (const slot of PAYMENT_KEYS) {
      const line = asObject(payments[slot])
      const amount = num(line.amountVnd)
      const approval = str(line.approvalStatus).toUpperCase()
      if (!amount || approval !== approvalOk) continue
      const collectedAt = str(line.collectedAt)
      const eventTs = parseDateStringToTs(collectedAt) ?? (lead.updatedAt as Timestamp | undefined) ?? Timestamp.now()
      const day = dayKeyFromTs(eventTs)
      const eventRef = db.collection(COLLECTIONS.kpiFinanceEvents).doc(financeEventId(leadDoc.id, slot, amount, collectedAt))
      await db.runTransaction(async (tx) => {
        const existing = await tx.get(eventRef)
        if (existing.exists) return
        const increments = financeIncrements(slot, amount)
        tx.set(
          db.collection(COLLECTIONS.kpiDaily).doc(day).collection('counselors').doc(counselorUid),
          { date: day, counselorUid, teamLeadUid: teamLeadUid ?? null, ...increments },
          { merge: true },
        )
        if (teamLeadUid) {
          tx.set(
            db.collection(COLLECTIONS.kpiDaily).doc(day).collection('teams').doc(teamLeadUid),
            { date: day, teamLeadUid, ...increments },
            { merge: true },
          )
        }
        tx.set(eventRef, {
          processedAt: Timestamp.now(),
          leadId: leadDoc.id,
          counselorUid,
          teamLeadUid: teamLeadUid ?? null,
          slot,
          amountVnd: amount,
          collectedAt: collectedAt || null,
          date: day,
        })
      })
    }

    if (str(finance.fullNeStatus) === fullNeOk) {
      const eventRef = db.collection(COLLECTIONS.kpiFinanceEvents).doc(`${leadDoc.id}_full_ne`)
      const day = dayKeyFromTs((lead.updatedAt as Timestamp | undefined) ?? Timestamp.now())
      await db.runTransaction(async (tx) => {
        const existing = await tx.get(eventRef)
        if (existing.exists) return
        const increments = { fullNeCount: FieldValue.increment(1), updatedAt: Timestamp.now() }
        tx.set(
          db.collection(COLLECTIONS.kpiDaily).doc(day).collection('counselors').doc(counselorUid),
          { date: day, counselorUid, teamLeadUid: teamLeadUid ?? null, ...increments },
          { merge: true },
        )
        if (teamLeadUid) {
          tx.set(
            db.collection(COLLECTIONS.kpiDaily).doc(day).collection('teams').doc(teamLeadUid),
            { date: day, teamLeadUid, ...increments },
            { merge: true },
          )
        }
        tx.set(eventRef, {
          processedAt: Timestamp.now(),
          leadId: leadDoc.id,
          counselorUid,
          teamLeadUid: teamLeadUid ?? null,
          type: 'full_ne',
          date: day,
        })
      })
    }
  }
}

export const omicallCallWebhook = onRequest(
  { secrets: [OMICALL_WEBHOOK_SECRET] },
  async (req, res): Promise<void> => {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed')
      return
    }
    const serverConfig = await loadOmicallServerConfig()
    const configuredSecret = envSecret(OMICALL_WEBHOOK_SECRET, 'OMICALL_WEBHOOK_SECRET') || serverConfig.webhookSecret
    if (configuredSecret) {
      const token = str(req.get('x-vietmy-omicall-secret') || req.query.secret)
      if (token !== configuredSecret) {
        res.status(401).send('Unauthorized')
        return
      }
    }
    const call = normalizeCall(asObject(req.body))
    if (!call) {
      res.status(400).json({ ok: false, error: 'Missing transaction_id/call_uuid' })
      return
    }
    await upsertCallAndInteraction(call, 'webhook')
    res.json({ ok: true, transactionId: call.transactionId, state: call.state ?? null, final: isFinalCallState(call, 'webhook') })
  },
)

function omicallHeaders(apiKey: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    Authorization: `Bearer ${apiKey}`,
  }
}

async function runOmicallHistorySync(opts: {
  apiKey: string
  baseUrl: string
  lookbackMinutes: number
  maxPages: number
  apiVersion: OmicallHistoryApiVersion
}): Promise<{ processed: number; analysesProcessed: number; analysisError: string | null }> {
  const to = Date.now()
  const from = to - opts.lookbackMinutes * 60_000
  const analysisTransactionIds: string[] = []
  let processed = 0
  for (let page = 1; page <= opts.maxPages; page++) {
    const result = await fetchOmicallHistoryPage(opts.baseUrl, opts.apiKey, page, {
      fromMs: from,
      toMs: to,
      apiVersion: opts.apiVersion,
    })
    if (result.items.length === 0) break
    for (const row of result.items) {
      const call = normalizeCall(row)
      if (!call) continue
      await upsertCallAndInteraction(call, 'history_sync')
      if (call.outcome === 'CONNECTED') analysisTransactionIds.push(call.transactionId)
      processed++
    }
    if (!result.hasNext || result.items.length < 50) break
  }
  let analysesProcessed = 0
  let analysisError: string | null = null
  try {
    analysesProcessed = await syncCallAnalyses(opts.baseUrl, opts.apiKey, analysisTransactionIds)
  } catch (e) {
    analysisError = e instanceof Error ? e.message : String(e)
  }
  return { processed, analysesProcessed, analysisError }
}

async function fetchCallAnalysisList(baseUrl: string, apiKey: string, transactionIds: string[]) {
  const url = `${baseUrl.replace(/\/$/, '')}/api/ai/call_transaction/list`
  const resp = await fetch(url, {
    method: 'POST',
    headers: omicallHeaders(apiKey),
    body: JSON.stringify({ transaction_ids: transactionIds }),
  })
  if (!resp.ok) throw new Error(`OMICall analysis HTTP ${resp.status}`)
  return (await resp.json()) as Record<string, unknown>
}

function rowsFromAnalysisResponse(data: Record<string, unknown>): Record<string, unknown>[] {
  const payload = data.payload
  if (Array.isArray(payload)) return payload.map(asObject)
  const payloadObj = asObject(payload)
  return Object.keys(payloadObj).length ? [payloadObj] : []
}

function compactCallAnalysis(row: Record<string, unknown>) {
  const staffAlignments = Array.isArray(row.staff_word_alignments) ? row.staff_word_alignments : []
  const customerAlignments = Array.isArray(row.customer_word_alignments) ? row.customer_word_alignments : []
  return {
    tenantId: str(row.tenant_id) || null,
    transactionId: str(row.transaction_id),
    direction: str(row.direction) || null,
    recordingFile: str(row.recording_file) || null,
    sipNumber: str(row.sip_number) || null,
    phoneNumber: normalizePhone(row.phone_number) || null,
    timeStartToAnswer: toTs(row.time_start_to_answer) ?? null,
    durationSeconds: num(row.duration),
    billSeconds: num(row.bill_sec),
    resultSpeechAnalytics: asObject(row.result_speech_analytics),
    resultNlpAnalytics: asObject(row.result_nlp_analytics),
    analystResults: asObject(row.analyst_results),
    qualityEvaluationResult: asObject(row.quality_evaluation_result),
    nlAnalyzeResult: asObject(row.nl_analyze_result),
    staffWordAlignmentCount: staffAlignments.length,
    customerWordAlignmentCount: customerAlignments.length,
  }
}

function valueByKeys(input: unknown, keys: readonly string[], depth = 0): unknown {
  if (!input || depth > 4) return undefined
  if (Array.isArray(input)) {
    for (const item of input.slice(0, 20)) {
      const found = valueByKeys(item, keys, depth + 1)
      if (found !== undefined && found !== null && str(found)) return found
    }
    return undefined
  }
  if (typeof input !== 'object') return undefined
  const obj = input as Record<string, unknown>
  const normalized = new Map(Object.keys(obj).map((k) => [k.toLowerCase(), k]))
  for (const key of keys) {
    const realKey = normalized.get(key.toLowerCase())
    if (realKey) {
      const value = obj[realKey]
      if (value !== undefined && value !== null && str(value)) return value
    }
  }
  for (const value of Object.values(obj)) {
    const found = valueByKeys(value, keys, depth + 1)
    if (found !== undefined && found !== null && str(found)) return found
  }
  return undefined
}

function compactText(v: unknown, max = 180): string {
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
  if (typeof v === 'boolean') return v ? 'Có' : 'Không'
  if (typeof v === 'string') return v.replace(/\s+/g, ' ').trim().slice(0, max)
  if (Array.isArray(v)) return compactText(v.find((x) => str(x)), max)
  const obj = asObject(v)
  for (const key of ['summary', 'text', 'content', 'value', 'label', 'name', 'comment', 'result']) {
    const text = compactText(obj[key], max)
    if (text) return text
  }
  return ''
}

function analysisSummaryText(compact: ReturnType<typeof compactCallAnalysis>): string {
  const sources = [compact.qualityEvaluationResult, compact.nlAnalyzeResult, compact.analystResults, compact.resultNlpAnalytics]
  const score = compactText(valueByKeys(sources, ['score', 'total_score', 'quality_score', 'final_score', 'point', 'points']), 24)
  const summary = compactText(
    valueByKeys(sources, ['summary', 'summarize', 'overall', 'overview', 'comment', 'remark', 'evaluation']),
  )
  const sentiment = compactText(valueByKeys(sources, ['sentiment', 'customer_sentiment', 'emotion', 'attitude']), 80)
  const nextAction = compactText(
    valueByKeys(sources, ['next_action', 'recommendation', 'suggestion', 'action', 'follow_up', 'advice']),
  )
  return [
    score ? `Điểm chất lượng: ${score}` : '',
    summary ? `Tóm tắt: ${summary}` : '',
    sentiment ? `Cảm xúc/nhu cầu: ${sentiment}` : '',
    nextAction ? `Gợi ý tiếp theo: ${nextAction}` : '',
  ]
    .filter(Boolean)
    .slice(0, 4)
    .join(' · ')
}

function mergeAnalysisIntoNote(note: string, summary: string): string {
  if (!summary) return note
  const marker = 'Phân tích OMICall:'
  const base = note.includes(marker) ? note.slice(0, note.indexOf(marker)).replace(/[·\s]+$/g, '') : note.trim()
  return base ? `${base} · ${marker} ${summary}` : `${marker} ${summary}`
}

async function syncCallAnalyses(baseUrl: string, apiKey: string, transactionIds: string[]) {
  const ids = [...new Set(transactionIds.map(str).filter(Boolean))].slice(0, 50)
  if (!ids.length) return 0
  const data = await fetchCallAnalysisList(baseUrl, apiKey, ids)
  const rows = rowsFromAnalysisResponse(data)
  if (!rows.length) return 0
  const statusCode = num(data.status_code)
  const version = str(data.instance_version)
  const batch = db.batch()
  let processed = 0
  const now = Timestamp.now()
  for (const row of rows) {
    const compact = compactCallAnalysis(row)
    if (!compact.transactionId) continue
    const analysisRef = db.collection(COLLECTIONS.omicallCallAnalyses).doc(compact.transactionId)
    const callRef = db.collection(COLLECTIONS.omicallCalls).doc(compact.transactionId)
    const callSnap = await callRef.get()
    const callData = callSnap.data()
    const leadId = str(callData?.leadId)
    const interactionId = str(callData?.interactionId)
    const summary = analysisSummaryText(compact)
    batch.set(
      analysisRef,
      {
        ...compact,
        summaryText: summary || null,
        instanceVersion: version || null,
        statusCode: statusCode || null,
        syncedAt: now,
        updatedAt: now,
      },
      { merge: true },
    )
    batch.set(
      callRef,
      {
        aiAnalysisId: compact.transactionId,
        aiAnalysisSyncedAt: now,
        aiAnalysisStatusCode: statusCode || null,
        aiAnalysisSummary: summary || null,
        aiQualityEvaluationResult: compact.qualityEvaluationResult,
        aiNlAnalyzeResult: compact.nlAnalyzeResult,
      },
      { merge: true },
    )
    if (summary && leadId && interactionId) {
      const interactionRef = db
        .collection(COLLECTIONS.leads)
        .doc(leadId)
        .collection(COLLECTIONS.interactions)
        .doc(interactionId)
      const interactionSnap = await interactionRef.get()
      const currentNote = str(interactionSnap.data()?.counselorNote)
      batch.set(
        interactionRef,
        {
          counselorNote: mergeAnalysisIntoNote(currentNote, summary),
          omicallAnalysisSummary: summary,
          omicallAnalysisId: compact.transactionId,
          omicallAnalysisSyncedAt: now,
        },
        { merge: true },
      )
    }
    processed++
  }
  await batch.commit()
  return processed
}

export const syncOmicallCallHistory = onSchedule(
  { schedule: 'every 15 minutes', secrets: [OMICALL_API_KEY, OMICALL_API_BASE_URL] },
  async (): Promise<void> => {
    const serverConfig = await loadOmicallServerConfig()
    const apiKey = envSecret(OMICALL_API_KEY, 'OMICALL_API_KEY') || serverConfig.apiKey
    const baseUrl = envSecret(OMICALL_API_BASE_URL, 'OMICALL_API_BASE_URL') || serverConfig.apiBaseUrl
    const runRef = db.collection(COLLECTIONS.omicallSyncRuns).doc()
    const startedAt = Timestamp.now()
    if (!serverConfig.historySyncEnabled) {
      await runRef.set({ startedAt, status: 'skipped', reason: 'sync_disabled' })
      return
    }
    if (!apiKey || !baseUrl) {
      await runRef.set({ startedAt, status: 'skipped', reason: 'missing_secret' })
      return
    }
    let processed = 0
    let analysesProcessed = 0
    let analysisError: string | null = null
    let error: string | null = null
    try {
      const syncResult = await runOmicallHistorySync({
        apiKey,
        baseUrl,
        lookbackMinutes: serverConfig.historyLookbackMinutes,
        maxPages: serverConfig.historyMaxPages,
        apiVersion: serverConfig.historyApiVersion,
      })
      processed = syncResult.processed
      analysesProcessed = syncResult.analysesProcessed
      analysisError = syncResult.analysisError
      const kpiCfg = await loadKpiEvalConfig(db)
      await reconcileKpiFromStoredCalls(21)
      await reconcileKpiFromClientInteractions(14)
      await updateDailyCrmKpiFromAuditLogs()
      await updateDailyFinanceKpiFromLeads(kpiCfg)
      await processRecentLeadEvents(db, COLLECTIONS.kpiDaily)
      const monthKey = new Date().toISOString().slice(0, 7)
      await rollupKpiMonthly(db, COLLECTIONS.kpiDaily, monthKey, kpiCfg)
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      await runRef.set({
        startedAt,
        finishedAt: Timestamp.now(),
        processed,
        analysesProcessed,
        lookbackMinutes: serverConfig.historyLookbackMinutes,
        apiVersion: serverConfig.historyApiVersion,
        ...(analysisError ? { analysisError } : {}),
        status: error ? 'error' : 'ok',
        ...(error ? { error } : {}),
      })
    }
  },
)

/** Đồng bộ thủ công từ Settings — admin / quyền config:omicall. */
export const triggerOmicallHistorySync = onCall(
  { secrets: [OMICALL_API_KEY, OMICALL_API_BASE_URL] },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Cần đăng nhập.')
    }
    const userSnap = await db.collection(COLLECTIONS.users).doc(request.auth.uid).get()
    const role = str(userSnap.data()?.role)
    if (role !== 'admin' && role !== 'super_admin') {
      throw new HttpsError('permission-denied', 'Chỉ quản trị mới chạy đồng bộ thủ công.')
    }
    const serverConfig = await loadOmicallServerConfig()
    const apiKey = envSecret(OMICALL_API_KEY, 'OMICALL_API_KEY') || serverConfig.apiKey
    const baseUrl = envSecret(OMICALL_API_BASE_URL, 'OMICALL_API_BASE_URL') || serverConfig.apiBaseUrl
    if (!apiKey || !baseUrl) {
      throw new HttpsError('failed-precondition', 'Thiếu API key hoặc base URL OMICall.')
    }
    const lookbackMinutes = Math.max(
      15,
      Math.min(4320, Math.round(num(request.data?.lookbackMinutes) || serverConfig.historyLookbackMinutes)),
    )
    const runRef = db.collection(COLLECTIONS.omicallSyncRuns).doc()
    const startedAt = Timestamp.now()
    try {
      const result = await runOmicallHistorySync({
        apiKey,
        baseUrl,
        lookbackMinutes,
        maxPages: serverConfig.historyMaxPages,
        apiVersion: serverConfig.historyApiVersion,
      })
      const kpiReconcile = await reconcileKpiFromStoredCalls(Math.max(1, Math.ceil(lookbackMinutes / 1440) + 3))
      const interactionsApplied = await reconcileKpiFromClientInteractions(21)
      await runRef.set({
        startedAt,
        finishedAt: Timestamp.now(),
        processed: result.processed,
        analysesProcessed: result.analysesProcessed,
        kpiReconcileApplied: kpiReconcile.applied,
        interactionsKpiApplied: interactionsApplied,
        lookbackMinutes,
        apiVersion: serverConfig.historyApiVersion,
        triggeredBy: request.auth.uid,
        status: 'ok',
        manual: true,
        ...(result.analysisError ? { analysisError: result.analysisError } : {}),
      })
      return {
        ok: true,
        processed: result.processed,
        analysesProcessed: result.analysesProcessed,
        kpiReconcileApplied: kpiReconcile.applied,
        interactionsApplied,
        lookbackMinutes,
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await runRef.set({
        startedAt,
        finishedAt: Timestamp.now(),
        status: 'error',
        error: msg,
        manual: true,
        triggeredBy: request.auth.uid,
      })
      throw new HttpsError('internal', msg)
    }
  },
)

type CallCenterProbeAction = 'internal_phones' | 'hotlines' | 'extension_detail'

/** Kiểm tra API Tổng đài (call_center/*) — đối chiếu cấu hình SIP / hotline. */
export const omicallCallCenterProbe = onCall(
  { secrets: [OMICALL_API_KEY, OMICALL_API_BASE_URL] },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Cần đăng nhập.')
    }
    const userSnap = await db.collection(COLLECTIONS.users).doc(request.auth.uid).get()
    const role = str(userSnap.data()?.role)
    if (role !== 'admin' && role !== 'super_admin') {
      throw new HttpsError('permission-denied', 'Chỉ quản trị mới kiểm tra API Tổng đài.')
    }
    const serverConfig = await loadOmicallServerConfig()
    const apiKey = envSecret(OMICALL_API_KEY, 'OMICALL_API_KEY') || serverConfig.apiKey
    const baseUrl = envSecret(OMICALL_API_BASE_URL, 'OMICALL_API_BASE_URL') || serverConfig.apiBaseUrl
    if (!apiKey || !baseUrl) {
      throw new HttpsError('failed-precondition', 'Thiếu API key hoặc base URL OMICall.')
    }
    const action = str(request.data?.action) as CallCenterProbeAction
    if (action === 'internal_phones') {
      const keyword = str(request.data?.keyword)
      const page = Math.max(1, Math.round(num(request.data?.page) || 1))
      const size = Math.min(50, Math.max(1, Math.round(num(request.data?.size) || 50)))
      const result = await fetchInternalPhoneList(baseUrl, apiKey, { keyword, page, size })
      return {
        ok: true,
        action,
        items: result.items.map(({ sipPassword, ...row }) => ({
          ...row,
          hasPassword: Boolean(sipPassword),
        })),
        totalItems: result.totalItems,
      }
    }
    if (action === 'hotlines') {
      const extension = str(request.data?.extension)
      if (!extension) throw new HttpsError('invalid-argument', 'Cần extension (số nội bộ).')
      const hotlines = await fetchHotlineListForExtension(baseUrl, apiKey, extension)
      return { ok: true, action, extension, hotlines }
    }
    if (action === 'extension_detail') {
      const type = str(request.data?.type) as 'sip_user' | 'user_email' | 'usr_uuid'
      const keyword = str(request.data?.keyword)
      if (!keyword) throw new HttpsError('invalid-argument', 'Cần keyword.')
      const detailType = type === 'user_email' || type === 'usr_uuid' ? type : 'sip_user'
      const detail = await fetchExtensionDetail(baseUrl, apiKey, detailType, keyword)
      return { ok: true, action, detail }
    }
    throw new HttpsError('invalid-argument', 'action không hợp lệ.')
  },
)

async function requireOmicallApiCreds() {
  const serverConfig = await loadOmicallServerConfig()
  const apiKey = envSecret(OMICALL_API_KEY, 'OMICALL_API_KEY') || serverConfig.apiKey
  const baseUrl = envSecret(OMICALL_API_BASE_URL, 'OMICALL_API_BASE_URL') || serverConfig.apiBaseUrl
  if (!apiKey || !baseUrl) {
    throw new HttpsError('failed-precondition', 'Thiếu API key hoặc base URL OMICall.')
  }
  return { apiKey, baseUrl, serverConfig }
}

/** Đồng bộ số nội bộ OMICall → users (email) + cập nhật sipRealm / hotline mặc định. */
export const omicallSyncInternalPhones = onCall(
  { secrets: [OMICALL_API_KEY, OMICALL_API_BASE_URL] },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Cần đăng nhập.')
    const callerSnap = await db.collection(COLLECTIONS.users).doc(request.auth.uid).get()
    const role = str(callerSnap.data()?.role)
    if (role !== 'admin' && role !== 'super_admin') {
      throw new HttpsError('permission-denied', 'Chỉ quản trị mới đồng bộ số nội bộ.')
    }
    const { apiKey, baseUrl, serverConfig } = await requireOmicallApiCreds()
    const dryRun = request.data?.dryRun === true
    const phones = await fetchAllInternalPhones(baseUrl, apiKey, { maxPages: 30 })
    const usersSnap = await db.collection(COLLECTIONS.users).get()
    const usersByEmail = new Map<string, (typeof usersSnap.docs)[number]>()
    for (const doc of usersSnap.docs) {
      const email = str(doc.data().email).toLowerCase()
      if (email) usersByEmail.set(email, doc)
    }

    let matched = 0
    let updated = 0
    let skippedNoEmail = 0
    let skippedNoUser = 0
    let domainHint: string | undefined
    const details: { email: string; sipUser: string; status: string }[] = []

    for (const row of phones) {
      if (row.domain && !domainHint) domainHint = row.domain
      if (!row.email) {
        skippedNoEmail++
        continue
      }
      const userDoc = usersByEmail.get(row.email)
      if (!userDoc) {
        skippedNoUser++
        details.push({ email: row.email, sipUser: row.sipUser, status: 'no_crm_user' })
        continue
      }
      matched++

      let outbound = normalizeHotlineNumber(row.publicNumber)
      let sipPassword = row.sipPassword
      if (row.sipUser) {
        try {
          const hotlines = await fetchHotlineListForExtension(baseUrl, apiKey, row.sipUser)
          if (hotlines[0]) outbound = normalizeHotlineNumber(hotlines[0]) || outbound
        } catch {
          /* hotline list optional */
        }
        if (!sipPassword) {
          try {
            const detail = await fetchExtensionDetail(baseUrl, apiKey, 'sip_user', row.sipUser)
            if (detail?.sipPassword) sipPassword = detail.sipPassword
            if (detail?.sipRealm && !domainHint) domainHint = detail.sipRealm
          } catch {
            /* detail optional */
          }
        }
      }

      const patch: Record<string, unknown> = {
        omicallSipUser: row.sipUser || null,
        omicallAgentId: row.agentId || null,
        omicallOutboundNumber: outbound || null,
        omicallSyncedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }
      if (sipPassword) patch.omicallSipPassword = sipPassword

      if (!dryRun) {
        await userDoc.ref.set(patch, { merge: true })
        updated++
      }
      details.push({
        email: row.email,
        sipUser: row.sipUser,
        status: dryRun ? 'would_update' : 'updated',
      })
    }

    if (!dryRun && domainHint) {
      const realm = domainHint.trim()
      const configRef = db.collection(COLLECTIONS.scoringAux).doc(OMICALL_CONFIG_DOC_ID)
      const configSnap = await configRef.get()
      const currentRealm = str(configSnap.data()?.sipRealm)
      if (!currentRealm && realm) {
        await configRef.set({ sipRealm: realm, updatedAt: Timestamp.now() }, { merge: true })
      }
      const defaultHotline = phones.find((p) => p.publicNumber)?.publicNumber
      if (defaultHotline && !serverConfig.defaultOutboundNumber) {
        await configRef.set(
          { defaultOutboundNumber: normalizeHotlineNumber(defaultHotline), updatedAt: Timestamp.now() },
          { merge: true },
        )
      }
    }

    return {
      ok: true,
      dryRun,
      totalExtensions: phones.length,
      matched,
      updated: dryRun ? 0 : updated,
      skippedNoEmail,
      skippedNoUser,
      domainHint: domainHint ?? null,
      details: details.slice(0, 100),
    }
  },
)

/** Lấy hotline + xác nhận extension cho TVV đang đăng nhập (trước khi gọi). */
export const omicallResolveCallContext = onCall(
  { secrets: [OMICALL_API_KEY, OMICALL_API_BASE_URL] },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Cần đăng nhập.')
    const userSnap = await db.collection(COLLECTIONS.users).doc(request.auth.uid).get()
    if (!userSnap.exists) throw new HttpsError('not-found', 'Không tìm thấy hồ sơ user.')
    const user = userSnap.data() ?? {}
    let sipUser = str(user.omicallSipUser) || str(request.data?.extension)
    const { apiKey, baseUrl, serverConfig } = await requireOmicallApiCreds()
    let detail = null as Awaited<ReturnType<typeof fetchExtensionDetail>> | null
    if (!sipUser) {
      const email = str(user.email).toLowerCase()
      if (email) {
        detail = await fetchExtensionDetail(baseUrl, apiKey, 'user_email', email)
        sipUser = detail?.sipUser || ''
      }
    }
    if (!sipUser) {
      throw new HttpsError(
        'failed-precondition',
        'TVV chưa có số nội bộ — chạy «Đồng bộ số nội bộ» trong Cài đặt hoặc nhập trong Quản lý nhân sự.',
      )
    }
    const hotlines = await fetchHotlineListForExtension(baseUrl, apiKey, sipUser)
    if (!detail) detail = await fetchExtensionDetail(baseUrl, apiKey, 'sip_user', sipUser)
    const outboundFromProfile = normalizeHotlineNumber(user.omicallOutboundNumber)
    const outboundFromConfig = normalizeHotlineNumber(serverConfig.defaultOutboundNumber)
    const outboundFromHotline = hotlines[0] ? normalizeHotlineNumber(hotlines[0]) : ''
    const recommendedOutbound = outboundFromProfile || outboundFromConfig || outboundFromHotline || ''
    const sipRealmConfigured = str(serverConfig.sipRealm)
    const sipRealmFromApi = detail?.sipRealm || ''
    return {
      ok: true,
      sipUser,
      hotlines,
      recommendedOutbound,
      sipRealmConfigured,
      sipRealmFromApi,
      realmMatch: !sipRealmFromApi || !sipRealmConfigured || sipRealmFromApi === sipRealmConfigured,
      extensionEmail: detail?.email || str(user.email).toLowerCase(),
    }
  },
)

async function resolveTvExtensionAndHotline(
  user: Record<string, unknown>,
  serverConfig: Awaited<ReturnType<typeof loadOmicallServerConfig>>,
  apiKey: string,
  baseUrl: string,
): Promise<{ extension: string; hotline: string }> {
  let extension = str(user.omicallSipUser)
  if (!extension) {
    const email = str(user.email).toLowerCase()
    if (email) {
      const detail = await fetchExtensionDetail(baseUrl, apiKey, 'user_email', email)
      extension = detail?.sipUser || ''
    }
  }
  if (!extension) {
    throw new HttpsError(
      'failed-precondition',
      'TVV chưa có số nội bộ — nhập trong Quản lý nhân sự hoặc chạy «Đồng bộ số nội bộ».',
    )
  }
  const hotlines = await fetchHotlineListForExtension(baseUrl, apiKey, extension)
  const hotline =
    normalizeHotlineNumber(user.omicallOutboundNumber) ||
    normalizeHotlineNumber(serverConfig.defaultOutboundNumber) ||
    (hotlines[0] ? normalizeHotlineNumber(hotlines[0]) : '')
  if (!hotline) {
    throw new HttpsError(
      'failed-precondition',
      'Chưa có đầu số gọi ra — gán trên hồ sơ TVV hoặc Cài đặt → Gọi điện.',
    )
  }
  return { extension, hotline }
}

/** TVV báo cuộc gọi kết thúc từ SDK — ghi omicallCalls + kpiDaily (bổ sung webhook/đồng bộ). */
export const reportOmicallCallFromClient = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Cần đăng nhập.')
  const uid = request.auth.uid
  const transactionId = str(request.data?.transactionId) || str(request.data?.providerCallId)
  const leadId = str(request.data?.leadId)
  if (!transactionId) throw new HttpsError('invalid-argument', 'Thiếu mã cuộc gọi.')
  if (!leadId) throw new HttpsError('invalid-argument', 'Thiếu leadId.')

  const billSeconds = Math.max(0, num(request.data?.billSeconds) || num(request.data?.durationSeconds))
  const answerSeconds = Math.max(0, num(request.data?.answerSeconds) || billSeconds)
  const outcome: CallOutcome = answerSeconds > 0 || billSeconds > 0 ? 'CONNECTED' : 'NO_ANSWER'
  const now = Timestamp.now()
  const phone = str(request.data?.phone) || str(request.data?.displayNumber)

  const call: NormalizedOmicallCall = {
    transactionId,
    callUuid: str(request.data?.callUuid) || transactionId,
    state: 'ended',
    direction: str(request.data?.direction) === 'inbound' ? 'inbound' : 'outbound',
    phoneNumber: phone,
    displayNumber: str(request.data?.displayNumber) || phone,
    sipUser: str(request.data?.sipUser) || undefined,
    endedAt: now,
    createdAt: now,
    answerSeconds,
    billSeconds,
    durationSeconds: billSeconds,
    recordSeconds: 0,
    outcome,
    userDataLeadId: leadId,
    userDataCounselorUid: uid,
    raw: {},
  }

  await upsertCallAndInteraction(call, 'history_sync')
  return { ok: true, transactionId }
})

/** Quản trị: bù KPI từ omicallCalls + interaction OMICall (sau khi sửa lỗi đồng bộ). */
export const reconcileOmicallKpi = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Cần đăng nhập.')
  const userSnap = await db.collection(COLLECTIONS.users).doc(request.auth.uid).get()
  const role = str(userSnap.data()?.role)
  if (role !== 'admin' && role !== 'super_admin') {
    throw new HttpsError('permission-denied', 'Chỉ quản trị mới chạy bù KPI.')
  }
  const lookbackDays = Math.max(1, Math.min(60, Math.round(num(request.data?.lookbackDays) || 21)))
  const stored = await reconcileKpiFromStoredCalls(lookbackDays)
  const interactions = await reconcileKpiFromClientInteractions(Math.min(lookbackDays, 30))
  return { ok: true, ...stored, interactionsApplied: interactions }
})

/** Click-to-call: đổ chuông số nội bộ TVV → nhấc máy → gọi ra SĐT khách (không cần SIP trên trình duyệt). */
export const omicallClick2Call = onCall(
  { secrets: [OMICALL_API_KEY, OMICALL_API_BASE_URL] },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Cần đăng nhập.')
    const uid = request.auth.uid
    const userSnap = await db.collection(COLLECTIONS.users).doc(uid).get()
    if (!userSnap.exists) throw new HttpsError('not-found', 'Không tìm thấy hồ sơ user.')
    const user = userSnap.data() ?? {}
    const serverConfig = await loadOmicallServerConfig()
    if (!serverConfig.enabled) {
      throw new HttpsError('failed-precondition', 'Tích hợp OMICall chưa bật trong Cài đặt.')
    }
    if (serverConfig.click2callEnabled === false) {
      throw new HttpsError('failed-precondition', 'Click-to-call API đang tắt trong Cài đặt.')
    }
    const { apiKey, baseUrl } = await requireOmicallApiCreds()
    const leadId = str(request.data?.leadId)
    const phoneRaw = str(request.data?.phone)
    const target = str(request.data?.target)
    if (!phoneRaw) throw new HttpsError('invalid-argument', 'Thiếu số điện thoại khách.')
    const dialFormat = serverConfig.dialFormat === 'local' ? 'local' : 'intl84'
    const phoneNumber =
      dialFormat === 'local' ? normalizePhoneLocal(phoneRaw) : normalizePhoneIntl(phoneRaw) || ''
    if (!phoneNumber || (dialFormat === 'local' && phoneNumber.length < 10)) {
      throw new HttpsError('invalid-argument', 'Số điện thoại không hợp lệ.')
    }
    const { extension, hotline } = await resolveTvExtensionAndHotline(user, serverConfig, apiKey, baseUrl)
    const result = await postOmicallClick2Call(baseUrl, apiKey, { extension, hotline, phoneNumber })
    const now = Timestamp.now()
    const expiresAt = Timestamp.fromMillis(now.toMillis() + 2 * 60 * 60 * 1000)
    await db
      .collection(COLLECTIONS.omicallPendingCalls)
      .doc(result.callUuid)
      .set({
        callUuid: result.callUuid,
        leadId: leadId || null,
        target: target || null,
        phone: phoneNumber,
        extension,
        hotline,
        counselorUid: uid,
        createdAt: now,
        expiresAt,
      })
    return {
      ok: true,
      callUuid: result.callUuid,
      extension,
      hotline,
      phoneNumber,
      hint: `Đang gọi ${phoneNumber} — máy lẻ ${extension} sẽ đổ chuông trước, nhấc máy rồi mới nối ra khách.`,
    }
  },
)

function omicallWebhookUrlForProject(projectId: string, webhookSecret: string): string {
  const secret = encodeURIComponent(webhookSecret.trim())
  return `https://asia-southeast1-${projectId.trim()}.cloudfunctions.net/omicallCallWebhook?secret=${secret}`
}

/** Đăng ký webhook cuộc gọi trên OMICall (một lần sau khi lưu API key + webhook secret). */
export const omicallRegisterWebhook = onCall(
  { secrets: [OMICALL_API_KEY, OMICALL_API_BASE_URL] },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Cần đăng nhập.')
    const callerSnap = await db.collection(COLLECTIONS.users).doc(request.auth.uid).get()
    const role = str(callerSnap.data()?.role)
    if (role !== 'admin' && role !== 'super_admin') {
      throw new HttpsError('permission-denied', 'Chỉ quản trị mới đăng ký webhook.')
    }
    const { apiKey, baseUrl, serverConfig } = await requireOmicallApiCreds()
    const webhookSecret = str(serverConfig.webhookSecret)
    if (!webhookSecret) {
      throw new HttpsError('failed-precondition', 'Chưa có mã webhook — lưu cấu hình trước.')
    }
    const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || ''
    if (!projectId) throw new HttpsError('internal', 'Không xác định được Firebase project ID.')
    const webhookUrl = omicallWebhookUrlForProject(projectId, webhookSecret)
    const result = await registerOmicallCallWebhook(baseUrl, apiKey, webhookUrl)
    return { ok: true, webhookUrl, message: result.message }
  },
)

type StaffUserLite = {
  id: string
  role: string
  email: string
  isActive: boolean
  managedCounselorIds: string[]
}

async function loadStaffUser(uid: string): Promise<StaffUserLite | null> {
  const snap = await db.collection(COLLECTIONS.users).doc(uid).get()
  if (!snap.exists) return null
  const d = snap.data() ?? {}
  return {
    id: uid,
    role: str(d.role) || 'counselor',
    email: str(d.email),
    isActive: d.isActive !== false,
    managedCounselorIds: Array.isArray(d.managedCounselorIds)
      ? d.managedCounselorIds.map((x) => String(x))
      : [],
  }
}

function isAdminLikeRole(role: string): boolean {
  return role === 'admin' || role === 'super_admin'
}

function counselorInTeamRoster(counselorId: string, lead: StaffUserLite): boolean {
  return lead.managedCounselorIds.includes(counselorId)
}

async function assertStaffManagementPermission(
  callerId: string,
  target: StaffUserLite,
  opts?: { accountantPortalOnly?: boolean },
): Promise<StaffUserLite> {
  const caller = await loadStaffUser(callerId)
  if (!caller || !caller.isActive) {
    throw new HttpsError('permission-denied', 'Không có quyền quản lý nhân sự.')
  }
  if (callerId === target.id) {
    throw new HttpsError('failed-precondition', 'Không thao tác trên chính tài khoản đang đăng nhập.')
  }
  if (target.role === 'super_admin' && caller.role !== 'super_admin') {
    throw new HttpsError('permission-denied', 'Chỉ Siêu quản trị mới quản lý tài khoản Siêu quản trị khác.')
  }

  const callerAdmin = isAdminLikeRole(caller.role)
  const callerTeamLead = caller.role === 'team_lead'

  if (opts?.accountantPortalOnly) {
    if (target.role !== 'accountant') {
      throw new HttpsError('permission-denied', 'Chỉ quản lý tài khoản kế toán.')
    }
    if (!callerAdmin && caller.role !== 'accountant') {
      throw new HttpsError('permission-denied', 'Không có quyền quản lý kế toán viên.')
    }
    return caller
  }

  if (callerAdmin) return caller

  if (callerTeamLead) {
    if (target.role !== 'counselor') {
      throw new HttpsError('permission-denied', 'Trưởng nhóm chỉ quản lý tư vấn viên trong nhóm.')
    }
    if (!counselorInTeamRoster(target.id, caller)) {
      throw new HttpsError('permission-denied', 'TVV không thuộc nhóm bạn quản lý.')
    }
    return caller
  }

  throw new HttpsError('permission-denied', 'Không có quyền quản lý nhân sự.')
}

async function removeCounselorFromTeamRosters(counselorId: string): Promise<void> {
  const snap = await db.collection(COLLECTIONS.users).where('role', '==', 'team_lead').get()
  const batch = db.batch()
  let writes = 0
  for (const doc of snap.docs) {
    const ids = Array.isArray(doc.data()?.managedCounselorIds)
      ? doc.data()!.managedCounselorIds.map((x: unknown) => String(x))
      : []
    if (!ids.includes(counselorId)) continue
    batch.update(doc.ref, {
      managedCounselorIds: ids.filter((id: string) => id !== counselorId),
      updatedAt: Timestamp.now(),
    })
    writes += 1
  }
  if (writes > 0) await batch.commit()
}

type StaffAccountAction = 'disable_login' | 'enable_login' | 'delete' | 'set_password'

/** Khóa / mở / xóa / đặt mật khẩu tài khoản nhân sự (Firebase Auth + Firestore). */
export const adminStaffAccountAction = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Cần đăng nhập.')
  const targetUserId = str(request.data?.targetUserId).trim()
  const action = str(request.data?.action).trim() as StaffAccountAction
  const accountantPortalOnly = request.data?.accountantPortalOnly === true
  const newPassword = str(request.data?.newPassword)
  if (!targetUserId) throw new HttpsError('invalid-argument', 'Thiếu targetUserId.')
  if (!['disable_login', 'enable_login', 'delete', 'set_password'].includes(action)) {
    throw new HttpsError('invalid-argument', 'action không hợp lệ.')
  }

  const target = await loadStaffUser(targetUserId)
  if (!target) throw new HttpsError('not-found', 'Không tìm thấy users/{uid}.')

  await assertStaffManagementPermission(request.auth.uid, target, { accountantPortalOnly })

  const auth = getAuth()

  if (action === 'set_password') {
    if (accountantPortalOnly) {
      throw new HttpsError('permission-denied', 'Cổng kế toán không đặt mật khẩu trực tiếp.')
    }
    const caller = await loadStaffUser(request.auth.uid)
    if (!caller || !isAdminLikeRole(caller.role)) {
      throw new HttpsError('permission-denied', 'Chỉ quản trị mới được đặt mật khẩu trực tiếp.')
    }
    if (newPassword.length < 6) {
      throw new HttpsError('invalid-argument', 'Mật khẩu cần ít nhất 6 ký tự.')
    }
    if (target.role === 'super_admin' && caller.role !== 'super_admin') {
      throw new HttpsError('permission-denied', 'Chỉ Siêu quản trị mới đổi mật khẩu Siêu quản trị khác.')
    }
    try {
      await auth.updateUser(targetUserId, { password: newPassword })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('user-not-found')) {
        throw new HttpsError('not-found', 'Firebase Auth không có user này.')
      }
      throw new HttpsError('internal', msg)
    }
    return { ok: true, action, targetUserId }
  }

  if (action === 'disable_login') {
    await db.collection(COLLECTIONS.users).doc(targetUserId).update({
      isActive: false,
      updatedAt: Timestamp.now(),
    })
    try {
      await auth.updateUser(targetUserId, { disabled: true })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.includes('user-not-found')) throw new HttpsError('internal', msg)
    }
    return { ok: true, action, targetUserId }
  }

  if (action === 'enable_login') {
    await db.collection(COLLECTIONS.users).doc(targetUserId).update({
      isActive: true,
      updatedAt: Timestamp.now(),
    })
    try {
      await auth.updateUser(targetUserId, { disabled: false })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.includes('user-not-found')) throw new HttpsError('internal', msg)
    }
    return { ok: true, action, targetUserId }
  }

  if (target.role === 'counselor') {
    await removeCounselorFromTeamRosters(targetUserId)
  }
  await db.collection(COLLECTIONS.users).doc(targetUserId).delete()
  try {
    await auth.deleteUser(targetUserId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!msg.includes('user-not-found')) {
      try {
        await auth.updateUser(targetUserId, { disabled: true })
      } catch {
        /* ignore */
      }
    }
  }
  return { ok: true, action: 'delete', targetUserId }
})
