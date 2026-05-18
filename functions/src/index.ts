import { initializeApp } from 'firebase-admin/app'
import {
  FieldValue,
  Timestamp,
  getFirestore,
  type DocumentData,
  type Firestore,
  type QuerySnapshot,
} from 'firebase-admin/firestore'
import { setGlobalOptions } from 'firebase-functions/v2'
import { onRequest } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { defineSecret } from 'firebase-functions/params'

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
  kpiDaily: 'kpiDaily',
  kpiActivityEvents: 'kpiActivityEvents',
  kpiFinanceEvents: 'kpiFinanceEvents',
  omicallSyncRuns: 'omicallSyncRuns',
} as const

type CallOutcome = 'CONNECTED' | 'NO_ANSWER' | 'OTHER'
type Direction = 'outbound' | 'inbound' | 'local' | string

type NormalizedOmicallCall = {
  transactionId: string
  callUuid?: string
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
  raw: Record<string, unknown>
}

type UserProfileLite = {
  uid: string
  role: string
  omicallSipUser?: string
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
  return {
    apiKey: str(data.apiKey),
    apiBaseUrl: str(data.apiBaseUrl),
    webhookSecret: str(data.webhookSecret),
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
  let d = str(raw).replace(/[^\d+]/g, '')
  if (d.startsWith('+')) d = d.slice(1)
  d = d.replace(/\D/g, '')
  if (d.startsWith('84') && d.length >= 11) return `0${d.slice(2)}`
  if (!d.startsWith('0') && d.length === 9) return `0${d}`
  return d
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
  return d.toISOString().slice(0, 10)
}

function callOutcome(answerSeconds: number, billSeconds: number, hangupCause: string): CallOutcome {
  if (answerSeconds > 0 || billSeconds > 0) return 'CONNECTED'
  if (hangupCause) return 'NO_ANSWER'
  return 'OTHER'
}

function normalizeCall(rawInput: Record<string, unknown>): NormalizedOmicallCall | null {
  const payload = asObject(rawInput.payload)
  const raw = Object.keys(payload).length ? payload : rawInput
  const transactionId =
    str(raw.transaction_id) ||
    str(raw.transactionId) ||
    str(raw.call_uuid) ||
    str(raw.callUuid) ||
    str(raw.unique_id)
  if (!transactionId) return null

  const phoneNumber = normalizePhone(raw.phone_number || raw.destination_number || raw.to_number || raw.from_number)
  const displayNumber = str(raw.displayNumber) || str(raw.phone_number) || str(raw.destination_number) || phoneNumber
  const answerSeconds = num(raw.answer_sec)
  const billSeconds = num(raw.bill_sec)
  const durationSeconds = num(raw.duration)
  const recordSeconds = num(raw.record_seconds)
  const hangupCause = str(raw.hangup_cause)
  const outcome = callOutcome(answerSeconds, billSeconds, hangupCause)
  return {
    transactionId,
    callUuid: str(raw.call_uuid) || undefined,
    direction: str(raw.direction) || 'outbound',
    phoneNumber,
    displayNumber,
    hotline: str(raw.hotline) || str(raw.sip_number) || undefined,
    sipUser: str(raw.sip_user) || str(raw.extension) || str(asObject(raw.create_by).id) || undefined,
    startedAt: toTs(raw.time_start_call || raw.created_date || raw.created_time),
    answeredAt: toTs(raw.time_answer_start),
    endedAt: toTs(raw.time_end_call),
    createdAt: toTs(raw.created_date || raw.created_time),
    answerSeconds,
    billSeconds,
    durationSeconds,
    recordSeconds,
    recordingFileUrl: str(raw.recording_file_url) || undefined,
    hangupCause: hangupCause || undefined,
    endByName: str(raw.endby_name) || undefined,
    provider: str(raw.provider) || undefined,
    outcome,
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
      omicallSipUser: str(data.omicallSipUser) || undefined,
    }
  })
  const teamLeadMap = buildTeamLeadMap(users, usersSnap)
  const bySip = call.sipUser ? users.find((u) => u.omicallSipUser === call.sipUser) : undefined
  const counselorUid = bySip?.uid

  const phone = normalizePhone(call.phoneNumber)
  let leadId: string | undefined
  if (phone) {
    const fields = ['phone', 'parentPhone', 'fatherPhone', 'motherPhone']
    for (const field of fields) {
      const snap = await fs.collection(COLLECTIONS.leads).where(field, '==', phone).limit(1).get()
      if (!snap.empty) {
        const doc = snap.docs[0]
        leadId = doc.id
        const assignedTo = str(doc.data().assignedTo || doc.data().assignedCounselorId)
        return {
          leadId,
          counselorUid: counselorUid || assignedTo || undefined,
          teamLeadUid: teamLeadMap.get(counselorUid || assignedTo) || undefined,
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
    `Mã cuộc gọi: ${call.transactionId}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

async function upsertCallAndInteraction(call: NormalizedOmicallCall, source: 'webhook' | 'history_sync') {
  const match = await resolveCounselorAndLead(db, call)
  const callRef = db.collection(COLLECTIONS.omicallCalls).doc(call.transactionId)
  const now = Timestamp.now()
  const existing = await callRef.get()
  const payload = {
    ...call,
    leadId: match.leadId ?? null,
    counselorUid: match.counselorUid ?? null,
    teamLeadUid: match.teamLeadUid ?? null,
    syncSource: source,
    syncedAt: now,
    updatedAt: now,
    createdAt: call.createdAt ?? call.startedAt ?? now,
  }
  await callRef.set(payload, { merge: true })

  if (match.leadId && !existing.data()?.interactionId) {
    const interactionRef = await db
      .collection(COLLECTIONS.leads)
      .doc(match.leadId)
      .collection(COLLECTIONS.interactions)
      .add({
        leadId: match.leadId,
        channel: 'CALL',
        authorUid: match.counselorUid || 'omicall',
        authorRole: 'counselor',
        counselorNote: interactionNote(call),
        callOutcome: call.outcome === 'CONNECTED' ? 'CONNECTED' : 'NO_ANSWER',
        durationSeconds: call.billSeconds || call.answerSeconds || undefined,
        provider: 'OMICALL',
        providerCallId: call.transactionId,
        providerUuid: call.callUuid ?? null,
        recordingUrl: call.recordingFileUrl ?? null,
        recordSeconds: call.recordSeconds || null,
        billSeconds: call.billSeconds || null,
        answerSeconds: call.answerSeconds || null,
        hotline: call.hotline ?? null,
        sipUser: call.sipUser ?? null,
        syncedFrom: source,
        timestamp: call.endedAt ?? call.startedAt ?? now,
      })
    await callRef.set({ interactionId: interactionRef.id }, { merge: true })
  }

  await updateDailyKpi(call, match)
}

async function updateDailyKpi(call: NormalizedOmicallCall, match: LeadMatch) {
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

async function updateDailyFinanceKpiFromLeads() {
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
      if (!amount || approval !== 'ĐỒNG Ý') continue
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

    if (str(finance.fullNeStatus) === 'ĐÃ FULL NE') {
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
    res.json({ ok: true, transactionId: call.transactionId })
  },
)

function omicallHeaders(apiKey: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    Authorization: `Bearer ${apiKey}`,
  }
}

function historyPayload(minutesBack: number): Record<string, unknown> {
  const to = Date.now()
  const from = to - minutesBack * 60_000
  return {
    from_date: from,
    to_date: to,
    date_from: from,
    date_to: to,
  }
}

async function fetchHistoryPage(baseUrl: string, apiKey: string, page: number) {
  const url = `${baseUrl.replace(/\/$/, '')}/api/v3/call-transaction/search?page=${page}&size=50`
  const resp = await fetch(url, {
    method: 'POST',
    headers: omicallHeaders(apiKey),
    body: JSON.stringify(historyPayload(60)),
  })
  if (!resp.ok) throw new Error(`OMICall history HTTP ${resp.status}`)
  return (await resp.json()) as Record<string, unknown>
}

function rowsFromHistoryResponse(data: Record<string, unknown>): Record<string, unknown>[] {
  const payload = data.payload
  if (Array.isArray(payload)) return payload.map(asObject)
  const payloadObj = asObject(payload)
  for (const key of ['items', 'data', 'rows', 'docs']) {
    const arr = payloadObj[key]
    if (Array.isArray(arr)) return arr.map(asObject)
  }
  return []
}

export const syncOmicallCallHistory = onSchedule(
  { schedule: 'every 15 minutes', secrets: [OMICALL_API_KEY, OMICALL_API_BASE_URL] },
  async (): Promise<void> => {
    const serverConfig = await loadOmicallServerConfig()
    const apiKey = envSecret(OMICALL_API_KEY, 'OMICALL_API_KEY') || serverConfig.apiKey
    const baseUrl = envSecret(OMICALL_API_BASE_URL, 'OMICALL_API_BASE_URL') || serverConfig.apiBaseUrl
    const runRef = db.collection(COLLECTIONS.omicallSyncRuns).doc()
    const startedAt = Timestamp.now()
    if (!apiKey || !baseUrl) {
      await runRef.set({ startedAt, status: 'skipped', reason: 'missing_secret' })
      return
    }
    let processed = 0
    let error: string | null = null
    try {
      for (let page = 1; page <= 5; page++) {
        const data = await fetchHistoryPage(baseUrl, apiKey, page)
        const rows = rowsFromHistoryResponse(data)
        if (rows.length === 0) break
        for (const row of rows) {
          const call = normalizeCall(row)
          if (!call) continue
          await upsertCallAndInteraction(call, 'history_sync')
          processed++
        }
        if (rows.length < 50) break
      }
      await updateDailyCrmKpiFromAuditLogs()
      await updateDailyFinanceKpiFromLeads()
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      await runRef.set({
        startedAt,
        finishedAt: Timestamp.now(),
        processed,
        status: error ? 'error' : 'ok',
        ...(error ? { error } : {}),
      })
    }
  },
)
