import { collection, doc, documentId, getDoc, getDocs, query, where, type Firestore } from 'firebase/firestore'
import type { CounselorDailyKpi } from '../types'
import { FS_COLLECTIONS } from '../types'
import { mapKpiDoc } from './kpiMap'

const IN_CHUNK = 10

/**
 * Đọc KPI ngày theo danh sách UID (documentId in) — tránh getDocs cả subcollection counselors.
 * `uids === null` → quét full subcollection (fallback khi chưa có danh bạ).
 */
export async function fetchKpiDailyCounselorRows(
  db: Firestore,
  dates: string[],
  uids: string[] | null,
): Promise<CounselorDailyKpi[]> {
  const next: CounselorDailyKpi[] = []
  const uniqueUids = uids ? [...new Set(uids.map((u) => u.trim()).filter(Boolean))] : null

  for (const date of dates) {
    const col = collection(db, FS_COLLECTIONS.kpiDaily, date, 'counselors')
    if (!uniqueUids) {
      const snap = await getDocs(col)
      snap.forEach((d) => {
        next.push(mapKpiDoc(d.id, d.data() as Record<string, unknown>))
      })
      continue
    }
    if (uniqueUids.length === 0) continue
    if (uniqueUids.length === 1) {
      const snap = await getDoc(doc(db, FS_COLLECTIONS.kpiDaily, date, 'counselors', uniqueUids[0]!))
      if (snap.exists()) next.push(mapKpiDoc(snap.id, snap.data() as Record<string, unknown>))
      continue
    }
    for (let i = 0; i < uniqueUids.length; i += IN_CHUNK) {
      const chunk = uniqueUids.slice(i, i + IN_CHUNK)
      const snap = await getDocs(query(col, where(documentId(), 'in', chunk)))
      snap.forEach((d) => {
        next.push(mapKpiDoc(d.id, d.data() as Record<string, unknown>))
      })
    }
  }
  return next
}
