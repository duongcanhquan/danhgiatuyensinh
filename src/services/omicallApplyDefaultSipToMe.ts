import { doc, Timestamp, updateDoc } from 'firebase/firestore'
import { FS_COLLECTIONS } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from './firebase'

/** Ghi số + mật khẩu SIP mặc định vào hồ sơ tài khoản đang đăng nhập (tự sửa users/{uid}). */
export async function applyOmicallDefaultSipToMe(input: {
  uid: string
  sipUser: string
  sipPassword: string
}): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error('Chưa cấu hình Firebase.')
  const db = getFirestoreDb()
  if (!db) throw new Error('Firestore chưa cấu hình.')
  const sipUser = input.sipUser.trim()
  const sipPassword = input.sipPassword.trim()
  if (!input.uid.trim()) throw new Error('Thiếu tài khoản đăng nhập.')
  if (!sipUser || !sipPassword) {
    throw new Error('Cần điền đủ số nội bộ mặc định và mật khẩu SIP trước.')
  }
  await updateDoc(doc(db, FS_COLLECTIONS.users, input.uid.trim()), {
    omicallSipUser: sipUser,
    omicallSipPassword: sipPassword,
    updatedAt: Timestamp.now(),
  })
}
