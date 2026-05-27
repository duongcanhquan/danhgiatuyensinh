import { doc, getDoc, runTransaction, Timestamp, type Firestore } from 'firebase/firestore'
import type { Lead } from '../types'
import { FS_COLLECTIONS } from '../types'

const VN_TZ = 'Asia/Ho_Chi_Minh'
const COUNTERS_DOC_ID = 'studentCodeCounters'

/** Mã 10 chữ số: DDMMYY (6) + thứ tự trong ngày (4), ví dụ 2405260001. */
export const STUDENT_CODE_LEN = 10
export const STUDENT_CODE_SEQ_LEN = 4

export function isStandardStudentCode(raw: string): boolean {
  return /^\d{10}$/.test(String(raw ?? '').trim())
}

/** Tiền tố ngày theo giờ VN — DDMMYY. */
export function formatStudentCodeDayPrefix(at: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: VN_TZ,
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).formatToParts(at)
  const day = parts.find((p) => p.type === 'day')?.value ?? '01'
  const month = parts.find((p) => p.type === 'month')?.value ?? '01'
  const year = parts.find((p) => p.type === 'year')?.value ?? '00'
  return `${day}${month}${year}`
}

export function formatStudentCode(prefix: string, sequence: number): string {
  const seq = Math.max(1, Math.min(9999, Math.floor(sequence)))
  return `${prefix}${String(seq).padStart(STUDENT_CODE_SEQ_LEN, '0')}`
}

function leadAnchorDate(lead: Lead): Date {
  const ts = lead.uploadedAt ?? lead.createdAt
  if (ts && typeof ts === 'object' && 'toDate' in ts && typeof ts.toDate === 'function') {
    return ts.toDate()
  }
  return new Date()
}

/** Gán thứ tự trong ngày (ước lượng) khi chưa có mã — dùng cho hiển thị kế toán. */
export function buildStudentCodeSequenceIndex(leads: Lead[]): Map<string, number> {
  const buckets = new Map<string, { lead: Lead; t: number }[]>()
  for (const lead of leads) {
    const cid = String(lead.customerId ?? '').trim()
    if (isStandardStudentCode(cid)) continue
    const d = leadAnchorDate(lead)
    const prefix = formatStudentCodeDayPrefix(d)
    const key = prefix
    const t = d.getTime()
    const arr = buckets.get(key) ?? []
    arr.push({ lead, t })
    buckets.set(key, arr)
  }
  const out = new Map<string, number>()
  for (const arr of buckets.values()) {
    arr.sort((a, b) => a.t - b.t || a.lead.id.localeCompare(b.lead.id))
    arr.forEach((row, idx) => out.set(row.lead.id, idx + 1))
  }
  return out
}

export function resolveStudentDisplayCode(
  lead: Lead,
  sequenceIndex?: Map<string, number>,
): string {
  const cid = String(lead.customerId ?? '').trim()
  if (isStandardStudentCode(cid)) return cid
  if (cid) return cid
  const d = leadAnchorDate(lead)
  const prefix = formatStudentCodeDayPrefix(d)
  const seq = sequenceIndex?.get(lead.id) ?? 1
  return formatStudentCode(prefix, seq)
}

function countersDocRef(db: Firestore) {
  return doc(db, FS_COLLECTIONS.scoringAux, COUNTERS_DOC_ID)
}

/** Cấp mã SV mới khi tạo hồ sơ (DDMMYY + 4 số trong ngày, GMT+7). */
export async function allocateStudentCodeForNewLead(
  db: Firestore,
  at: Date = new Date(),
): Promise<string> {
  const prefix = formatStudentCodeDayPrefix(at)
  return runTransaction(db, async (tx) => {
    const ref = countersDocRef(db)
    const snap = await tx.get(ref)
    const data = snap.exists() ? (snap.data() as Record<string, unknown>) : {}
    const prev = Number(data[prefix] ?? 0)
    const next = prev + 1
    if (next > 9999) {
      throw new Error(`Đã hết số thứ tự mã sinh viên trong ngày ${prefix} (tối đa 9999).`)
    }
    tx.set(
      ref,
      {
        [prefix]: next,
        lastPrefix: prefix,
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    )
    return formatStudentCode(prefix, next)
  })
}

/** Đọc counter (debug / migrate). */
export async function peekStudentCodeSeq(db: Firestore, prefix: string): Promise<number> {
  const snap = await getDoc(countersDocRef(db))
  if (!snap.exists()) return 0
  return Number(snap.data()?.[prefix] ?? 0)
}
