import { initializeApp, getApps, type FirebaseApp, type FirebaseOptions } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore'
import { getDatabase, type Database } from 'firebase/database'
import { getStorage, type FirebaseStorage } from 'firebase/storage'

/**
 * Khởi tạo Firebase từ biến môi trường Vite (.env).
 * Firestore: CRM chính (tuỳ chọn `VITE_FIREBASE_FIRESTORE_DATABASE_ID` nếu không dùng `(default)`).
 * Realtime Database: có `databaseURL` khi cần RTDB.
 */
const requiredEnv = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const

function readFirebaseConfig(): { config: FirebaseOptions; missing: string[] } {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined
  const storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined
  const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined
  const appId = import.meta.env.VITE_FIREBASE_APP_ID as string | undefined
  const databaseURL = import.meta.env.VITE_FIREBASE_DATABASE_URL as string | undefined
  const measurementId = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined

  const config: FirebaseOptions = {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
  }
  if (databaseURL) config.databaseURL = databaseURL
  if (measurementId) config.measurementId = measurementId

  const missing = requiredEnv.filter((k) => !import.meta.env[k])
  return { config, missing }
}

let app: FirebaseApp | null = null
let db: Firestore | null = null
let firestoreCacheKey: string | null = null
let rtdb: Database | null = null
let auth: Auth | null = null
let storage: FirebaseStorage | null = null

export function isFirebaseConfigured(): boolean {
  const { missing } = readFirebaseConfig()
  return missing.length === 0
}

export function getFirebaseMissingKeys(): string[] {
  return readFirebaseConfig().missing
}

function ensureApp(): FirebaseApp | null {
  if (app) return app
  const { config, missing } = readFirebaseConfig()
  if (missing.length) return null
  const apps = getApps()
  const existing = apps.find((a) => a.name === '[DEFAULT]')
  if (existing) {
    app = existing
  } else {
    app = initializeApp(config)
  }
  return app
}

/** App Auth phụ — tạo user mới mà không đăng xuất admin (Firebase multi-app). */
let staffCreatorApp: FirebaseApp | null = null
export function getStaffCreatorAuth(): { auth: ReturnType<typeof getAuth>; signOutSecondary: () => Promise<void> } | null {
  const { config, missing } = readFirebaseConfig()
  if (missing.length) return null
  const name = 'staff-creator'
  if (!staffCreatorApp) {
    const exists = getApps().find((a) => a.name === name)
    staffCreatorApp = exists ?? initializeApp(config, name)
  }
  const secondaryAuth = getAuth(staffCreatorApp)
  return {
    auth: secondaryAuth,
    signOutSecondary: () => secondaryAuth.signOut(),
  }
}

/** Analytics (tuỳ chọn) — gọi một lần sau khi app đã mount. */
export async function initFirebaseAnalytics(): Promise<void> {
  const a = ensureApp()
  if (!a || typeof window === 'undefined') return
  const measurementId = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined
  if (!measurementId) return
  try {
    const { getAnalytics, isSupported } = await import('firebase/analytics')
    if (await isSupported()) {
      getAnalytics(a)
    }
  } catch {
    // Analytics không bắt buộc
  }
}

export function getFirebaseApp(): FirebaseApp | null {
  return ensureApp()
}

/** Firestore — mặc định `(default)`; database đặt tên (vd. `warmlist`) cần `VITE_FIREBASE_FIRESTORE_DATABASE_ID`. */
export function getFirestoreDb(): Firestore | null {
  const a = ensureApp()
  if (!a) return null
  const customId = (import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID as string | undefined)?.trim()
  const cacheKey = customId || '(default)'
  if (db && firestoreCacheKey === cacheKey) return db

  const localCache = persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  try {
    db = customId
      ? initializeFirestore(a, { localCache }, customId)
      : initializeFirestore(a, { localCache })
  } catch {
    // Đã khởi tạo Firestore trước đó (vd. getFirestore ở module khác) — dùng instance mặc định.
    db = customId ? getFirestore(a, customId) : getFirestore(a)
  }
  firestoreCacheKey = cacheKey
  return db
}

/** Realtime Database — chỉ khi có `VITE_FIREBASE_DATABASE_URL` */
export function getRealtimeDb(): Database | null {
  if (rtdb) return rtdb
  const a = ensureApp()
  if (!a) return null
  const databaseURL = import.meta.env.VITE_FIREBASE_DATABASE_URL as string | undefined
  if (!databaseURL) return null
  rtdb = getDatabase(a)
  return rtdb
}

/** Firebase Storage — chứng từ thu tiền (thay Drive upload hệ cũ) */
export function getFirebaseStorage(): FirebaseStorage | null {
  if (storage) return storage
  const a = ensureApp()
  if (!a) return null
  const bucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined
  if (!bucket?.trim()) return null
  storage = getStorage(a)
  return storage
}

/** Firebase Auth */
export function getFirebaseAuth(): Auth | null {
  if (auth) return auth
  const a = ensureApp()
  if (!a) return null
  auth = getAuth(a)
  return auth
}
