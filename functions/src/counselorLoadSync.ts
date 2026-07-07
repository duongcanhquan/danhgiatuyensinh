import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { adjustCounselorLoad } from './firestoreReads.js'

function str(v: unknown): string {
  return String(v ?? '').trim()
}

function leadAssignee(data: Record<string, unknown> | undefined): string {
  if (!data) return ''
  return str(data.assignedTo) || str(data.assignedCounselorId)
}

/** Đồng bộ `stats/counselorLoads` khi gán / đổi / xóa TVV trên hồ sơ. */
export function registerCounselorLoadOnLeadWrite(db: Firestore, databaseId: string, leadsCollection: string) {
  return onDocumentWritten(
    { document: `${leadsCollection}/{leadId}`, database: databaseId },
    async (event) => {
      const before = event.data?.before
      const after = event.data?.after

      if (!after?.exists) {
        const from = leadAssignee(before?.data())
        if (from) await adjustCounselorLoad(db, from, null)
        return
      }

      const afterData = after.data() as Record<string, unknown>
      const afterAssignee = leadAssignee(afterData)

      if (!before?.exists) {
        // Cổng đăng ký đã tăng counter trong pickCounselorByLoadInTransaction.
        if (str(afterData.registrationChannel) === 'public_portal') return
        if (afterAssignee) await adjustCounselorLoad(db, null, afterAssignee)
        return
      }

      const beforeAssignee = leadAssignee(before.data() as Record<string, unknown>)
      if (beforeAssignee !== afterAssignee) {
        await adjustCounselorLoad(db, beforeAssignee || null, afterAssignee || null)
      }
    },
  )
}

/** Đếm hồ sơ theo TVV bằng aggregate count — chạy một lần sau deploy (admin). */
export async function backfillCounselorLoads(
  db: Firestore,
  usersCollection: string,
  leadsCollection: string,
): Promise<{ counselors: number; totalAssigned: number }> {
  const counselorsSnap = await db.collection(usersCollection).where('role', '==', 'counselor').get()
  const counts: Record<string, number> = {}
  let totalAssigned = 0

  for (const doc of counselorsSnap.docs) {
    const data = doc.data()
    if (data.isActive === false) continue
    const id = doc.id
    let n = (await db.collection(leadsCollection).where('assignedCounselorId', '==', id).count().get()).data()
      .count
    if (n === 0) {
      n = (await db.collection(leadsCollection).where('assignedTo', '==', id).count().get()).data().count
    }
    counts[id] = n
    totalAssigned += n
  }

  await db.collection('stats').doc('counselorLoads').set({
    counts,
    updatedAt: Timestamp.now(),
    source: 'admin_backfill',
  })

  return { counselors: Object.keys(counts).length, totalAssigned }
}

export function registerBackfillCounselorLoadsCallable(
  db: Firestore,
  usersCollection: string,
  leadsCollection: string,
) {
  return onCall(async (request) => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Cần đăng nhập.')
    const caller = await db.collection(usersCollection).doc(request.auth.uid).get()
    const role = str(caller.data()?.role)
    if (role !== 'admin' && role !== 'super_admin') {
      throw new HttpsError('permission-denied', 'Chỉ quản trị mới chạy backfill bộ đếm TVV.')
    }
    const result = await backfillCounselorLoads(db, usersCollection, leadsCollection)
    return { ok: true, ...result }
  })
}
