import { useEffect, useState } from 'react'
import { collection, limit, onSnapshot, query, where, type Timestamp } from 'firebase/firestore'
import type { AuditLog } from '../types'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'

/** URL tạo index trong thông báo lỗi Firestore (thường kèm failed-precondition). */
export function extractFirestoreIndexUrl(message: string): string | null {
  const m = message.match(/https:\/\/console\.firebase\.google\.com[^\s"'<>]+/)
  return m?.[0] ?? null
}

/** Lấy tối đa bản ghi / lead rồi sort client — tránh composite index (where + orderBy). */
const AUDIT_FETCH_CAP = 1000
const AUDIT_DISPLAY_CAP = 120

function tsMs(log: AuditLog): number {
  try {
    return log.timestamp.toMillis()
  } catch {
    return 0
  }
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
 * Truy vấn chỉ `where('leadId')` + `limit` — dùng index đơn trường, không cần composite.
 * Sắp xếp theo `timestamp` trên client; nếu một lead có hơn 1000 bản ghi audit,
 * chỉ hiển thị 120 mục mới nhất trong tập đã tải.
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
      limit(AUDIT_FETCH_CAP),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: AuditLog[] = []
        snap.forEach((d) => {
          const row = mapAudit(d.id, d.data() as Record<string, unknown>)
          if (row) next.push(row)
        })
        next.sort((a, b) => tsMs(b) - tsMs(a))
        setEntries(next.slice(0, AUDIT_DISPLAY_CAP))
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
