import { Timestamp } from 'firebase/firestore'

/** Chuẩn hóa giá trị Firestore/legacy thành Timestamp (hoặc undefined). */
export function asFirestoreTimestamp(v: unknown): Timestamp | undefined {
  if (v && typeof v === 'object' && typeof (v as Timestamp).toMillis === 'function') {
    return v as Timestamp
  }
  if (v && typeof v === 'object' && 'seconds' in (v as object)) {
    const s = Number((v as { seconds: unknown }).seconds)
    const n = Number((v as { nanoseconds?: unknown }).nanoseconds ?? 0)
    if (Number.isFinite(s)) return new Timestamp(s, Number.isFinite(n) ? n : 0)
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    const ms = v < 1e12 ? v * 1000 : v
    const d = new Date(ms)
    if (!Number.isNaN(d.getTime())) return Timestamp.fromDate(d)
  }
  if (typeof v === 'string' && v.trim()) {
    const d = new Date(v)
    if (!Number.isNaN(d.getTime())) return Timestamp.fromDate(d)
  }
  return undefined
}

export function asFirestoreTimestampOrNow(v: unknown): Timestamp {
  return asFirestoreTimestamp(v) ?? Timestamp.now()
}
