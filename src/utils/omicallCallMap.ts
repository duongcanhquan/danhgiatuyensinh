import type { Timestamp } from 'firebase/firestore'
import type { OmicallCallOutcome, OmicallCallRecord } from '../types'

export function numCall(v: unknown): number {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

export function tsMsCall(ts?: Timestamp): number {
  if (!ts) return 0
  try {
    return ts.toMillis()
  } catch {
    return 0
  }
}

export function mapOmicallCallDoc(id: string, data: Record<string, unknown>): OmicallCallRecord {
  const outcomeRaw = String(data.outcome ?? '')
  const outcome: OmicallCallOutcome =
    outcomeRaw === 'CONNECTED' || outcomeRaw === 'NO_ANSWER' ? outcomeRaw : 'OTHER'
  return {
    id,
    transactionId: String(data.transactionId ?? id),
    callUuid: data.callUuid ? String(data.callUuid) : undefined,
    direction: String(data.direction ?? 'outbound'),
    phoneNumber: String(data.phoneNumber ?? ''),
    displayNumber: data.displayNumber ? String(data.displayNumber) : undefined,
    hotline: data.hotline ? String(data.hotline) : undefined,
    sipUser: data.sipUser ? String(data.sipUser) : undefined,
    leadId: data.leadId ? String(data.leadId) : undefined,
    counselorUid: data.counselorUid ? String(data.counselorUid) : undefined,
    teamLeadUid: data.teamLeadUid ? String(data.teamLeadUid) : undefined,
    startedAt: data.startedAt as Timestamp | undefined,
    answeredAt: data.answeredAt as Timestamp | undefined,
    endedAt: data.endedAt as Timestamp | undefined,
    createdAt: data.createdAt as Timestamp | undefined,
    answerSeconds: numCall(data.answerSeconds),
    billSeconds: numCall(data.billSeconds),
    durationSeconds: numCall(data.durationSeconds),
    recordSeconds: numCall(data.recordSeconds),
    recordingFileUrl: data.recordingFileUrl ? String(data.recordingFileUrl) : undefined,
    hangupCause: data.hangupCause ? String(data.hangupCause) : undefined,
    endByName: data.endByName ? String(data.endByName) : undefined,
    provider: data.provider ? String(data.provider) : undefined,
    outcome,
    state: data.state ? String(data.state) : undefined,
    isFinal: data.isFinal === true,
    syncSource: data.syncSource as OmicallCallRecord['syncSource'],
    syncedAt: data.syncedAt as Timestamp | undefined,
    interactionId: data.interactionId ? String(data.interactionId) : undefined,
    kpiAppliedAt: data.kpiAppliedAt as Timestamp | undefined,
    isValidCall: data.isValidCall === true,
    invalidReason: data.invalidReason ? String(data.invalidReason) : undefined,
    aiAnalysisId: data.aiAnalysisId ? String(data.aiAnalysisId) : undefined,
    aiAnalysisSyncedAt: data.aiAnalysisSyncedAt as Timestamp | undefined,
    aiAnalysisSummary: data.aiAnalysisSummary ? String(data.aiAnalysisSummary) : undefined,
    disposition: data.disposition ? String(data.disposition) : undefined,
    agentId: data.agentId ? String(data.agentId) : undefined,
    agentName: data.agentName ? String(data.agentName) : undefined,
    customerName: data.customerName ? String(data.customerName) : undefined,
    callNote: data.callNote ? String(data.callNote) : undefined,
    isAutoCall: data.isAutoCall === true,
    evaluationScore: data.evaluationScore !== undefined ? numCall(data.evaluationScore) : undefined,
  }
}

export type OmicallCallStats = {
  total: number
  connected: number
  validCalls: number
  outbound: number
  inbound: number
  talkSeconds: number
  avgBillSeconds: number
  connectRate: number
  validRate: number
  withRecording: number
}

export function aggregateOmicallCalls(calls: OmicallCallRecord[]): OmicallCallStats {
  const total = calls.length
  const connected = calls.filter((c) => c.outcome === 'CONNECTED').length
  const validCalls = calls.filter((c) => c.isValidCall).length
  const outbound = calls.filter((c) => c.direction === 'outbound').length
  const inbound = calls.filter((c) => c.direction === 'inbound').length
  const talkSeconds = calls.reduce((s, c) => s + (c.billSeconds || c.answerSeconds || 0), 0)
  const withRecording = calls.filter((c) => c.recordingFileUrl).length
  const billSum = calls.reduce((s, c) => s + c.billSeconds, 0)
  return {
    total,
    connected,
    validCalls,
    outbound,
    inbound,
    talkSeconds,
    avgBillSeconds: total > 0 ? Math.round(billSum / total) : 0,
    connectRate: total > 0 ? Math.round((connected / total) * 100) : 0,
    validRate: total > 0 ? Math.round((validCalls / total) * 100) : 0,
    withRecording,
  }
}

export function formatCallDuration(seconds: number): string {
  if (seconds <= 0) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`
}
