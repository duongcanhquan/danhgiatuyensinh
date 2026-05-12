/**
 * Tạo / cập nhật super admin (Firebase Auth + Firestore users/{uid}, role admin).
 *
 * Không hardcode mật khẩu trong repo — truyền qua biến môi trường khi chạy (tránh lộ trên Git/GitHub Pages).
 *
 * Chuẩn bị:
 * 1. Firebase Console → Service accounts → Generate new private key → lưu JSON vào
 *    secrets/serviceAccount.json (thư mục secrets/ đã gitignore; không commit file Downloads).
 * 2. Authentication → Sign-in method → bật Email/Password
 * 3. Firestore đã tạo + Rules cho phép ghi (dev: xem firestore.rules.example).
 *    Nếu database không phải «(default)» mà có ID riêng (vd. warmlist) → đặt VITE_FIREBASE_FIRESTORE_DATABASE_ID trong .env.
 *
 * Admin SDK: nếu có `VITE_FIREBASE_DATABASE_URL` trong .env hoặc env `FIREBASE_DATABASE_URL`,
 * script truyền `databaseURL` giống snippet Realtime Database (không bắt buộc cho bước seed hiện tại).
 *
 * Chạy (một dòng, từ thư mục gốc project):
 *   GOOGLE_APPLICATION_CREDENTIALS=./secrets/serviceAccount.json SEED_ADMIN_PASSWORD='matKhauCuaBan' npm run seed:super-admin
 *
 * Tuỳ chọn: SEED_ADMIN_EMAIL=khac@domain.edu.vn (mặc định: quan.duong@caodangvietmy.edu.vn)
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import admin from 'firebase-admin'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

/** Đọc một dòng KEY=value từ .env (không cần dotenv). */
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

const email = (process.env.SEED_ADMIN_EMAIL || 'quan.duong@caodangvietmy.edu.vn').trim().toLowerCase()
const password = process.env.SEED_ADMIN_PASSWORD
const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS

if (!credPath) {
  console.error(
    'Thiếu GOOGLE_APPLICATION_CREDENTIALS (đường dẫn file JSON service account, ví dụ ./secrets/serviceAccount.json).',
  )
  process.exit(1)
}
if (!password || password.length < 6) {
  console.error('Thiếu SEED_ADMIN_PASSWORD (tối thiểu 6 ký tự). Không lưu mật khẩu trong file script.')
  process.exit(1)
}

let serviceAccount
try {
  serviceAccount = JSON.parse(readFileSync(credPath, 'utf8'))
} catch {
  console.error('Không đọc được file JSON tại:', credPath)
  process.exit(1)
}

const keyProjectId = serviceAccount.project_id
console.log('[seed] Service account → project_id:', keyProjectId ?? '(thiếu trong JSON)')
const envProjectId = readDotenvValue('VITE_FIREBASE_PROJECT_ID')
if (envProjectId && keyProjectId && envProjectId !== keyProjectId) {
  console.warn(
    `[seed] Cảnh báo: .env VITE_FIREBASE_PROJECT_ID=«${envProjectId}» khác project trong JSON. Tải private key mới từ Firebase Console → đúng project rồi ghi đè ${credPath}.`,
  )
}

const databaseURL =
  (process.env.FIREBASE_DATABASE_URL || '').trim() ||
  readDotenvValue('VITE_FIREBASE_DATABASE_URL') ||
  undefined

const adminInit = {
  credential: admin.credential.cert(serviceAccount),
}
if (databaseURL) adminInit.databaseURL = databaseURL

admin.initializeApp(adminInit)

const auth = admin.auth()
const firestoreDbId = (
  process.env.FIRESTORE_DATABASE_ID ||
  readDotenvValue('VITE_FIREBASE_FIRESTORE_DATABASE_ID') ||
  ''
).trim()
const db = firestoreDbId ? getFirestore(admin.app(), firestoreDbId) : getFirestore(admin.app())
const now = FieldValue.serverTimestamp()
console.log('[seed] Firestore database_id:', firestoreDbId || '(default)')

let uid
try {
  const user = await auth.createUser({
    email,
    password,
    displayName: 'Super Admin',
    emailVerified: true,
  })
  uid = user.uid
  console.log('Đã tạo user Authentication:', email, `(${uid})`)
} catch (e) {
  const code = e?.code ?? e?.errorInfo?.code
  const msg = String(e?.message ?? '')
  if (code === 'auth/email-already-exists' || msg.includes('email-already-exists')) {
    const existing = await auth.getUserByEmail(email)
    uid = existing.uid
    await auth.updateUser(uid, {
      password,
      displayName: 'Super Admin',
    })
    console.log('User đã tồn tại — đã cập nhật mật khẩu:', email, `(${uid})`)
  } else {
    console.error(e)
    process.exit(1)
  }
}

try {
  await db.doc(`users/${uid}`).set(
    {
      email,
      displayName: 'Super Admin',
      role: 'admin',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true },
  )
} catch (e) {
  const grpc = e?.code
  const msg = String(e?.message ?? e ?? '')
  const reason = e?.reason ?? e?.errorInfoMetadata?.reason
  const looksNotFound = grpc === 5 || msg.includes('NOT_FOUND')
  const looksApiDisabled =
    grpc === 7 ||
    reason === 'SERVICE_DISABLED' ||
    msg.includes('Cloud Firestore API has not been used') ||
    msg.includes('firestore.googleapis.com')
  if (looksNotFound) {
    console.error(
      '\n❌ Firestore NOT_FOUND — thường gặp khi:\n' +
        '   • Chưa tạo Cloud Firestore (tab Firestore Database, không phải Realtime Database), hoặc\n' +
        '   • Bạn tạo database có ID riêng (vd. «warmlist») nhưng app/script vẫn trỏ tới «(default)».\n' +
        '   → Đặt trong .env: VITE_FIREBASE_FIRESTORE_DATABASE_ID=đúng_id_trên_Console\n' +
        '   → Hoặc tạo thêm database tên (default) nếu muốn giữ .env không có biến này.\n',
    )
  } else if (looksApiDisabled) {
    const apiUrl = `https://console.developers.google.com/apis/api/firestore.googleapis.com/overview?project=${keyProjectId}`
    console.error(
      '\n❌ Cloud Firestore API chưa bật hoặc chưa khởi tạo Firestore trong project.\n' +
        `   1) Google Cloud Console → bật API (đúng project «${keyProjectId}»):\n` +
        `      ${apiUrl}\n` +
        '   2) Firebase Console → Build → Firestore Database → Create database (nếu chưa có).\n' +
        '   Đợi vài phút sau khi bật API rồi chạy lại seed.\n',
    )
  } else {
    console.error(e)
  }
  process.exit(1)
}

console.log('Đã ghi Firestore users/', uid, '(role: admin)')
console.log('Hoàn tất. Đăng nhập app bằng email + SEED_ADMIN_PASSWORD vừa dùng.')
process.exit(0)
