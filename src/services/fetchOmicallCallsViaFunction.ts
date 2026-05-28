import { Timestamp } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import type { OmicallCallRecord } from '../types'
import { getFirebaseApp, isFirebaseConfigured } from './firebase'

type FetchOmicallCallsScope =
  | { mode: 'global' }
  | { mode: 'team'; teamLeadUid?: string }
  | { mode: 'counselor'; counselorUid: string }

type FetchOmicallCallsInput = {
  fromMs: number
  toMs: number
  maxRows: number
  scope: FetchOmicallCallsScope
}

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
  outcome: 'CONNECTED' | 'NO_ANSWER' | 'OTHER'
  state?: string
  isFinal?: boolean
  callNote?: string
  createdAtMs?: number
  startedAtMs?: number
  endedAtMs?: number
}

type FetchOmicallCallsResult = {
  ok: boolean
  source: 'omicallCalls' | 'interactions_fallback'
  calls: OmicallCallWire[]
}

export type FetchOmicallCallsMappedResult = {
  ok: boolean
  source: 'omicallCalls' | 'interactions_fallback'
  calls: OmicallCallRecord[]
}

function tsFromMs(ms?: number): Timestamp | undefined {
  if (!ms || !Number.isFinite(ms) || ms <= 0) return undefined
  return Timestamp.fromMillis(ms)
}

function mapWireToCall(row: OmicallCallWire): OmicallCallRecord {
  return {
    id: row.id,
    transactionId: row.transactionId,
    direction: row.direction,
    phoneNumber: row.phoneNumber,
    displayNumber: row.displayNumber,
    hotline: row.hotline,
    sipUser: row.sipUser,
    leadId: row.leadId,
    counselorUid: row.counselorUid,
    teamLeadUid: row.teamLeadUid,
    answerSeconds: row.answerSeconds,
    billSeconds: row.billSeconds,
    durationSeconds: row.durationSeconds,
    recordSeconds: row.recordSeconds,
    recordingFileUrl: row.recordingFileUrl,
    outcome: row.outcome,
    state: row.state,
    isFinal: row.isFinal,
    callNote: row.callNote,
    createdAt: tsFromMs(row.createdAtMs),
    startedAt: tsFromMs(row.startedAtMs),
    endedAt: tsFromMs(row.endedAtMs),
  }
}

function callableErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const fe = err as { code?: string; message?: string; details?: unknown }
    const code = String(fe.code ?? '')
    const msg = String(fe.message ?? '').trim()
    if (code === 'functions/internal' || code === 'internal') {
      return (
        msg && msg !== 'internal'
          ? msg
          : 'Lỗi server khi đọc cuộc gọi (thường do thiếu index Firestore warmlist). Chạy deploy:firestore-indexes và deploy:fetch-calls.'
      )
    }
    if (msg) return msg
    if (code) return code.replace(/^functions\//, '')
  }
  return err instanceof Error ? err.message : 'Không gọi được Cloud Function fetchOmicallCallsForClient.'
}

export async function fetchOmicallCallsViaFunction(input: FetchOmicallCallsInput): Promise<FetchOmicallCallsMappedResult> {
  if (!isFirebaseConfigured()) throw new Error('Chưa cấu hình Firebase.')
  const app = getFirebaseApp()
  if (!app) throw new Error('Firebase app chưa khởi tạo.')
  const fn = httpsCallable<FetchOmicallCallsInput, FetchOmicallCallsResult>(
    getFunctions(app, 'asia-southeast1'),
    'fetchOmicallCallsForClient',
  )
  try {
    const res = await fn(input)
    return {
      ...res.data,
      calls: (res.data.calls ?? []).map(mapWireToCall),
    }
  } catch (e) {
    throw new Error(callableErrorMessage(e))
  }
}
