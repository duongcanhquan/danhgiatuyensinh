/**
 * Khởi tạo Firebase Admin + Firestore (giống pattern `create-super-admin.mjs`).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import admin from 'firebase-admin'
import { getFirestore } from 'firebase-admin/firestore'

export function readDotenvValue(key) {
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

export function initFirestoreAdmin() {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!credPath) {
    throw new Error(
      'Thiếu GOOGLE_APPLICATION_CREDENTIALS (đường dẫn service account JSON, ví dụ ./secrets/serviceAccount.json).',
    )
  }
  let serviceAccount
  try {
    serviceAccount = JSON.parse(readFileSync(credPath, 'utf8'))
  } catch {
    throw new Error(`Không đọc được JSON tại: ${credPath}`)
  }
  const databaseURL =
    (process.env.FIREBASE_DATABASE_URL || '').trim() ||
    readDotenvValue('VITE_FIREBASE_DATABASE_URL') ||
    undefined
  const adminInit = { credential: admin.credential.cert(serviceAccount) }
  if (databaseURL) adminInit.databaseURL = databaseURL
  if (!admin.apps.length) admin.initializeApp(adminInit)
  const firestoreDbId = (
    process.env.FIRESTORE_DATABASE_ID ||
    readDotenvValue('VITE_FIREBASE_FIRESTORE_DATABASE_ID') ||
    ''
  ).trim()
  const db = firestoreDbId ? getFirestore(admin.app(), firestoreDbId) : getFirestore(admin.app())
  return { db, firestoreDbId: firestoreDbId || '(default)' }
}
