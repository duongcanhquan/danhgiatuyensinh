/**
 * Nạp 50 mục kho tri thức RAG vào Firestore `knowledgeDocuments` (nội dung từ scripts/data/*.txt).
 *
 * Chuẩn bị (giống `npm run seed:super-admin`):
 *   GOOGLE_APPLICATION_CREDENTIALS=./secrets/serviceAccount.json
 *
 * Chạy (chỉ thêm, không xóa dữ liệu cũ):
 *   GOOGLE_APPLICATION_CREDENTIALS=./secrets/serviceAccount.json npm run seed:knowledge-base
 *
 * Xóa toàn bộ `knowledgeDocuments` rồi nạp lại (cẩn thận — môi trường dev):
 *   CLEAR_KNOWLEDGE=1 GOOGLE_APPLICATION_CREDENTIALS=./secrets/serviceAccount.json npm run seed:knowledge-base
 *
 * Chỉ kiểm tra parse, không ghi Firestore:
 *   node scripts/seed-knowledge-base.mjs --dry-run
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Timestamp } from 'firebase-admin/firestore'
import { initFirestoreAdmin } from './lib/firestoreAdminFromEnv.mjs'
import { parseKnowledgeSeedMarkdown } from './parseKnowledgeSeedMarkdown.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadCombinedSource() {
  const tuition = readFileSync(join(__dirname, 'data/knowledge-seed-tuition.txt'), 'utf8')
  const policy = readFileSync(join(__dirname, 'data/knowledge-seed-policy.txt'), 'utf8')
  const major = readFileSync(join(__dirname, 'data/knowledge-seed-major.txt'), 'utf8')
  return [tuition, policy, major].join('\n\n')
}

async function clearKnowledgeDocuments(db, collectionId) {
  const snap = await db.collection(collectionId).get()
  let batch = db.batch()
  let ops = 0
  for (const d of snap.docs) {
    batch.delete(d.ref)
    ops++
    if (ops >= 450) {
      await batch.commit()
      batch = db.batch()
      ops = 0
    }
  }
  if (ops) await batch.commit()
  console.log(`[seed] Đã xóa ${snap.size} tài liệu trong ${collectionId}.`)
}

const COLLECTION = 'knowledgeDocuments'

async function main() {
  const combined = loadCombinedSource()
  const entries = parseKnowledgeSeedMarkdown(combined)
  console.log('[seed] Đã parse', entries.length, 'mục (mong đợi 50).')

  const dry = process.argv.includes('--dry-run')
  if (dry) {
    for (let i = 0; i < Math.min(3, entries.length); i++) {
      console.log(`  — [${entries[i].type}] ${entries[i].title.slice(0, 72)}…`)
    }
    process.exit(0)
  }

  const { db, firestoreDbId } = initFirestoreAdmin()
  console.log('[seed] Firestore database_id:', firestoreDbId)

  if (process.env.CLEAR_KNOWLEDGE === '1' || process.env.CLEAR_KNOWLEDGE === 'true') {
    console.warn('[seed] CLEAR_KNOWLEDGE bật — xóa toàn bộ', COLLECTION)
    await clearKnowledgeDocuments(db, COLLECTION)
  }

  let batch = db.batch()
  let ops = 0
  let written = 0
  for (const e of entries) {
    const ref = db.collection(COLLECTION).doc()
    batch.set(ref, {
      title: e.title,
      type: e.type,
      content: e.content,
      uploadedAt: Timestamp.now(),
    })
    ops++
    written++
    if (ops >= 400) {
      await batch.commit()
      batch = db.batch()
      ops = 0
    }
  }
  if (ops) await batch.commit()

  console.log('[seed] Hoàn tất — đã ghi', written, 'tài liệu vào', COLLECTION)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
