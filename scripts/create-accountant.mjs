/**
 * Tạo / cập nhật tài khoản kế toán mặc định (Firebase Auth + Firestore users/{uid}, role accountant).
 *
 * Chạy (không commit mật khẩu vào Git):
 *   GOOGLE_APPLICATION_CREDENTIALS=./secrets/serviceAccount.json SEED_ACCOUNTANT_PASSWORD='...' npm run seed:accountant
 *
 * Tuỳ chọn: SEED_ACCOUNTANT_EMAIL=quan.duong@caodangvietmy.edu.vn
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import admin from 'firebase-admin'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

function readDotenvValue(key) {
  try {
    const text = readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    const line = text.split('\n').find((l) => {
      const t = l.trim()
      return t.startsWith(`${key}=`) && !t.startsWith('#')
    })
    if (!line) return undefined
    const v = line.slice(line.indexOf('=') + 1).trim()
    return v.replace(/^["']|["']$/g, '') || undefined
  } catch {
    return undefined
  }
}

const email = (
  process.env.SEED_ACCOUNTANT_EMAIL ||
  readDotenvValue('VITE_DEFAULT_ACCOUNTANT_EMAIL') ||
  'quan.duong@caodangvietmy.edu.vn'
)
  .trim()
  .toLowerCase()
const password = process.env.SEED_ACCOUNTANT_PASSWORD
const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS

if (!credPath) {
  console.error('Thiếu GOOGLE_APPLICATION_CREDENTIALS.')
  process.exit(1)
}
if (!password || password.length < 6) {
  console.error('Thiếu SEED_ACCOUNTANT_PASSWORD (tối thiểu 6 ký tự).')
  process.exit(1)
}

const serviceAccount = JSON.parse(readFileSync(credPath, 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })

const firestoreDbId = (
  process.env.FIRESTORE_DATABASE_ID ||
  readDotenvValue('VITE_FIREBASE_FIRESTORE_DATABASE_ID') ||
  ''
).trim()
const db = firestoreDbId ? getFirestore(admin.app(), firestoreDbId) : getFirestore(admin.app())
const auth = admin.auth()
const now = FieldValue.serverTimestamp()

let uid
try {
  const user = await auth.createUser({
    email,
    password,
    displayName: 'Kế toán VietMy',
    emailVerified: true,
  })
  uid = user.uid
  console.log('Đã tạo user kế toán:', email, uid)
} catch (e) {
  if (e?.code === 'auth/email-already-exists') {
    const existing = await auth.getUserByEmail(email)
    uid = existing.uid
    await auth.updateUser(uid, { password, displayName: 'Kế toán VietMy' })
    console.log('User đã tồn tại — cập nhật mật khẩu:', email, uid)
  } else {
    console.error(e)
    process.exit(1)
  }
}

await db.doc(`users/${uid}`).set(
  {
    email,
    displayName: 'Kế toán VietMy',
    role: 'accountant',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  { merge: true },
)

console.log('Hoàn tất. Đăng nhập tại /ke-toan/login')
process.exit(0)
