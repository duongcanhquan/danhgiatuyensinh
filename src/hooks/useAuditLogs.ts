import { useEffect, useState } from 'react'
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type Timestamp,
} from 'firebase/firestore'
import type { AuditLog } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'

/** URL tạo index trong thông báo lỗi Firestore (thường kèm failed-precondition). */
export function extractFirestoreIndexUrl(message: string): string | null {
  const m = message.match(/https:\/\/console\.firebase\.google\.com[^\s"'<>]+/)
  return m?.[0] ?? null
}

function mapAudit(id: string, data: Record<string, unknown>): AuditLog | null {
  try {
    const ts = data.timestamp as Timestamp | undefined
    if (!ts) return null
    return {
      id,
      leadId: String(data.leadId ?? ''),
      actionType: data.actionType as AuditLog['actionType'],
      description: String(data.description ?? ''),
      performedBy: String(data.performedBy ?? ''),
      performedByName: String(data.performedByName ?? data.performedBy ?? ''),
      timestamp: ts,
    }
  } catch {
    return null
  }
}

/**
 * Real-time audit entries for one lead (newest first).
 * Firestore composite index (same on every DB you use, e.g. `warmlist`):
 * Collection `auditLogs` — leadId ASCENDING + timestamp DESCENDING.
 */
export function useAuditLogs(leadId: string | null) {
  const [entries, setEntries] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(Boolean(leadId))
  const [error, setError] = useState<string | null>(null)
  const [missingIndexUrl, setMissingIndexUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!leadId) {
      queueMicrotask(() => {
        setEntries([])
        setLoading(false)
        setError(null)
        setMissingIndexUrl(null)
      })
      return
    }
    const db = getFirestoreDb()
    if (!db || !isFirebaseConfigured()) {
      queueMicrotask(() => {
        setEntries([])
        setLoading(false)
        setError(null)
        setMissingIndexUrl(null)
      })
      return
    }

    queueMicrotask(() => {
      setLoading(true)
    })
    const q = query(
      collection(db, FS_COLLECTIONS.auditLogs),
      where('leadId', '==', leadId),
      orderBy('timestamp', 'desc'),
      limit(120),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: AuditLog[] = []
        snap.forEach((d) => {
          const row = mapAudit(d.id, d.data() as Record<string, unknown>)
          if (row) next.push(row)
        })
        setEntries(next)
        setLoading(false)
        setError(null)
        setMissingIndexUrl(null)
      },
      (err) => {
        console.error(err)
        const msg = err.message || 'Không đọc được audit log'
        setError(msg)
        setMissingIndexUrl(extractFirestoreIndexUrl(msg))
        setLoading(false)
      },
    )
    return () => unsub()
  }, [leadId])

  return { entries, loading, error, missingIndexUrl }
}
