/**
 * Xóa nhanh dữ liệu nghiệp vụ trên Firestore (Admin SDK).
 *
 * ⚠️ NGUY HIỂM — mặc định KHÔNG xóa `users` / `organizations`.
 *
 * Chuẩn bị:
 *   GOOGLE_APPLICATION_CREDENTIALS=./secrets/serviceAccount.json
 *   (tuỳ chọn) VITE_FIREBASE_FIRESTORE_DATABASE_ID trong .env → thường `warmlist`
 *
 * Chế độ (WIPE_MODE):
 *   leads    — chỉ collection `leads` (+ subcollection tương tác / AI dưới từng hồ sơ)
 *   ops      — hồ sơ + OMICall, KPI, audit, sự kiện, báo cáo tài chính (mặc định)
 *   catalog  — ops + nguồn/học bổng/playbook/script/knowledge/scoring/masterData/ai_tasks
 *   all_data — catalog + orgSettings + platformAuditLogs (vẫn giữ users + organizations)
 *
 * Chỉ đếm (không xóa):
 *   GOOGLE_APPLICATION_CREDENTIALS=./secrets/serviceAccount.json WIPE_DRY_RUN=1 node scripts/wipe-firestore-data.mjs
 *
 * Xóa thật (bắt buộc xác nhận):
 *   GOOGLE_APPLICATION_CREDENTIALS=./secrets/serviceAccount.json ^
 *     WIPE_CONFIRM=XOA_HET_DU_LIEU WIPE_MODE=ops node scripts/wipe-firestore-data.mjs
 *
 * Chỉ một trường (orgId):
 *   ... WIPE_ORG_ID=vietmy ...
 *
 * Xóa cả users (không khuyến nghị):
 *   ... WIPE_INCLUDE_USERS=1 ...
 */
import { FieldPath } from 'firebase-admin/firestore'
import { initFirestoreAdmin, readDotenvValue } from './lib/firestoreAdminFromEnv.mjs'

const PAGE = 400

const MODE_OPS = [
  'leads',
  'auditLogs',
  'omicallCalls',
  'omicallCallAnalyses',
  'omicallSyncRuns',
  'leadEvents',
  'financeReports',
  'kpiDaily',
  'kpiMonthly',
  'kpiTargets',
  'kpiManualScores',
]

const MODE_CATALOG_EXTRA = [
  'leadSources',
  'scholarships',
  'consultingPlaybooks',
  'scriptSnippets',
  'knowledgeDocuments',
  'scoringProfiles',
  'scoringRuleTemplates',
  'scoringRuleSets',
  'scoringAux',
  'masterData',
  'ai_tasks',
  'routingPolicies',
]

const MODE_ALL_EXTRA = ['orgSettings', 'platformAuditLogs']

function truthy(v) {
  return /^(1|true|yes)$/i.test(String(v || '').trim())
}

function resolveCollections(mode) {
  const m = String(mode || 'ops').trim().toLowerCase()
  if (m === 'leads' || m === 'lead') return ['leads']
  if (m === 'ops') return [...MODE_OPS]
  if (m === 'catalog') return [...MODE_OPS, ...MODE_CATALOG_EXTRA]
  if (m === 'all_data' || m === 'all') return [...MODE_OPS, ...MODE_CATALOG_EXTRA, ...MODE_ALL_EXTRA]
  throw new Error(`WIPE_MODE không hợp lệ: ${mode} (dùng leads | ops | catalog | all_data)`)
}

async function countCollection(db, name, orgId) {
  let q = db.collection(name)
  if (orgId) q = q.where('orgId', '==', orgId)
  try {
    const agg = await q.count().get()
    return agg.data().count
  } catch {
    // Một số collection (kpiDaily parent) hoặc thiếu index orgId — đếm bằng scan.
    return null
  }
}

async function deleteQueryInPages(db, colRef, { orgId, dryRun, label }) {
  let deleted = 0
  let scanned = 0
  let last = null
  /** true = đã fallback scan toàn collection + lọc orgId trên client */
  let clientOrgFilter = false

  for (;;) {
    let snap
    try {
      let q = orgId && !clientOrgFilter
        ? colRef.where('orgId', '==', orgId).orderBy(FieldPath.documentId()).limit(PAGE)
        : colRef.orderBy(FieldPath.documentId()).limit(PAGE)
      if (last) q = q.startAfter(last)
      snap = await q.get()
    } catch (e) {
      if (orgId && !clientOrgFilter) {
        console.warn(`[${label}] query orgId+id lỗi → quét rộng + lọc client:`, e.message || e)
        clientOrgFilter = true
        last = null
        continue
      }
      throw e
    }

    if (snap.empty) break

    const docs =
      orgId && clientOrgFilter
        ? snap.docs.filter((d) => String(d.get('orgId') || '') === orgId)
        : snap.docs

    scanned += snap.docs.length
    last = snap.docs[snap.docs.length - 1]

    if (!docs.length) {
      if (snap.size < PAGE) break
      continue
    }

    if (dryRun) {
      deleted += docs.length
    } else {
      // recursiveDelete: interactions / aiInsightTasks / kpi children…
      for (const d of docs) {
        await db.recursiveDelete(d.ref)
        deleted += 1
        if (deleted % 50 === 0) {
          process.stdout.write(`\r[${label}] đã xóa ${deleted}…`)
        }
      }
    }

    if (snap.size < PAGE) break
  }

  if (!dryRun && deleted) process.stdout.write('\n')
  return { scanned, deleted }
}

