import { collection, doc, getDocs, limit, query, setDoc, Timestamp, where, type Firestore } from 'firebase/firestore'
import { FS_COLLECTIONS } from '../types'
import { DEFAULT_ORG_ID } from '../tenancy/orgConstants'
import { DEFAULT_COUNSELING_AI_TASK } from '../utils/counselingAiDefaults'

/** Tạo tác vụ AI mẫu nếu collection `ai_tasks` của trường đang trống. */
export async function ensureDefaultCounselingAiTask(
  db: Firestore,
  orgId: string = DEFAULT_ORG_ID,
): Promise<boolean> {
  const oid = orgId.trim() || DEFAULT_ORG_ID
  const snap = await getDocs(
    query(collection(db, FS_COLLECTIONS.ai_tasks), where('orgId', '==', oid), limit(1)),
  )
  if (!snap.empty) return false
  const t = Timestamp.now()
  await setDoc(doc(collection(db, FS_COLLECTIONS.ai_tasks)), {
    ...DEFAULT_COUNSELING_AI_TASK,
    orgId: oid,
    createdAt: t,
    updatedAt: t,
  })
  return true
}
