/**
 * Nạp playbook tư vấn vào Firestore `consultingPlaybooks`.
 *
 * Mỗi document có thêm `seedTag: "vietmy_playbooks_v1"` để xóa gọn bằng:
 *   DELETE_PLAYBOOK_SEED=1 GOOGLE_APPLICATION_CREDENTIALS=./secrets/serviceAccount.json npm run seed:consulting-playbooks
 *
 * Chỉ thêm (không xóa playbook tay soạn trước đó):
 *   GOOGLE_APPLICATION_CREDENTIALS=./secrets/serviceAccount.json npm run seed:consulting-playbooks
 *
 * Dry-run (đếm mục, không ghi DB):
 *   node scripts/seed-consulting-playbooks.mjs --dry-run
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Timestamp } from 'firebase-admin/firestore'
import { initFirestoreAdmin } from './lib/firestoreAdminFromEnv.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SEED_TAG = 'vietmy_playbooks_v1'
const COLLECTION = 'consultingPlaybooks'

function loadSeedEntries() {
  const dir = join(__dirname, 'data', 'playbook-fragments')
  const parts = ['01.json', '02.json', '03.json', '04.json', '05.json']
  const out = []
  for (const f of parts) {
    const raw = readFileSync(join(dir, f), 'utf8')
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) throw new Error(`Invalid array in ${f}`)
    out.push(...arr)
  }
  return out
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
  console.log(`[seed] Đã xóa ${total} playbook có seedTag=${SEED_TAG}`)
}

async function main() {
  const entries = loadSeedEntries()
  console.log('[seed] Đã nạp', entries.length, 'mục từ JSON fragments (mong đợi 50).')

  const dry = process.argv.includes('--dry-run')
  if (dry) {
    console.log('  Ví dụ:', entries[0]?.title, '| priority', entries[0]?.priority)
    process.exit(0)
  }

  const { db } = initFirestoreAdmin()

  if (process.env.DELETE_PLAYBOOK_SEED === '1' || process.env.DELETE_PLAYBOOK_SEED === 'true') {
    await deleteSeeded(db)
    process.exit(0)
  }

  const now = Timestamp.now()
  let batch = db.batch()
  let ops = 0
  let written = 0
  for (const e of entries) {
    const ref = db.collection(COLLECTION).doc()
    batch.set(ref, {
      title: e.title,
      isActive: e.isActive !== false,
      priority: Number(e.priority ?? 0),
      triggerConditions: Array.isArray(e.triggerConditions) ? e.triggerConditions : [],
      strategy: String(e.strategy ?? ''),
      keySellingPoints: Array.isArray(e.keySellingPoints) ? e.keySellingPoints.map(String) : [],
      objectionHandling: Array.isArray(e.objectionHandling) ? e.objectionHandling.map(String) : [],
      seedTag: SEED_TAG,
      createdAt: now,
      updatedAt: now,
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
  console.log('[seed] Đã ghi', written, 'playbook vào', COLLECTION, `(seedTag=${SEED_TAG})`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