async function wipeCollectionGroupOrphans(db, groupId, { dryRun, label }) {
  // Dọn interactions / aiInsightTasks còn sót (collection group).
  let deleted = 0
  let last = null
  for (;;) {
    let q = db.collectionGroup(groupId).orderBy(FieldPath.documentId()).limit(PAGE)
    if (last) q = q.startAfter(last)
    let snap
    try {
      snap = await q.get()
    } catch {
      // thiếu index __name__ trên group — bỏ qua
      console.warn(`[${label}] bỏ qua collectionGroup ${groupId} (có thể cần index).`)
      return deleted
    }
    if (snap.empty) break
    last = snap.docs[snap.docs.length - 1]
    if (dryRun) {
      deleted += snap.size
    } else {
      const batch = db.batch()
      for (const d of snap.docs) batch.delete(d.ref)
      await batch.commit()
      deleted += snap.size
    }
    if (snap.size < PAGE) break
  }
  return deleted
}

async function main() {
  const dryRun = truthy(process.env.WIPE_DRY_RUN)
  const mode = process.env.WIPE_MODE || 'ops'
  const orgId = (process.env.WIPE_ORG_ID || '').trim()
  const includeUsers = truthy(process.env.WIPE_INCLUDE_USERS)
  const confirm = (process.env.WIPE_CONFIRM || '').trim()

  const collections = resolveCollections(mode)
  if (includeUsers) collections.push('users')

  const { db, firestoreDbId } = initFirestoreAdmin()
  const projectHint =
    process.env.GCLOUD_PROJECT ||
    readDotenvValue('VITE_FIREBASE_PROJECT_ID') ||
    '(xem service account)'

  console.log('=== WIPE FIRESTORE ===')
  console.log('project/db :', projectHint, '/', firestoreDbId)
  console.log('mode       :', mode)
  console.log('orgId      :', orgId || '(tất cả org)')
  console.log('collections:', collections.join(', '))
  console.log('dry_run    :', dryRun ? 'YES — chỉ đếm/ước lượng' : 'NO — XÓA THẬT')
  console.log('include_users:', includeUsers ? 'YES' : 'no')

  if (!dryRun && confirm !== 'XOA_HET_DU_LIEU') {
    console.error(`
Chặn an toàn: để xóa thật hãy đặt:
  WIPE_CONFIRM=XOA_HET_DU_LIEU

Gợi ý chạy thử trước:
  WIPE_DRY_RUN=1 node scripts/wipe-firestore-data.mjs
`)
    process.exit(2)
  }

  console.log('\n— Ước lượng (count) —')
  for (const name of collections) {
    const n = await countCollection(db, name, orgId || undefined)
    console.log(`  ${name}: ${n == null ? '?' : n.toLocaleString('vi-VN')}`)
  }

  console.log(dryRun ? '\n— Dry-run scan/xóa giả —' : '\n— Đang xóa —')
  const summary = []

  for (const name of collections) {
    const col = db.collection(name)
    const { scanned, deleted } = await deleteQueryInPages(db, col, {
      orgId: orgId || undefined,
      dryRun,
      label: name,
    })
    summary.push({ name, scanned, deleted })
    console.log(
      `  ${name}: ${dryRun ? 'sẽ xóa ~' : 'đã xóa'} ${deleted.toLocaleString('vi-VN')} (scan ${scanned.toLocaleString('vi-VN')})`,
    )
  }

  // Dọn subcollection sót dưới leads (nếu xóa lead bằng recursiveDelete thường đã sạch)
  if (collections.includes('leads') && !orgId) {
    for (const g of ['interactions', 'aiInsightTasks']) {
      const n = await wipeCollectionGroupOrphans(db, g, { dryRun, label: g })
      if (n) console.log(`  collectionGroup/${g}: ${dryRun ? 'còn ~' : 'dọn'} ${n}`)
    }
  }

  console.log('\n=== XONG ===')
  if (dryRun) {
    console.log('Đây chỉ là dry-run. Chạy lại với WIPE_CONFIRM=XOA_HET_DU_LIEU để xóa thật.')
  } else {
    console.log('Đã xóa xong các collection đã chọn. users/organizations giữ nguyên (trừ khi bật WIPE_INCLUDE_USERS).')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
