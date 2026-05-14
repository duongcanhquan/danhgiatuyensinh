/**
 * Dọn field `description` trên toàn bộ `leads`: xoá các dòng nhật ký nhập dạng `[Import]…`
 * (trước đây được nối vào khi «Người phụ trách» Excel không khớp TVV/Admin).
 *
 * Chuẩn bị giống seed admin:
 *   GOOGLE_APPLICATION_CREDENTIALS=./secrets/serviceAccount.json
 * Tuỳ chọn .env: VITE_FIREBASE_FIRESTORE_DATABASE_ID=… nếu không dùng database (default).
 *
 * Chạy thử (chỉ đếm, không ghi):
 *   GOOGLE_APPLICATION_CREDENTIALS=./secrets/serviceAccount.json STRIP_IMPORT_DRY_RUN=1 node scripts/strip-lead-import-description.mjs
 *
 * Chạy thật:
 *   GOOGLE_APPLICATION_CREDENTIALS=./secrets/serviceAccount.json node scripts/strip-lead-import-description.mjs
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import admin from 'firebase-admin'
import { FieldPath, FieldValue, getFirestore } from 'firebase-admin/firestore'

const LEADS = 'leads'
const PAGE = 400
const BATCH_MAX = 450

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

/** Chỉ xoá dòng có nội dung (sau trim) bắt đầu bằng `[Import]` — giữ các dòng khác và xuống dòng giữa chúng. */
function stripImportDescriptionLines(raw) {
  if (typeof raw !== 'string') return { next: raw, changed: false }
  let removed = false
  const kept = raw.split('\n').filter((line) => {
    const t = line.trim()
    if (t && /^\[Import\]/i.test(t)) {
      removed = true
      return false
    }
    return true
  })
  if (!removed) return { next: raw, changed: false }
  const next = kept.join('\n').replace(/^\s+|\s+$/g, '')
  return { next, changed: true }
}

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
const dryRun =
  String(process.env.STRIP_IMPORT_DRY_RUN || '')
    .trim()
    .match(/^(1|true|yes)$/i)

if (!credPath) {
  console.error('Thiếu GOOGLE_APPLICATION_CREDENTIALS (ví dụ ./secrets/serviceAccount.json).')
  process.exit(1)
}

let serviceAccount
try {
  serviceAccount = JSON.parse(readFileSync(credPath, 'utf8'))
} catch {
  console.error('Không đọc được JSON service account:', credPath)
  process.exit(1)
}

const databaseURL =
  (process.env.FIREBASE_DATABASE_URL || '').trim() ||
  readDotenvValue('VITE_FIREBASE_DATABASE_URL') ||
  undefined

const adminInit = { credential: admin.credential.cert(serviceAccount) }
if (databaseURL) adminInit.databaseURL = databaseURL
admin.initializeApp(adminInit)

const firestoreDbId = (
  process.env.FIRESTORE_DATABASE_ID ||
  readDotenvValue('VITE_FIREBASE_FIRESTORE_DATABASE_ID') ||
  ''
).trim()
const db = firestoreDbId ? getFirestore(admin.app(), firestoreDbId) : getFirestore(admin.app())
console.log('[migrate] project_id:', serviceAccount.project_id)
console.log('[migrate] Firestore database_id:', firestoreDbId || '(default)')
console.log('[migrate] dry_run:', dryRun ? 'YES (không ghi)' : 'NO — sẽ cập nhật documents')

let scanned = 0
let wouldUpdate = 0
let updated = 0
let skippedNoString = 0

let last = null
while (true) {
  let q = db.collection(LEADS).orderBy(FieldPath.documentId()).limit(PAGE)
  if (last) q = q.startAfter(last)
  const snap = await q.get()
  if (snap.empty) break

  const pending = []
  for (const doc of snap.docs) {
    last = doc
    scanned += 1
    const data = doc.data()
    const desc = data.description
    if (typeof desc !== 'string') {
      if (desc != null) skippedNoString += 1
      continue
    }
    const { next, changed } = stripImportDescriptionLines(desc)
    if (!changed) continue
    wouldUpdate += 1
    if (!dryRun) pending.push({ ref: doc.ref, next })
  }

  if (!dryRun && pending.length) {
    for (let i = 0; i < pending.length; i += BATCH_MAX) {
      const slice = pending.slice(i, i + BATCH_MAX)
      const batch = db.batch()
      for (const { ref, next } of slice) {
        batch.update(ref, {
          description: next,
          updatedAt: FieldValue.serverTimestamp(),
        })
      }
      await batch.commit()
      updated += slice.length
    }
  }

  if (snap.size < PAGE) break
}

console.log('[migrate] scanned_leads:', scanned)
console.log('[migrate] leads_with_import_lines_removed:', dryRun ? wouldUpdate : updated)
if (skippedNoString) console.log('[migrate] skipped_non_string_description:', skippedNoString)
if (dryRun) console.log('[migrate] Chạy lại không có STRIP_IMPORT_DRY_RUN để ghi Firestore.')
process.exit(0)
