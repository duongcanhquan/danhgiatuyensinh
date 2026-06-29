import { doc, getDoc, runTransaction, Timestamp, type Firestore } from 'firebase/firestore'
import { FS_COLLECTIONS } from '../types'

const VN_TZ = 'Asia/Ho_Chi_Minh'
const COUNTERS_DOC_ID = 'systemLeadCodeCounters'

export const SYSTEM_LEAD_CODE_LEN = 10
export const SYSTEM_LEAD_CODE_SEQ_LEN = 4

/** Mã hệ thống: YYMMDD (6) + thứ tự trong ngày (4), ví dụ 2605260001. */
export function isSystemLeadCode(raw: string): boolean {
  return /^\d{10}$/.test(String(raw ?? '').trim())
}

/** Tiền tố ngày theo giờ VN — YYMMDD. */
export function formatSystemLeadCodeDayPrefix(at: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: VN_TZ,
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).formatToParts(at)
  const day = parts.find((p) => p.type === 'day')?.value ?? '01'
  const month = parts.find((p) => p.type === 'month')?.value ?? '01'
  const year = parts.find((p) => p.type === 'year')?.value ?? '00'
  return `${year}${month}${day}`
}

export function formatSystemLeadCode(prefix: string, sequence: number): string {
  const seq = Math.max(1, Math.min(9999, Math.floor(sequence)))
  return `${prefix}${String(seq).padStart(SYSTEM_LEAD_CODE_SEQ_LEN, '0')}`
}

function countersDocRef(db: Firestore) {
  return doc(db, FS_COLLECTIONS.scoringAux, COUNTERS_DOC_ID)
}

/** Cấp mã hệ thống khi tạo hồ sơ mới (YYMMDD + 4 số trong ngày, GMT+7). */
export async function allocateSystemCodeForNewLead(
  db: Firestore,
  at: Date = new Date(),
): Promise<string> {
  const prefix = formatSystemLeadCodeDayPrefix(at)
  return runTransaction(db, async (tx) => {
    const ref = countersDocRef(db)
    const snap = await tx.get(ref)
    const data = snap.exists() ? (snap.data() as Record<string, unknown>) : {}
    const prev = Number(data[prefix] ?? 0)
    const next = prev + 1
    if (next > 9999) {
      throw new Error(`Đã hết số thứ tự mã hệ thống trong ngày ${prefix} (tối đa 9999).`)
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
    return formatSystemLeadCode(prefix, next)
  })
}

export async function peekSystemLeadCodeSeq(db: Firestore, prefix: string): Promise<number> {
  const snap = await getDoc(countersDocRef(db))
  if (!snap.exists()) return 0
  return Number(snap.data()?.[prefix] ?? 0)
}
