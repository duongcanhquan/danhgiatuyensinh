/**
 * Nạp 20 snippet Script Hub vào Firestore `scriptSnippets`.
 *
 * ID cố định (`vietmy_seed_script_01` … `20`) — chạy lại sẽ ghi đè cùng ID (cập nhật nội dung).
 * `seedTag: "vietmy_script_snippets_v1"` — xóa hàng loạt:
 *   DELETE_SCRIPT_SNIPPET_SEED=1 GOOGLE_APPLICATION_CREDENTIALS=./secrets/x.json npm run seed:script-snippets
 *
 * Chỉ ghi / cập nhật các doc trên (không xóa snippet tay tạo khác).
 *
 * Dry-run:
 *   node scripts/seed-script-snippets.mjs --dry-run
 */
import { Timestamp } from 'firebase-admin/firestore'
import { initFirestoreAdmin } from './lib/firestoreAdminFromEnv.mjs'
import { VIETMY_SCRIPT_SNIPPET_SEED_ENTRIES } from './data/vietmy-script-snippet-seed-entries.mjs'

const SEED_TAG = 'vietmy_script_snippets_v1'
const COLLECTION = 'scriptSnippets'

const ALLOWED = new Set(['GREETING', 'USP', 'CAREER_VISION', 'OBJECTION_HANDLING', 'CLOSING'])

function validate(entries) {
  if (!Array.isArray(entries) || entries.length !== 20) {
    throw new Error(`Cần đúng 20 snippet, hiện có ${entries?.length ?? 0}`)
  }
  const ids = new Set()
  for (const e of entries) {
    if (!e.id || typeof e.id !== 'string') throw new Error('Thiếu id')
    if (ids.has(e.id)) throw new Error(`Trùng id: ${e.id}`)
    ids.add(e.id)
    if (!e.title || !e.category || !Array.isArray(e.matchConditions) || !e.matchConditions.length) {
      throw new Error(`Dữ liệu không hợp lệ: ${e.id}`)
    }
    if (!ALLOWED.has(e.category)) throw new Error(`category không hợp lệ tại ${e.id}: ${e.category}`)
    for (const c of e.matchConditions) {
      if (!c.field || c.value === undefined || c.value === '') throw new Error(`Điều kiện thiếu field/value: ${e.id}`)
    }
  }
}

async function deleteSeeded(db) {
  const snap = await db.collection(COLLECTION).where('seedTag', '==', SEED_TAG).get()
  let batch = db.batch()
  let n = 0
  let total = 0
  for (const d of snap.docs) {
    batch.delete(d.ref)
    n++
    total++
    if (n >= 450) {
      await batch.commit()
      batch = db.batch()
      n = 0
    }
  }
  if (n) await batch.commit()
  console.log(`[seed-script] Đã xóa ${total} snippet có seedTag=${SEED_TAG}`)
}

async function main() {
  const entries = VIETMY_SCRIPT_SNIPPET_SEED_ENTRIES
  validate(entries)

  const dry = process.argv.includes('--dry-run')
  if (dry) {
    console.log('[seed-script] dry-run:', entries.length, 'snippet')
    console.log('  Ví dụ:', entries[0].id, entries[0].title, '|', entries[0].category)
    process.exit(0)
  }

  const { db } = initFirestoreAdmin()

  if (process.env.DELETE_SCRIPT_SNIPPET_SEED === '1' || process.env.DELETE_SCRIPT_SNIPPET_SEED === 'true') {
    await deleteSeeded(db)
    process.exit(0)
  }

  const now = Timestamp.now()
  let batch = db.batch()
  let ops = 0
  let written = 0

  for (const e of entries) {
    const ref = db.collection(COLLECTION).doc(e.id)
    const snap = await ref.get()
    const payload = {
      title: e.title,
      category: e.category,
      content: String(e.content ?? ''),
      matchConditions: e.matchConditions,
      isActive: e.isActive !== false,
      seedTag: SEED_TAG,
      lastUpdated: now,
    }
    if (!snap.exists) {
      payload.createdAt = now
    }
    batch.set(ref, payload, { merge: true })
    ops++
    written++
    if (ops >= 400) {
      await batch.commit()
      batch = db.batch()
      ops = 0
    }
  }
  if (ops) await batch.commit()
  console.log('[seed-script] Đã set', written, 'document vào', COLLECTION, `(id cố định, seedTag=${SEED_TAG})`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
