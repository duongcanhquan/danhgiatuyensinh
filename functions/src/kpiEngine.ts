import {
  FieldValue,
  Timestamp,
  type Firestore,
  type DocumentReference,
} from 'firebase-admin/firestore'
import { type KpiEvalConfig, bonusTierFromPercentile, getDefaultKpiEvalConfig } from './kpiEvaluationConfig.js'

export const VALID_CALL_MIN_BILL_SECONDS = 45
export const VALID_CALL_DEDUP_WINDOW_MS = 4 * 60 * 60 * 1000

export const COLLECTIONS_EXTRA = {
  leadEvents: 'leadEvents',
  kpiMonthly: 'kpiMonthly',
  kpiLeadEvents: 'kpiLeadEvents',
  kpiValidCallWindows: 'kpiValidCallWindows',
  kpiUniqueLeadDay: 'kpiUniqueLeadDay',
} as const

type CallLike = {
  billSeconds: number
  answerSeconds: number
  endedAt?: Timestamp
  startedAt?: Timestamp
  createdAt?: Timestamp
}

type LeadMatch = {
  leadId?: string
  counselorUid?: string
  teamLeadUid?: string
}

export function evaluateValidCall(
  call: CallLike,
  match: LeadMatch,
  cfg: KpiEvalConfig = getDefaultKpiEvalConfig(),
): { isValid: boolean; invalidReason?: string } {
  if (!match.leadId) return { isValid: false, invalidReason: 'no_lead_id' }
  if (!match.counselorUid) return { isValid: false, invalidReason: 'no_counselor' }
  const bill = call.billSeconds || call.answerSeconds || 0
  const minSec = cfg.validCall.minBillSeconds
  if (bill < minSec) {
    return { isValid: false, invalidReason: 'short_duration' }
  }
  return { isValid: true }
}

function callEndedMs(call: CallLike): number {
  const ts = call.endedAt ?? call.startedAt ?? call.createdAt
  return ts?.toMillis?.() ?? Date.now()
}

export function validCallWindowKey(
  counselorUid: string,
  leadId: string,
  endedMs: number,
  windowMs: number = VALID_CALL_DEDUP_WINDOW_MS,
): string {
  const window = Math.floor(endedMs / windowMs)
  return `${counselorUid}_${leadId}_${window}`
}

export function uniqueLeadDayKey(counselorUid: string, leadId: string, day: string): string {
  return `${counselorUid}_${leadId}_${day}`
}

export async function applyValidCallKpi(
  db: Firestore,
  kpiDailyCol: string,
  opts: {
    day: string
    call: CallLike
    match: LeadMatch
    isValid: boolean
    cfg?: KpiEvalConfig
  },
): Promise<void> {
  const { day, call, match, isValid, cfg = getDefaultKpiEvalConfig() } = opts
  if (!isValid || !match.counselorUid || !match.leadId) return

  const endedMs = callEndedMs(call)
  const windowRef = db.collection(COLLECTIONS_EXTRA.kpiValidCallWindows).doc(
    validCallWindowKey(match.counselorUid, match.leadId, endedMs, cfg.validCallDedupWindowMs),
  )
  const uniqueRef = db.collection(COLLECTIONS_EXTRA.kpiUniqueLeadDay).doc(
    uniqueLeadDayKey(match.counselorUid, match.leadId, day),
  )

  await db.runTransaction(async (tx) => {
    const windowSnap = await tx.get(windowRef)
    if (windowSnap.exists) return

    const uniqueSnap = await tx.get(uniqueRef)
    const validIncrements = {
      validCalls: FieldValue.increment(1),
      validTalkSeconds: FieldValue.increment(call.billSeconds || call.answerSeconds || 0),
      uniqueLeadsCalled: FieldValue.increment(uniqueSnap.exists ? 0 : 1),
      updatedAt: Timestamp.now(),
    }

    tx.set(
      db.collection(kpiDailyCol).doc(day).collection('counselors').doc(match.counselorUid!),
      { date: day, counselorUid: match.counselorUid, teamLeadUid: match.teamLeadUid ?? null, ...validIncrements },
      { merge: true },
    )
    if (match.teamLeadUid) {
      tx.set(
        db.collection(kpiDailyCol).doc(day).collection('teams').doc(match.teamLeadUid),
        { date: day, teamLeadUid: match.teamLeadUid, ...validIncrements },
        { merge: true },
      )
    }
    tx.set(windowRef, {
      counselorUid: match.counselorUid,
      leadId: match.leadId,
      day,
      endedMs,
      processedAt: Timestamp.now(),
    })
    if (!uniqueSnap.exists) {
      tx.set(uniqueRef, {
        counselorUid: match.counselorUid,
        leadId: match.leadId,
        day,
        processedAt: Timestamp.now(),
      })
    }
  })
}

export type LeadEventPayload = {
  type: string
  from?: string
  to?: string
  leadId: string
  counselorUid: string
  teamLeadUid?: string | null
  at: Timestamp
}

function leadEventIncrements(
  type: string,
  from: string,
  to: string,
): Record<string, ReturnType<typeof FieldValue.increment>> {
  const inc = (field: string) => ({ [field]: FieldValue.increment(1) })
  if (type === 'TAG_CHANGED') {
    if (to === 'WARM' && from !== 'WARM' && from !== 'HOT') return inc('warmNew')
    if (to === 'HOT' && from !== 'HOT') return inc('hotNew')
    return {}
  }
  if (type === 'STATUS_CHANGED') {
    if (to === 'INTERESTED' && from === 'NEW') return inc('newToInterested')
    if (to === 'DEPOSIT_PAID') return inc('toDeposit')
    if (to === 'ENROLLED') return inc('toEnrolled')
    return {}
  }
  return {}
}

