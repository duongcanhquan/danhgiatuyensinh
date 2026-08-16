/**
 * Một onSnapshot dùng chung cho nhiều consumer (tránh N listener cùng collection).
 * Giữ cache rows khi hết listener → mở lại UI nhận data ngay (stale-while-revalidate).
 */
import type { Firestore, Query } from 'firebase/firestore'
import { onSnapshot } from 'firebase/firestore'
import { firestoreReadErrorMessage } from './firestoreReadError'

type SharedEntry<T> = {
  listeners: Set<(rows: T[], error: string | null) => void>
  unsub: (() => void) | null
  rows: T[]
  error: string | null
  loading: boolean
}

const registry = new Map<string, SharedEntry<unknown>>()

function attachSnapshot<T>(
  entry: SharedEntry<T>,
  buildQuery: (db: Firestore) => Query,
  mapSnap: (id: string, data: Record<string, unknown>) => T | null,
  db: Firestore,
): void {
  if (entry.unsub) return
  const hadWarmRows = entry.rows.length > 0 || entry.error != null
  if (!hadWarmRows) entry.loading = true
  const q = buildQuery(db)
  entry.unsub = onSnapshot(
    q,
    (snap) => {
      const next: T[] = []
      snap.forEach((d) => {
        const row = mapSnap(d.id, d.data() as Record<string, unknown>)
        if (row) next.push(row)
      })
      entry.rows = next
      entry.error = null
      entry.loading = false
      for (const fn of entry.listeners) fn(next, null)
    },
    (err) => {
      console.error(err)
      const msg = firestoreReadErrorMessage(err, 'Lỗi đọc Firestore')
      entry.error = msg
      entry.loading = false
      for (const fn of entry.listeners) fn(entry.rows, msg)
    },
  )
}

export function subscribeSharedFirestoreQuery<T>(
  key: string,
  buildQuery: (db: Firestore) => Query,
  mapSnap: (id: string, data: Record<string, unknown>) => T | null,
  db: Firestore,
  onChange: (rows: T[], error: string | null, loading: boolean) => void,
): () => void {
  let entry = registry.get(key) as SharedEntry<T> | undefined
  if (!entry) {
    entry = {
      listeners: new Set(),
      unsub: null,
      rows: [],
      error: null,
      loading: true,
    }
    registry.set(key, entry as SharedEntry<unknown>)
  }

  attachSnapshot(entry, buildQuery, mapSnap, db)

  const listener = (rows: T[], error: string | null) => {
    onChange(rows, error, false)
  }
  entry.listeners.add(listener)
  // Cache ấm → loading false ngay; lần đầu vẫn loading đến khi snapshot.
  onChange(entry.rows, entry.error, entry.loading && entry.rows.length === 0 && !entry.error)

  return () => {
    entry!.listeners.delete(listener)
    if (entry!.listeners.size === 0) {
      entry!.unsub?.()
      entry!.unsub = null
      // Giữ entry.rows trong registry — không xóa key (warm reopen).
    }
  }
}

/** Test helper — clear shared registry between tests. */
export function __resetSharedFirestoreQueryRegistryForTests() {
  for (const entry of registry.values()) {
    entry.unsub?.()
  }
  registry.clear()
}
