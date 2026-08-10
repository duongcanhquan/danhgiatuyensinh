/**
 * Một onSnapshot dùng chung cho nhiều consumer (tránh N listener cùng collection).
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
    const q = buildQuery(db)
    entry.unsub = onSnapshot(
      q,
      (snap) => {
        const next: T[] = []
        snap.forEach((d) => {
          const row = mapSnap(d.id, d.data() as Record<string, unknown>)
          if (row) next.push(row)
        })
        entry!.rows = next
        entry!.error = null
        entry!.loading = false
        for (const fn of entry!.listeners) fn(next, null)
      },
      (err) => {
        console.error(err)
        const msg = firestoreReadErrorMessage(err, 'Lỗi đọc Firestore')
        entry!.error = msg
        entry!.loading = false
        for (const fn of entry!.listeners) fn(entry!.rows, msg)
      },
    )
  }

  const listener = (rows: T[], error: string | null) => {
    onChange(rows, error, false)
  }
  entry.listeners.add(listener)
  onChange(entry.rows, entry.error, entry.loading)

  return () => {
    entry!.listeners.delete(listener)
    if (entry!.listeners.size === 0) {
      entry!.unsub?.()
      entry!.unsub = null
      if (registry.get(key) === entry && entry!.listeners.size === 0) {
        registry.delete(key)
      }
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