export async function processLeadEventDoc(
  db: Firestore,
  kpiDailyCol: string,
  eventRef: DocumentReference,
  data: Record<string, unknown>,
): Promise<void> {
  const processedRef = db.collection(COLLECTIONS_EXTRA.kpiLeadEvents).doc(eventRef.id)
  await db.runTransaction(async (tx) => {
    const processed = await tx.get(processedRef)
    if (processed.exists) return

    const counselorUid = String(data.counselorUid ?? '')
    const leadId = String(data.leadId ?? '')
    const type = String(data.type ?? '')
    const from = String(data.from ?? '')
    const to = String(data.to ?? '')
    const at = (data.at as Timestamp | undefined) ?? Timestamp.now()
    if (!counselorUid || !leadId || !type) {
      tx.set(processedRef, { skipped: true, processedAt: Timestamp.now() })
      return
    }

    const day = at.toDate().toISOString().slice(0, 10)
    const teamLeadUid = data.teamLeadUid ? String(data.teamLeadUid) : null
    const fieldIncrements = leadEventIncrements(type, from, to)
    if (!Object.keys(fieldIncrements).length) {
      tx.set(processedRef, { skipped: true, reason: 'no_kpi_field', processedAt: Timestamp.now() })
      return
    }

    const increments = { ...fieldIncrements, updatedAt: Timestamp.now() }
    tx.set(
      db.collection(kpiDailyCol).doc(day).collection('counselors').doc(counselorUid),
      { date: day, counselorUid, teamLeadUid, ...increments },
      { merge: true },
    )
    if (teamLeadUid) {
      tx.set(
        db.collection(kpiDailyCol).doc(day).collection('teams').doc(teamLeadUid),
        { date: day, teamLeadUid, ...increments },
        { merge: true },
      )
    }
    tx.set(processedRef, { processedAt: Timestamp.now(), leadEventId: eventRef.id, day, counselorUid })
    tx.set(eventRef, { kpiAppliedAt: Timestamp.now() }, { merge: true })
  })
}

export async function processRecentLeadEvents(db: Firestore, kpiDailyCol: string): Promise<number> {
  const since = Timestamp.fromMillis(Date.now() - 24 * 60 * 60_000)
  const snap = await db
    .collection(COLLECTIONS_EXTRA.leadEvents)
    .where('at', '>=', since)
    .limit(500)
    .get()
  let n = 0
  for (const docSnap of snap.docs) {
    if (docSnap.data()?.kpiAppliedAt) continue
    await processLeadEventDoc(db, kpiDailyCol, docSnap.ref, docSnap.data() as Record<string, unknown>)
    n++
  }
  return n
}

const MONTHLY_SUM_FIELDS = [
  'totalCalls',
  'validCalls',
  'connectedCalls',
  'talkSeconds',
  'validTalkSeconds',
  'uniqueLeadsCalled',
  'crmActions',
  'depositPaidCount',
  'tuitionPaidCount',
  'approvedRevenueVnd',
  'fullNeCount',
  'warmNew',
  'hotNew',
  'newToInterested',
  'toDeposit',
  'toEnrolled',
  'notesAdded',
] as const

function num(v: unknown): number {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

function daysInMonth(monthKey: string): string[] {
  const [y, m] = monthKey.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  const out: string[] = []
  for (let d = 1; d <= last; d++) {
    out.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  return out
}

export async function rollupKpiMonthly(
  db: Firestore,
  kpiDailyCol: string,
  monthKey: string,
  cfg: KpiEvalConfig = getDefaultKpiEvalConfig(),
): Promise<number> {
  const days = daysInMonth(monthKey)
  const agg = new Map<string, Record<string, number>>()
  const teamLeads = new Map<string, string>()

  for (const day of days) {
    const snap = await db.collection(kpiDailyCol).doc(day).collection('counselors').get()
    for (const doc of snap.docs) {
      const d = doc.data()
      const uid = doc.id
      const row = agg.get(uid) ?? {}
      for (const f of MONTHLY_SUM_FIELDS) {
        row[f] = (row[f] ?? 0) + num(d[f])
      }
      if (d.teamLeadUid) teamLeads.set(uid, String(d.teamLeadUid))
      agg.set(uid, row)
    }
  }

  const ranked = [...agg.entries()].sort(
    (a, b) => (b[1].approvedRevenueVnd ?? 0) - (a[1].approvedRevenueVnd ?? 0),
  )
  const batch = db.batch()
  let i = 0
  for (const [counselorUid, sums] of ranked) {
    i++
    const pct = ranked.length > 1 ? (i - 1) / (ranked.length - 1) : 0
    const bonusTier = bonusTierFromPercentile(pct, cfg)
    const ref = db.collection(COLLECTIONS_EXTRA.kpiMonthly).doc(monthKey).collection('counselors').doc(counselorUid)
    batch.set(
      ref,
      {
        month: monthKey,
        counselorUid,
        teamLeadUid: teamLeads.get(counselorUid) ?? null,
        rankInScope: i,
        bonusTier,
        ...sums,
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    )
  }
  await batch.commit()
  return agg.size
}
