import { useEffect, useState } from 'react'
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore'
import type { Timestamp } from 'firebase/firestore'
import type { OmicallCallRecord } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'

const FETCH_CAP = 80

function num(v: unknown): number {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

function tsMs(ts?: Timestamp): number {
  if (!ts) return 0
  try {
    return ts.toMillis()
  } catch {
    return 0
  }
}

function mapCall(id: string, data: Record<string, unknown>): OmicallCallRecord {
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
    answerSeconds: num(data.answerSeconds),
    billSeconds: num(data.billSeconds),
    durationSeconds: num(data.durationSeconds),
    recordSeconds: num(data.recordSeconds),
    recordingFileUrl: data.recordingFileUrl ? String(data.recordingFileUrl) : undefined,
    hangupCause: data.hangupCause ? String(data.hangupCause) : undefined,
    outcome: (data.outcome as OmicallCallRecord['outcome']) ?? 'unknown',
    syncSource: data.syncSource as OmicallCallRecord['syncSource'],
    interactionId: data.interactionId ? String(data.interactionId) : undefined,
    isValidCall: data.isValidCall === true,
    invalidReason: data.invalidReason ? String(data.invalidReason) : undefined,
  }
}

/** Cuộc gọi OMICall gắn với một lead — sort client theo `endedAt` mới nhất. */
export function useLeadOmicallCalls(leadId: string | null) {
  const [calls, setCalls] = useState<OmicallCallRecord[]>([])
  const [loading, setLoading] = useState(Boolean(leadId))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!leadId) {
      setCalls([])
      setLoading(false)
      setError(null)
      return
    }
    const db = getFirestoreDb()
    if (!db || !isFirebaseConfigured()) {
      setCalls([])
      setLoading(false)
      setError('Chưa cấu hình Firebase.')
      return
    }

    setLoading(true)
    setError(null)
    const q = query(
      collection(db, FS_COLLECTIONS.omicallCalls),
      where('leadId', '==', leadId),
      limit(FETCH_CAP),
    )

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: OmicallCallRecord[] = []
        snap.forEach((d) => rows.push(mapCall(d.id, d.data() as Record<string, unknown>)))
        rows.sort((a, b) => tsMs(b.endedAt ?? b.createdAt) - tsMs(a.endedAt ?? a.createdAt))
        setCalls(rows)
        setLoading(false)
      },
      (e) => {
        setError(e.message || 'Không đọc được lịch sử gọi.')
        setLoading(false)
      },
    )
    return () => unsub()
  }, [leadId])

  return { calls, loading, error }
}
