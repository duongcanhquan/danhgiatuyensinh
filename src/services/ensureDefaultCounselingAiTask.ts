import { collection, doc, getDocs, limit, query, setDoc, Timestamp, type Firestore } from 'firebase/firestore'
import { FS_COLLECTIONS } from '../types'
import { DEFAULT_COUNSELING_AI_TASK } from '../utils/counselingAiDefaults'

/** Tạo tác vụ AI mẫu nếu collection `ai_tasks` đang trống — TVV mới có thể chạy phân tích ngay. */
export async function ensureDefaultCounselingAiTask(db: Firestore): Promise<boolean> {
  const snap = await getDocs(query(collection(db, FS_COLLECTIONS.ai_tasks), limit(1)))
  if (!snap.empty) return false
  const t = Timestamp.now()
  await setDoc(doc(collection(db, FS_COLLECTIONS.ai_tasks)), {
    ...DEFAULT_COUNSELING_AI_TASK,
    createdAt: t,
    updatedAt: t,
  })
  return true
}
